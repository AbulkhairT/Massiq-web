import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

async function verifyAuth(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const authHeader  = req.headers.get('authorization') || '';
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

async function getSubscriptionForUser(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !userId) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id,stripe_subscription_id,stripe_price_id,status,updated_at&order=updated_at.desc.nullslast&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

function stripeModeFromKey(secretKey = '') {
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return 'unknown';
}

/** POST /api/stripe/portal */
export async function POST(req) {
  console.info('[billing-portal] request start');

  const userId = await verifyAuth(req);
  if (!userId) {
    const hasToken = !!(req.headers.get('authorization') || '').trim();
    const reason = hasToken ? 'invalid_token' : 'no_token';
    console.warn('[billing-portal] failure reason', reason);
    return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });
  }
  console.info('[billing-portal] user id', userId);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL;
  const stripeMode = stripeModeFromKey(secretKey);
  console.info('[billing-portal] stripe mode', stripeMode);

  if (!secretKey) {
    console.error('[billing-portal] failure reason', 'missing_STRIPE_SECRET_KEY');
    return NextResponse.json({ error: 'Server misconfigured: missing STRIPE_SECRET_KEY' }, { status: 500 });
  }
  if (!appUrl) {
    console.error('[billing-portal] failure reason', 'missing_NEXT_PUBLIC_APP_URL');
    return NextResponse.json({ error: 'Server misconfigured: missing NEXT_PUBLIC_APP_URL' }, { status: 500 });
  }

  let body = {};
  try { body = await req.json(); } catch {}

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
  const sub = await getSubscriptionForUser(userId);
  const customerId = sub?.stripe_customer_id || null;
  console.info('[billing-portal] customer id', customerId || 'none');

  if (!customerId) {
    const reason = 'missing_stripe_customer_id_in_subscriptions';
    console.warn('[billing-portal] failure reason', reason, {
      status: sub?.status || null,
      stripe_subscription_id: sub?.stripe_subscription_id || null,
      requested_customer_id: body?.customerId || null,
    });
    return NextResponse.json({ error: 'No billing profile found yet.' }, { status: 400 });
  }

  if (body?.customerId && body.customerId !== customerId) {
    console.warn('[billing-portal] failure reason', 'customer_id_mismatch', {
      requested_customer_id: body.customerId,
      stored_customer_id: customerId,
    });
    return NextResponse.json({ error: 'Customer mapping mismatch. Please refresh and try again.' }, { status: 403 });
  }

  try {
    await stripe.customers.retrieve(customerId);
  } catch (err) {
    console.error('[billing-portal] failure reason', 'customer_not_found_for_current_key_mode', {
      customer_id: customerId,
      stripe_mode: stripeMode,
      message: err?.message || 'unknown_error',
    });
    return NextResponse.json({ error: 'Stripe customer not found for current billing mode. Check Stripe test/live key alignment.' }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/app?billing_portal_return=1`,
    });
    console.info('[billing-portal] success url returned', session?.url || null);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing-portal] failure reason', err?.message || 'Could not open billing portal');
    return NextResponse.json({ error: err?.message || 'Could not open billing portal' }, { status: 500 });
  }
}
