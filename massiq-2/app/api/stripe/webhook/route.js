import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

// Webhook events we handle
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/**
 * Upsert a subscription row into public.subscriptions using the service role key.
 *
 * The subscriptions table has no UNIQUE constraint on stripe_subscription_id,
 * so we cannot use PostgREST on_conflict. Instead we do an explicit
 * SELECT → PATCH (if found) or POST (if new).
 */
async function upsertSubscription(row) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing');
  }

  const headers = {
    'Content-Type': 'application/json',
    apikey:         serviceKey,
    Authorization:  `Bearer ${serviceKey}`,
    Prefer:         'return=representation',
  };

  // 1. Look up existing row by stripe_subscription_id
  const lookupRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?stripe_subscription_id=eq.${encodeURIComponent(row.stripe_subscription_id)}&select=id&limit=1`,
    { method: 'GET', headers }
  );
  if (!lookupRes.ok) {
    const text = await lookupRes.text().catch(() => '');
    throw new Error(`Supabase lookup failed (${lookupRes.status}): ${text}`);
  }
  const existing = await lookupRes.json().catch(() => []);
  const existingId = Array.isArray(existing) && existing[0]?.id;

  let res;
  if (existingId) {
    // 2a. PATCH the existing row
    res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingId}`,
      { method: 'PATCH', headers, body: JSON.stringify(row) }
    );
  } else {
    // 2b. INSERT a new row
    res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions`,
      { method: 'POST', headers, body: JSON.stringify(row) }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${existingId ? 'patch' : 'insert'} failed (${res.status}): ${text}`);
  }

  return res.json().catch(() => null);
}

/**
 * Resolve user_id from subscription metadata, or fall back to looking up
 * an existing subscriptions row by stripe_customer_id.
 */
async function resolveUserId(subscription) {
  const fromMeta = subscription.metadata?.user_id;
  if (fromMeta) return fromMeta;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${subscription.customer}&select=user_id&limit=1`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.user_id ? rows[0].user_id : null;
  } catch {
    return null;
  }
}

function buildSubscriptionRow(sub, userId) {
  return {
    user_id:                userId,
    stripe_customer_id:     typeof sub.customer === 'string' ? sub.customer : null,
    stripe_subscription_id: sub.id,
    status:                 sub.status,
    price_id:               sub.items?.data?.[0]?.price?.id || null,
    current_period_start:   sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end:     sub.current_period_end
      ? new Date(sub.current_period_end   * 1000).toISOString()
      : null,
    cancel_at_period_end:   sub.cancel_at_period_end ?? false,
    updated_at:             new Date().toISOString(),
  };
}

/**
 * POST /api/stripe/webhook
 *
 * Verifies the Stripe signature and syncs subscription state into Supabase.
 * This is the ONLY place premium entitlement is granted — never from the client.
 */
/** GET /api/stripe/webhook — health-check so the route is never a 404 */
export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/stripe/webhook' });
}

export async function POST(req) {
  console.info('[stripe:webhook] POST received — processing...');

  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('[stripe:webhook] Missing env: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Stripe env vars missing' }, { status: 500 });
  }

  const sig  = req.headers.get('stripe-signature');
  const body = await req.text();

  console.info('[stripe:webhook] sig present:', !!sig, 'body length:', body.length);

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe:webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Silently ack unhandled events — don't fail
  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  console.info(`[stripe:webhook] Processing event: ${event.type} (${event.id})`);

  try {
    if (event.type === 'checkout.session.completed') {
      const checkoutSession = event.data.object;
      const subscriptionId  = checkoutSession.subscription;
      if (!subscriptionId) return NextResponse.json({ received: true });

      // Fetch the full subscription object
      const sub    = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = sub.metadata?.user_id
        || checkoutSession.metadata?.user_id
        || await resolveUserId(sub);

      if (!userId) {
        console.error('[stripe:webhook] Could not resolve user_id for session:', checkoutSession.id);
        return NextResponse.json({ received: true }); // Ack — avoid Stripe retries
      }

      await upsertSubscription(buildSubscriptionRow(sub, userId));
      console.info('[stripe:webhook] checkout.session.completed synced for user:', userId);

    } else {
      // customer.subscription.{created,updated,deleted}
      const sub    = event.data.object;
      const userId = await resolveUserId(sub);

      if (!userId) {
        console.error('[stripe:webhook] Could not resolve user_id for subscription:', sub.id);
        return NextResponse.json({ received: true });
      }

      await upsertSubscription(buildSubscriptionRow(sub, userId));
      console.info(`[stripe:webhook] ${event.type} synced for user:`, userId);
    }
  } catch (err) {
    console.error('[stripe:webhook] Handler error:', err.message);
    // Return 500 so Stripe retries the event
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
