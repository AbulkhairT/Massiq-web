import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

function maskUrl(url) {
  if (!url || typeof url !== 'string') return 'null';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return '[invalid]';
  }
}

/**
 * Atomic upsert via ON CONFLICT on user_id (requires migration 007 unique index).
 * Falls back to SELECT→PATCH/POST for legacy DBs without the index.
 *
 * Only called when subscription status is active or trialing.
 * Never called for incomplete — verify-session is the client-side fallback
 * for confirmed payments, so incomplete should never reach this path.
 */
async function upsertSubscription(supabaseUrl, serviceKey, row) {
  const headers = {
    'Content-Type': 'application/json',
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  // ── Attempt 1: Atomic ON CONFLICT upsert ─────────────────────────────────
  const onConflictRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`,
    {
      method:  'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(row),
    }
  );

  const onConflictText = await onConflictRes.text().catch(() => '');

  if (onConflictRes.ok) {
    let result = null;
    try { result = onConflictText ? JSON.parse(onConflictText) : null; } catch {}
    console.info('[stripe:verify-session] subscription upsert success (ON CONFLICT / atomic)', {
      user_id:              row.user_id,
      status:               row.status,
      stripe_sub_id:        row.stripe_subscription_id,
      db_response_id:       Array.isArray(result) ? result[0]?.id : result?.id,
    });
    return result;
  }

  // ON CONFLICT failed — fall back to SELECT → PATCH/POST
  console.warn('[stripe:verify-session] ON CONFLICT failed — falling back to SELECT→PATCH/POST', {
    status: onConflictRes.status,
    body:   onConflictText.slice(0, 300),
  });
  // ────────────────────────────────────────────────────────────────────────

  // ── Fallback: SELECT → PATCH or POST ────────────────────────────────────
  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&select=id,status&order=updated_at.desc&limit=1`,
    { headers }
  );
  const existingRows = await selectRes.json().catch(() => []);

  let res;
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const existingId = existingRows[0]?.id;
    res = await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingId}`, {
      method:  'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body:    JSON.stringify({
        stripe_customer_id:    row.stripe_customer_id,
        stripe_subscription_id: row.stripe_subscription_id,
        status:                row.status,
        price_id:              row.price_id,
        current_period_start:  row.current_period_start,
        current_period_end:    row.current_period_end,
        cancel_at_period_end:  row.cancel_at_period_end,
        updated_at:            row.updated_at,
        provider:              row.provider,
      }),
    });
  } else {
    res = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method:  'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body:    JSON.stringify(row),
    });
  }

  const resText = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[stripe:verify-session] Supabase upsert failed', {
      status:   res.status,
      user_id:  row.user_id,
      response: resText.slice(0, 500),
    });
    throw new Error(`Subscription write failed (${res.status}): ${resText}`);
  }

  let result = null;
  try { result = resText ? JSON.parse(resText) : null; } catch {}
  console.info('[stripe:verify-session] subscription upsert success (fallback)', {
    user_id:      row.user_id,
    status:       row.status,
    stripe_sub_id: row.stripe_subscription_id,
    method:       Array.isArray(existingRows) && existingRows.length > 0 ? 'PATCH' : 'POST',
  });
  return result;
}

/**
 * POST /api/stripe/verify-session
 *
 * Client-side fallback called immediately after Stripe redirects back to /app.
 * Verifies the checkout session and upserts the subscription into public.subscriptions
 * when status is active or trialing. Acts as a reliable fallback if the webhook
 * hasn't fired or was delayed.
 *
 * Only writes for active/trialing — incomplete means payment hasn't confirmed yet
 * and the webhook will handle it when the payment settles.
 */
export async function POST(req) {
  const secretKey   = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.info('[stripe:verify-session] called', {
    supabase_masked: maskUrl(supabaseUrl),
    has_service_key: !!serviceKey,
  });

  if (!secretKey || !supabaseUrl || !anonKey) {
    console.error('[stripe:verify-session] Missing env vars');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const authHeader  = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let userId;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearerToken}` },
    });
    if (!userRes.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await userRes.json();
    userId = user?.id;
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body      = await req.json().catch(() => ({}));
  const sessionId = body?.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    const sessionUserId = checkoutSession.metadata?.user_id ?? checkoutSession.client_reference_id;
    if (sessionUserId && sessionUserId !== userId) {
      console.warn('[stripe:verify-session] user mismatch', {
        session_user: sessionUserId,
        token_user:   userId,
      });
      return NextResponse.json({ error: 'Session does not match user' }, { status: 403 });
    }

    const subscription = checkoutSession.subscription;
    let subscriptionStatus = null;
    let writeResult = null;

    if (subscription) {
      const sub = typeof subscription === 'object'
        ? subscription
        : await stripe.subscriptions.retrieve(subscription);
      subscriptionStatus = sub.status;

      console.info('[stripe:verify-session] stripe subscription retrieved', {
        session_id:     sessionId,
        user_id:        userId,
        sub_id:         sub.id,
        status:         subscriptionStatus,
        payment_status: checkoutSession.payment_status,
      });

      if (['active', 'trialing'].includes(subscriptionStatus) && serviceKey) {
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const row = {
          user_id:                userId,
          stripe_customer_id:     customerId || null,
          stripe_subscription_id: sub.id,
          status:                 sub.status,
          price_id:               sub.items?.data?.[0]?.price?.id || null,
          current_period_start:   sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
          current_period_end:     sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end:   sub.cancel_at_period_end ?? false,
          updated_at:             new Date().toISOString(),
          provider:               'stripe',
        };

        console.info('[stripe:verify-session] upserting subscription', {
          session_id:        sessionId,
          user_id:           userId,
          status:            row.status,
          stripe_sub_id:     row.stripe_subscription_id,
          stripe_customer_id: row.stripe_customer_id,
        });

        writeResult = await upsertSubscription(supabaseUrl, serviceKey, row);

        console.info('[stripe:verify-session] upsert complete', {
          user_id:         userId,
          status:          row.status,
          premium_decision: 'granted',
          db_result_id:    Array.isArray(writeResult) ? writeResult[0]?.id : writeResult?.id,
        });
      } else if (!serviceKey) {
        console.warn('[stripe:verify-session] SUPABASE_SERVICE_ROLE_KEY missing — cannot write subscription');
      } else {
        // Subscription is not yet active (e.g. still incomplete). Webhook will handle it.
        console.info('[stripe:verify-session] subscription not yet active — skipping write', {
          user_id:  userId,
          status:   subscriptionStatus,
          premium_decision: 'not_granted',
        });
      }
    } else {
      console.warn('[stripe:verify-session] no subscription on checkout session', {
        session_id: sessionId,
        user_id:    userId,
      });
    }

    console.info('[stripe:verify-session] verified', {
      session_id:          sessionId,
      user_id:             userId,
      payment_status:      checkoutSession.payment_status,
      subscription_status: subscriptionStatus,
      premium_decision:    ['active', 'trialing'].includes(subscriptionStatus || '') ? 'granted' : 'not_granted',
    });

    return NextResponse.json({
      ok:                  true,
      payment_status:      checkoutSession.payment_status,
      subscription_status: subscriptionStatus,
    });
  } catch (err) {
    console.error('[stripe:verify-session] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to verify session' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok:                  true,
    route:               '/api/stripe/verify-session',
    supabase_url_masked: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_stripe_key:      !!process.env.STRIPE_SECRET_KEY,
    has_service_key:     !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
