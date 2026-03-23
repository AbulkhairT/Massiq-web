import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

function maskUrl(url) {
  if (!url || typeof url !== 'string') return 'null';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname ? '[path]' : ''}`;
  } catch {
    return '[invalid]';
  }
}

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

async function insertBillingEvent(stripeEventId, eventType, payload, userId = null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase config');

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

/**
 * Upsert subscription: SELECT by user_id, then PATCH or POST.
 * More reliable than on_conflict when PostgREST behavior varies.
 */
async function upsertSubscription(row) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing');
  }

  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const incomingStatus = String(row.status || '').toLowerCase();
  const incomingIncomplete = incomingStatus === 'incomplete' || incomingStatus === 'incomplete_expired';

  if (incomingIncomplete) {
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&select=status,stripe_subscription_id&limit=1`,
      { headers }
    );
    const existing = await checkRes.json().catch(() => []);
    const canonical = Array.isArray(existing) && existing[0];
    const canonicalActive = canonical && ['active', 'trialing'].includes(String(canonical.status || '').toLowerCase());
    const differentSub = canonical?.stripe_subscription_id && row.stripe_subscription_id
      && canonical.stripe_subscription_id !== row.stripe_subscription_id;
    if (canonicalActive && differentSub) {
      console.info('[stripe:webhook] Ignoring incomplete shadow subscription', { user_id: row.user_id });
      return null;
    }
  }

  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&select=id&limit=1`,
    { headers }
  );
  const existingRows = await selectRes.json().catch(() => []);

  let res;
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const existingId = existingRows[0]?.id;
    res = await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingId}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        stripe_customer_id: row.stripe_customer_id,
        stripe_subscription_id: row.stripe_subscription_id,
        status: row.status,
        price_id: row.price_id,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end,
        updated_at: row.updated_at,
      }),
    });
  } else {
    res = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
  }

  const resText = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[stripe:webhook] Supabase upsert failed', {
      status: res.status,
      user_id: row.user_id,
      stripe_subscription_id: row.stripe_subscription_id,
      response: resText.slice(0, 500),
    });
    throw new Error(`Supabase subscription write failed (${res.status}): ${resText}`);
  }

  const result = resText ? JSON.parse(resText) : null;
  console.info('[stripe:webhook] subscription upsert success', {
    user_id: row.user_id,
    status: row.status,
    stripe_subscription_id: row.stripe_subscription_id,
    method: existingRows?.length ? 'PATCH' : 'POST',
  });
  return result;
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
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null);
  return {
    user_id: userId,
    stripe_customer_id: customerId,
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
  return NextResponse.json({
    ok: true,
    route: '/api/stripe/webhook',
    supabase_url_masked: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });
}

export async function POST(req) {
  console.info('[stripe:webhook] POST received', {
    supabase_masked: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('[stripe:webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
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

  console.info('[stripe:webhook] event', {
    type: event.type,
    id: event.id,
    data_object_id: event.data?.object?.id,
  });

  const alreadyProcessed = await isEventProcessed(event.id);
  if (alreadyProcessed) {
    console.info('[stripe:webhook] already processed (idempotent)', event.id);
    return NextResponse.json({ received: true });
  }

  const payload = {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    created: event.created,
    data: event.data,
  };

  let userId = null;
  const obj = event.data?.object;
  if (obj) {
    userId = obj.metadata?.user_id ?? obj.client_reference_id ?? null;
  }

  // Billing events: non-blocking — never fail webhook for audit table issues
  try {
    await insertBillingEvent(event.id, event.type, payload, userId);
  } catch (e) {
    console.error('[stripe:webhook] billing_events insert failed (non-blocking):', e?.message);
  }

  // Process subscription — this is the critical path
  try {
    if (event.type === 'checkout.session.completed') {
      const checkoutSession = event.data.object;
      const subscriptionId = checkoutSession.subscription;
      userId = checkoutSession.metadata?.user_id ?? checkoutSession.client_reference_id ?? null;

      console.info('[stripe:webhook] checkout.session.completed', {
        session_id: checkoutSession.id,
        stripe_customer_id: checkoutSession.customer,
        stripe_subscription_id: subscriptionId,
        metadata_user_id: checkoutSession.metadata?.user_id,
        client_reference_id: checkoutSession.client_reference_id,
        mapped_user_id: userId,
      });

      if (!subscriptionId) {
        console.warn('[stripe:webhook] No subscription id in checkout session', checkoutSession.id);
        return NextResponse.json({ received: true });
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      userId = userId || sub.metadata?.user_id || (await resolveUserId(sub));

      if (!userId) {
        console.error('[stripe:webhook] Cannot resolve user_id — subscription NOT written', {
          session_id: checkoutSession.id,
          customer: checkoutSession.customer,
        });
        return NextResponse.json({ received: true });
      }

      const row = buildSubscriptionRow(sub, userId);
      console.info('[stripe:webhook] upsert payload', { user_id: userId, status: row.status, stripe_sub_id: row.stripe_subscription_id });
      await upsertSubscription(row);

    } else if (HANDLED_EVENTS.has(event.type) && event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object;
      userId = sub.metadata?.user_id || (await resolveUserId(sub));

      console.info(`[stripe:webhook] ${event.type}`, {
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        status: sub.status,
        mapped_user_id: userId,
      });

      if (userId) {
        const row = buildSubscriptionRow(sub, userId);
        await upsertSubscription(row);
      } else {
        console.error('[stripe:webhook] Cannot resolve user_id for subscription', { sub_id: sub.id, customer: sub.customer });
      }
    }
  } catch (err) {
    console.error('[stripe:webhook] Handler error:', err?.message, err?.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
