import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

function bad(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session in subscription mode.
 * User identity is verified from the Authorization Bearer token — never trusted from the request body.
 * Premium is NEVER granted from this endpoint; entitlement comes from the webhook.
 */
export async function POST(req) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId   = process.env.STRIPE_PRICE_ID;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL;

  if (!secretKey) return bad('Server misconfigured', 500);
  if (!priceId)   return bad('Server misconfigured', 500);
  if (!appUrl)    return bad('Server misconfigured', 500);

  // ── Verify authentication via Bearer token ──────────────────────────────
  // Never trust userId from the request body — extract it from the verified session.
  const authHeader  = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!bearerToken) {
    return bad('Sign in to continue', 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return bad('Server misconfigured', 500);
  }

  let userId;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey:        anonKey,
        Authorization: `Bearer ${bearerToken}`,
      },
    });
    if (!userRes.ok) {
      return bad('Sign in to continue', 401);
    }
    const user = await userRes.json();
    userId = user?.id;
    if (!userId || typeof userId !== 'string') {
      return bad('Sign in to continue', 401);
    }
  } catch {
    return bad('Sign in to continue', 401);
  }
  // ────────────────────────────────────────────────────────────────────────

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/billing/cancel`,
      metadata:    { user_id: userId },
      subscription_data: {
        metadata: { user_id: userId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe:checkout] Session creation failed:', err.message);
    return bad('Could not start checkout. Please try again.', 500);
  }
}
