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
 * Insert billing event for audit. Every received webhook event is persisted.
 * Throws on failure so we do not silently skip; caller may choose to log and continue.
 */
async function insertBillingEvent(eventType, data) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase config for billing_events');
  const res = await fetch(`${supabaseUrl}/rest/v1/billing_events`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      apikey:          serviceKey,
      Authorization:   `Bearer ${serviceKey}`,
      Prefer:          'return=minimal',
    },
    body: JSON.stringify({ event_type: eventType, data: data ?? null }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`billing_events insert failed (${res.status}): ${text}`);
  }
}

/**
 * Upsert the canonical (single) subscription row per user_id.
 * Uses ON CONFLICT (user_id) DO UPDATE — one row per user.
 */
async function upsertSubscription(row) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing');
  }

  const incomingStatus = String(row.status || '').toLowerCase();
  const incomingIncomplete = incomingStatus === 'incomplete' || incomingStatus === 'incomplete_expired';

  if (incomingIncomplete) {
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&select=status,stripe_subscription_id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const existing = await checkRes.json().catch(() => []);
    const canonical = Array.isArray(existing) && existing[0];
    const canonicalActive = canonical && ['active', 'trialing'].includes(String(canonical.status || '').toLowerCase());
    const differentSub = canonical?.stripe_subscription_id && row.stripe_subscription_id
      && canonical.stripe_subscription_id !== row.stripe_subscription_id;
    if (canonicalActive && differentSub) {
      console.info('[stripe:webhook] Ignoring incomplete shadow subscription for active user', { user_id: row.user_id });
      return null;
    }
  }

  const headers = {
    'Content-Type':  'application/json',
    apikey:          serviceKey,
    Authorization:   `Bearer ${serviceKey}`,
    Prefer:          'resolution=merge-duplicates,return=representation',
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`, {
    method: 'POST',
    headers,
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase subscription upsert failed (${res.status}): ${text}`);
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
      `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${subscription.customer}&select=user_id,updated_at&order=updated_at.desc&limit=1`,
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

  // Persist EVERY received event into billing_events for audit trail
  try {
    await insertBillingEvent(event.type, {
      id: event.id,
      livemode: event.livemode,
      created: event.created,
      data_object_id: event.data?.object?.id,
      data_object: typeof event.data?.object === 'object'
        ? { id: event.data.object.id, customer: event.data.object.customer, status: event.data.object.status }
        : null,
    });
  } catch (e) {
    console.error('[stripe:webhook] billing_events insert failed (non-fatal):', e?.message);
    // Continue processing — do not fail webhook for audit table issues
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
