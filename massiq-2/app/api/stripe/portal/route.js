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

async function getCustomerIdForUser(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0 ? rows[0].stripe_customer_id || null : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session so users can manage billing,
 * update payment methods, and cancel subscriptions self-serve.
 *
 * Security:
 *   - Requires valid Bearer token (Supabase JWT)
 *   - Verifies requested customerId belongs to the authenticated user
 *     by comparing against stripe_customer_id in public.subscriptions
 */
export async function POST(req) {
  // ── Auth gate ────────────────────────────────────────────────────────────
  const userId = await verifyAuth(req);
  if (!userId) {
    const hasToken = !!(req.headers.get('authorization') || '').trim();
    console.warn('[stripe:portal] auth:failed', { reason: hasToken ? 'invalid_token' : 'no_token' });
    return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });
  }
  console.info('[stripe:portal] auth:ok', { user_id: userId });
  // ────────────────────────────────────────────────────────────────────────

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL;

  if (!secretKey) {
    console.error('[stripe:portal] config:missing STRIPE_SECRET_KEY');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!appUrl) {
    console.error('[stripe:portal] config:missing NEXT_PUBLIC_APP_URL');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { customerId } = body || {};
  if (!customerId || typeof customerId !== 'string') {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }

  // ── Ownership check: verify customerId belongs to the authenticated user ──
  const storedCustomerId = await getCustomerIdForUser(userId);
  if (!storedCustomerId || storedCustomerId !== customerId) {
    console.warn('[stripe:portal] ownership:mismatch', {
      user_id: userId,
      requested_customer_id: customerId,
      stored_customer_id: storedCustomerId || 'none',
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ────────────────────────────────────────────────────────────────────────

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${appUrl}/app`,
    });
    console.info('[stripe:portal] session:created', { user_id: userId, customer_id: customerId });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe:portal] session:failed', { user_id: userId, customer_id: customerId, reason: err.message });
    return NextResponse.json({ error: err.message || 'Could not open billing portal' }, { status: 500 });
  }
}
