import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/**
 * Check if we've already processed this event (idempotency).
 * Requires migration 010 (stripe_event_id column). Without it, returns false.
 */
async function isEventProcessed(stripeEventId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/billing_events?stripe_event_id=eq.${encodeURIComponent(stripeEventId)}&select=id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Insert billing event. Uses stripe_event_id for idempotency (after migration 010).
 * Falls back to event_type + data only for pre-migration schema.
 */
async function insertBillingEvent(stripeEventId, eventType, payload, userId = null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase config for billing_events');

  const row = {
    stripe_event_id: stripeEventId,
    event_type: eventType,
    data: payload,
    user_id: userId || null,
  };

  let res = await fetch(`${supabaseUrl}/rest/v1/billing_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 400 && (text.includes('stripe_event_id') || text.includes('column'))) {
      res = await fetch(`${supabaseUrl}/rest/v1/billing_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ event_type: eventType, data: payload }),
      });
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`billing_events insert failed (${res.status}): ${errText}`);
    }
  }
}

async function upsertSubscription(row) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
      console.log('[stripe:webhook] Ignoring incomplete shadow subscription for active user', { user_id: row.user_id });
      return null;
    }
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase subscription upsert failed (${res.status}): ${text}`);
  }

  return res.json().catch(() => null);
}

async function resolveUserId(subscription) {
  const fromMeta = subscription.metadata?.user_id;
  if (fromMeta) return fromMeta;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${subscription.customer}&select=user_id&order=updated_at.desc&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.user_id ? rows[0].user_id : null;
  } catch {
    return null;
  }
}

function buildSubscriptionRow(sub, userId) {
  return {
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: sub.items?.data?.[0]?.price?.id || null,
    current_period_start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/stripe/webhook' });
}

export async function POST(req) {
  console.log('[stripe:webhook] POST received');

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('[stripe:webhook] Missing env: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Stripe env vars missing' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    console.error('[stripe:webhook] No stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe:webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[stripe:webhook] Webhook event:', event.type, event.id);

  // Idempotency: skip if already processed
  const alreadyProcessed = await isEventProcessed(event.id);
  if (alreadyProcessed) {
    console.log('[stripe:webhook] Event already processed (idempotent), skipping', event.id);
    return NextResponse.json({ received: true });
  }

  const payload = {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    created: event.created,
    data: event.data,
  };

  // Extract user_id early for billing_events (from metadata when available)
  let userId = null;
  const obj = event.data?.object;
  if (obj) {
    userId = obj.metadata?.user_id || null;
  }

  // 1. Insert billing_events FIRST (audit + idempotency guard)
  try {
    await insertBillingEvent(event.id, event.type, payload, userId);
  } catch (e) {
    if (e?.message?.includes('duplicate') || e?.message?.includes('unique')) {
      console.log('[stripe:webhook] Duplicate event (concurrent), skipping', event.id);
      return NextResponse.json({ received: true });
    }
    console.error('[stripe:webhook] billing_events insert failed:', e?.message);
    return NextResponse.json({ error: 'Audit insert failed' }, { status: 500 });
  }

  // 2. Process subscription events
  try {
    if (event.type === 'checkout.session.completed') {
      const checkoutSession = event.data.object;
      const subscriptionId = checkoutSession.subscription;
      userId = checkoutSession.metadata?.user_id || checkoutSession.client_reference_id || null;

      console.info('[stripe:webhook] checkout.session.completed', {
        session_id: checkoutSession.id,
        stripe_customer_id: checkoutSession.customer,
        stripe_subscription_id: subscriptionId,
        user_id_from_metadata: checkoutSession.metadata?.user_id,
        user_id_from_client_ref: checkoutSession.client_reference_id,
      });

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        userId = userId || sub.metadata?.user_id || (await resolveUserId(sub));

        if (userId) {
          const row = buildSubscriptionRow(sub, userId);
          const result = await upsertSubscription(row);
          console.info('[stripe:webhook] subscription upsert ok', {
            user_id: userId,
            status: row.status,
            stripe_subscription_id: row.stripe_subscription_id,
          });
        } else {
          console.error('[stripe:webhook] Could not resolve user_id', {
            session_id: checkoutSession.id,
            customer: checkoutSession.customer,
          });
        }
      }
    } else if (HANDLED_EVENTS.has(event.type) && event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object;
      userId = sub.metadata?.user_id || (await resolveUserId(sub));

      console.info(`[stripe:webhook] ${event.type}`, {
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        status: sub.status,
        user_id: userId,
      });

      if (userId) {
        const row = buildSubscriptionRow(sub, userId);
        await upsertSubscription(row);
        console.info(`[stripe:webhook] subscription upsert ok`, {
          user_id: userId,
          status: row.status,
        });
      } else {
        console.error('[stripe:webhook] Could not resolve user_id', { sub_id: sub.id, customer: sub.customer });
      }
    }
  } catch (err) {
    console.error('[stripe:webhook] Handler error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
