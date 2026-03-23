import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * POST /api/stripe/verify-session
 * Verifies a Stripe checkout session after redirect. Used when user returns to /app?checkout_success=1&session_id=...
 * Ensures subscription is synced before app shows premium state.
 */
export async function POST(req) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

    if (checkoutSession.customer_details?.email && checkoutSession.client_reference_id !== userId && checkoutSession.metadata?.user_id !== userId) {
      console.warn('[stripe:verify-session] session user mismatch', {
        session_id: sessionId,
        client_ref: checkoutSession.client_reference_id,
        meta_user: checkoutSession.metadata?.user_id,
        token_user: userId,
      });
      return NextResponse.json({ error: 'Session does not match user' }, { status: 403 });
    }

    const status = checkoutSession.payment_status;
    const subscription = checkoutSession.subscription;
    let subscriptionStatus = null;

    if (subscription) {
      const sub = typeof subscription === 'object' ? subscription : await stripe.subscriptions.retrieve(subscription);
      subscriptionStatus = sub.status;
    }

    console.info('[stripe:verify-session] verified', {
      session_id: sessionId,
      user_id: userId,
      payment_status: status,
      subscription_status: subscriptionStatus,
    });

    return NextResponse.json({
      ok: true,
      payment_status: status,
      subscription_status: subscriptionStatus,
    });
  } catch (err) {
    console.error('[stripe:verify-session] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to verify session' }, { status: 500 });
  }
}
