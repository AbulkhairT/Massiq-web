import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session so users can manage billing,
 * update payment methods, and cancel subscriptions self-serve.
 * Requires { customerId } in the request body.
 */
export async function POST(req) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL;

  if (!secretKey) {
    console.error('[stripe:portal] STRIPE_SECRET_KEY missing');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!appUrl) {
    console.error('[stripe:portal] NEXT_PUBLIC_APP_URL missing');
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

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${appUrl}/app`,
    });
    console.info('[stripe:portal] Portal session created for customer:', customerId);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe:portal] Failed to create portal session:', err.message);
    return NextResponse.json({ error: err.message || 'Could not open billing portal' }, { status: 500 });
  }
}
