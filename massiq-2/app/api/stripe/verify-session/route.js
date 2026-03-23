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
 * Upsert subscription into public.subscriptions.
 * Used by verify-session as fallback when webhook hasn't run or failed.
 */
async function upsertSubscription(supabaseUrl, serviceKey, row) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&select=id&limit=1`,
    { headers }
  );
  const existingRows = await selectRes.json().catch(() => []);

  let res;
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const existingId = existingRows[0]?.id;
    res = await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingId}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        stripe_customer_id: row.stripe_customer_id,
        stripe_subscription_id: row.stripe_subscription_id,
        status: row.status,
        price_id: row.price_id,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end,
        updated_at: row.updated_at,
      }),
    });
  } else {
    res = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
  }

  const resText = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[stripe:verify-session] Supabase upsert failed', {
      status: res.status,
      user_id: row.user_id,
      response: resText.slice(0, 500),
    });
    throw new Error(`Subscription write failed (${res.status})`);
  }

  return resText ? JSON.parse(resText) : null;
}

/**
 * POST /api/stripe/verify-session
 * Verifies checkout session and UPSERTS subscription into public.subscriptions when active/trialing.
 * This is the fallback when webhook hasn't run or failed.
 */
export async function POST(req) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.info('[stripe:verify-session] called', {
    supabase_masked: maskUrl(supabaseUrl),
    has_service_key: !!serviceKey,
  });

  if (!secretKey || !supabaseUrl || !anonKey) {
    console.error('[stripe:verify-session] Missing env');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
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

  const body = await req.json().catch(() => ({}));
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
        token_user: userId,
      });
      return NextResponse.json({ error: 'Session does not match user' }, { status: 403 });
    }

    const subscription = checkoutSession.subscription;
    let subscriptionStatus = null;

    if (subscription) {
      const sub = typeof subscription === 'object' ? subscription : await stripe.subscriptions.retrieve(subscription);
      subscriptionStatus = sub.status;

      if (['active', 'trialing'].includes(subscriptionStatus) && serviceKey) {
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const row = {
          user_id: userId,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: sub.id,
          status: sub.status,
          price_id: sub.items?.data?.[0]?.price?.id || null,
          current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        };

        console.info('[stripe:verify-session] upserting subscription', {
          user_id: userId,
          status: row.status,
          stripe_sub_id: row.stripe_subscription_id,
        });

        const result = await upsertSubscription(supabaseUrl, serviceKey, row);
        console.info('[stripe:verify-session] upsert success', { user_id: userId });
      }
    }

    console.info('[stripe:verify-session] verified', {
      session_id: sessionId,
      user_id: userId,
      payment_status: checkoutSession.payment_status,
      subscription_status: subscriptionStatus,
    });

    return NextResponse.json({
      ok: true,
      payment_status: checkoutSession.payment_status,
      subscription_status: subscriptionStatus,
    });
  } catch (err) {
    console.error('[stripe:verify-session] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to verify session' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/stripe/verify-session',
    supabase_url_masked: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_stripe_key: !!process.env.STRIPE_SECRET_KEY,
    has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
