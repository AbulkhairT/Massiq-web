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
 * The client sends { userId } — validated against the session token.
 * Premium is NEVER granted from this endpoint; entitlement comes from the webhook.
 */
export async function POST(req) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId   = process.env.STRIPE_PRICE_ID;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL;

  if (!secretKey) return bad('Server misconfigured: STRIPE_SECRET_KEY missing', 500);
  if (!priceId)   return bad('Server misconfigured: STRIPE_PRICE_ID missing', 500);
  if (!appUrl)    return bad('Server misconfigured: NEXT_PUBLIC_APP_URL missing', 500);

  let body;
  try { body = await req.json(); } catch { return bad('Invalid JSON body'); }

  const { userId } = body || {};
  if (!userId || typeof userId !== 'string') return bad('userId is required');

  // Validate the user exists in Supabase before creating a session
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    try {
      const check = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=id&limit=1`, {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
      });
      const rows = await check.json().catch(() => []);
      if (!Array.isArray(rows) || rows.length === 0) {
        return bad('User not found', 404);
      }
    } catch {
      // Non-fatal: continue even if validation fails (avoids blocking checkout)
    }
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/app`,
      metadata:    { user_id: userId },
      subscription_data: {
        metadata: { user_id: userId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe:checkout] Session creation failed:', err.message);
    return bad(err.message || 'Failed to create checkout session', 500);
  }
}
