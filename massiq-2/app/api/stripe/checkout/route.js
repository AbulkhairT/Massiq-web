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

  // Use client's current origin for return URLs — CRITICAL for session persistence.
  // Stripe redirects back here; localStorage is origin-scoped. If we redirect to a different
  // origin (e.g. www vs apex), the user's session won't exist → perceived logout.
  let baseUrl = appUrl;
  try {
    const body = await req.json().catch(() => ({}));
    const origin = body?.return_origin;
    if (origin && typeof origin === 'string') {
      const u = new URL(origin);
      const appHost = new URL(appUrl).hostname;
      const oHost = u.hostname;
      const sameHost = oHost === appHost;
      const wwwVariant = oHost === `www.${appHost}` || appHost === `www.${oHost}`;
      const isLocal = oHost === 'localhost' || oHost === '127.0.0.1' || oHost.endsWith('.localhost');
      const bothVercel = appHost.endsWith('.vercel.app') && oHost.endsWith('.vercel.app');
      const sameRoot = bothVercel || oHost.endsWith(`.${appHost}`) || appHost.endsWith(`.${oHost}`);
      if (sameHost || wwwVariant || isLocal || sameRoot) {
        baseUrl = origin.replace(/\/$/, '');
        console.info('[stripe:checkout] success_url origin from client', { baseUrl, appUrl });
      }
    }
  } catch {}

  // Return directly to /app so user lands in authenticated app; checkout_success triggers sync
  const successUrl = `${baseUrl}/app?checkout_success=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/app`;
  console.info('[stripe:checkout] session created', {
    success_url: successUrl,
    cancel_url: cancelUrl,
    user_id: userId,
    base_from: baseUrl === appUrl ? 'NEXT_PUBLIC_APP_URL' : 'return_origin',
  });

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  // Reuse existing Stripe customer — one per user (avoid duplication)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let existingCustomerId = null;
  if (serviceKey && supabaseUrl) {
    try {
      const subRes = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id&order=updated_at.desc`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const rows = await subRes.json().catch(() => []);
      const row = Array.isArray(rows) ? rows.find(r => r?.stripe_customer_id) : null;
      existingCustomerId = row?.stripe_customer_id || null;
    } catch {}
  }

  try {
    const sessionParams = {
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url:  cancelUrl,
      client_reference_id:  userId,
      metadata:             { user_id: userId },
      subscription_data:    {
        metadata: { user_id: userId },
      },
    };
    if (existingCustomerId) {
      sessionParams.customer = existingCustomerId;
    }
    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe:checkout] Session creation failed:', err.message);
    return bad('Could not start checkout. Please try again.', 500);
  }
}
