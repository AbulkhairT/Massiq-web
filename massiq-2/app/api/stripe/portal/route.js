import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

async function verifyAuth(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user.id : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session. Subscription row and stripe_customer_id
 * are loaded server-side (do not trust client-supplied customer ids).
 */
export async function POST(req) {
  const userId = await verifyAuth(req);
  if (!userId) {
    const hasToken = !!(req.headers.get('authorization') || '').trim();
    console.warn('[stripe:portal] auth:failed', { reason: hasToken ? 'invalid_token' : 'no_token' });
    return NextResponse.json({ error: 'Sign in to continue', code: 'unauthorized' }, { status: 401 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    console.error('[stripe:portal] config:missing STRIPE_SECRET_KEY');
    return NextResponse.json({ error: 'Server misconfigured', code: 'missing_stripe_key' }, { status: 500 });
  }
  if (!appUrl) {
    console.error('[stripe:portal] config:missing NEXT_PUBLIC_APP_URL');
    return NextResponse.json({ error: 'Server misconfigured', code: 'missing_app_url' }, { status: 500 });
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('[stripe:portal] config:missing Supabase service configuration');
    return NextResponse.json({ error: 'Server misconfigured', code: 'missing_supabase' }, { status: 500 });
  }

  let subRow = null;
  try {
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=id,status,stripe_customer_id,stripe_subscription_id,updated_at&order=updated_at.desc&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (subRes.ok) {
      const rows = await subRes.json().catch(() => []);
      subRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
    } else {
      const t = await subRes.text().catch(() => '');
      console.error('[stripe:portal] subscription fetch failed', { status: subRes.status, body: t.slice(0, 300) });
    }
  } catch (e) {
    console.error('[stripe:portal] subscription fetch error', e?.message);
  }

  console.info('[stripe:portal] subscription row', {
    user_id: userId,
    status: subRow?.status ?? null,
    stripe_customer_id: subRow?.stripe_customer_id ?? null,
    stripe_subscription_id: subRow?.stripe_subscription_id ?? null,
  });

  if (!subRow) {
    return NextResponse.json(
      {
        error: 'No subscription on file. If you just upgraded, wait a moment and try again.',
        code: 'no_subscription',
      },
      { status: 400 },
    );
  }

  const st = String(subRow.status || '').toLowerCase();
  if (!['active', 'trialing'].includes(st)) {
    return NextResponse.json(
      {
        error: `Subscription is not active (${subRow.status}).`,
        code: 'subscription_inactive',
        status: subRow.status,
      },
      { status: 400 },
    );
  }

  const customerId = subRow.stripe_customer_id;
  if (!customerId || typeof customerId !== 'string') {
    console.error(
      '[stripe:portal] ROOT CAUSE: stripe_customer_id is null in public.subscriptions — cannot open billing portal',
      { user_id: userId, subscription_row_id: subRow.id },
    );
    return NextResponse.json(
      {
        error:
          'Billing is not fully linked to your account yet. Try signing out and back in, or contact support.',
        code: 'missing_stripe_customer',
      },
      { status: 400 },
    );
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${String(appUrl).replace(/\/$/, '')}/app`,
    });
    console.info('[stripe:portal] session:created', {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subRow.stripe_subscription_id ?? null,
    });
    return NextResponse.json({
      url: session.url,
      stripe_customer_id: customerId,
    });
  } catch (err) {
    console.error('[stripe:portal] session:failed', {
      user_id: userId,
      stripe_customer_id: customerId,
      reason: err.message,
    });
    return NextResponse.json(
      { error: err.message || 'Could not open billing portal', code: 'portal_session_failed' },
      { status: 500 },
    );
  }
}
