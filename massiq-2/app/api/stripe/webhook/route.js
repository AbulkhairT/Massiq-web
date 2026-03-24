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

/**
 * Idempotency check: returns true if this stripe_event_id was ALREADY fully processed.
 * We only write to billing_events AFTER a successful subscription write, so if the
 * event is in billing_events it means the subscription write succeeded. If billing_events
 * insert was never reached (e.g. subscription write failed), the event is not marked
 * processed and Stripe can retry it.
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
 * Audit log insert — called AFTER successful subscription write.
 * Non-blocking: never throws, never blocks subscription persistence.
 * If stripe_event_id column doesn't exist (migration 010 not applied), falls back
 * to insert without it (idempotency degrades gracefully — subscription writes are
 * still idempotent via SELECT→PATCH/POST logic).
 */
async function insertBillingEvent(stripeEventId, eventType, payload, userId = null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return; // non-throwing

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
    // Fallback: if stripe_event_id or user_id columns don't exist yet (pre-migration), omit them
    if (res.status === 400 && (text.includes('stripe_event_id') || text.includes('user_id') || text.includes('column'))) {
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
      console.warn('[stripe:webhook] billing_events insert failed (non-fatal):', res.status, errText.slice(0, 200));
    }
  }
}

/**
 * Upsert subscription — atomic, idempotent, race-safe.
 *
 * Strategy:
 *  1. For incomplete/incomplete_expired incoming status: guard-check first.
 *     Never overwrite an active/trialing row with incomplete.
 *  2. For all statuses: try atomic ON CONFLICT upsert on user_id.
 *     Requires migration 007 unique index on subscriptions(user_id).
 *  3. Fallback: if ON CONFLICT fails (migration 007 not applied), use
 *     SELECT → PATCH/POST. This path is not race-safe but handles legacy DBs.
 *
 * IMPORTANT: This function throws on unrecoverable DB errors.
 * The caller (POST handler) must return 500 so Stripe retries.
 * billing_events is written by the caller AFTER this succeeds.
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

  // ── Incomplete guard ─────────────────────────────────────────────────────
  // Stripe fires customer.subscription.created with status=incomplete BEFORE
  // payment is captured. Never let this overwrite an already-active subscription.
  const incomingStatus = String(row.status || '').toLowerCase();
  const incomingIncomplete = incomingStatus === 'incomplete' || incomingStatus === 'incomplete_expired';

  if (incomingIncomplete) {
    // Fetch only active/trialing rows — the check we care about
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&status=in.(active,trialing)&select=id,status&limit=1`,
      { headers }
    );
    const active = await checkRes.json().catch(() => []);
    if (Array.isArray(active) && active.length > 0) {
      console.info('[stripe:webhook] incomplete guard: skipping — user has active/trialing', {
        user_id: row.user_id,
        existing_status: active[0].status,
        incoming_status: incomingStatus,
        incoming_stripe_sub_id: row.stripe_subscription_id,
      });
      return null; // skip — do NOT write incomplete over active
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── Attempt 1: Atomic ON CONFLICT upsert ────────────────────────────────
  // Requires migration 007: UNIQUE INDEX on subscriptions(user_id).
  // This is race-safe: concurrent events for the same user resolve correctly
  // via PostgreSQL's INSERT ... ON CONFLICT DO UPDATE.
  const onConflictRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    }
  );

  const onConflictText = await onConflictRes.text().catch(() => '');

  if (onConflictRes.ok) {
    let result = null;
    try { result = onConflictText ? JSON.parse(onConflictText) : null; } catch {}
    console.info('[stripe:webhook] subscription upsert success (ON CONFLICT / atomic)', {
      user_id: row.user_id,
      status: row.status,
      stripe_subscription_id: row.stripe_subscription_id,
      db_response_id: Array.isArray(result) ? result[0]?.id : result?.id,
    });
    return result;
  }

  // ON CONFLICT failed — log and fall through to SELECT→PATCH/POST fallback.
  // Common reason: migration 007 not applied (no unique index on user_id).
  console.warn('[stripe:webhook] ON CONFLICT upsert failed — falling back to SELECT→PATCH/POST', {
    status: onConflictRes.status,
    body: onConflictText.slice(0, 300),
    user_id: row.user_id,
    stripe_subscription_id: row.stripe_subscription_id,
  });
  // ────────────────────────────────────────────────────────────────────────

  // ── Fallback: SELECT → PATCH or POST ────────────────────────────────────
  // Not race-safe for concurrent events, but handles DBs without migration 007.
  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${row.user_id}&select=id,status&order=updated_at.desc&limit=1`,
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
        stripe_customer_id:    row.stripe_customer_id,
        stripe_subscription_id: row.stripe_subscription_id,
        status:                row.status,
        price_id:              row.price_id,
        current_period_start:  row.current_period_start,
        current_period_end:    row.current_period_end,
        cancel_at_period_end:  row.cancel_at_period_end,
        updated_at:            row.updated_at,
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
    console.error('[stripe:webhook] Supabase upsert failed (fallback)', {
      status: res.status,
      user_id: row.user_id,
      stripe_subscription_id: row.stripe_subscription_id,
      response: resText.slice(0, 500),
    });
    throw new Error(`Supabase subscription write failed (${res.status}): ${resText}`);
  }

  let result = null;
  try { result = resText ? JSON.parse(resText) : null; } catch {}
  console.info('[stripe:webhook] subscription upsert success (fallback SELECT→PATCH/POST)', {
    user_id: row.user_id,
    status: row.status,
    stripe_subscription_id: row.stripe_subscription_id,
    method: Array.isArray(existingRows) && existingRows.length > 0 ? 'PATCH' : 'POST',
    db_response_id: result?.[0]?.id ?? result?.id ?? null,
  });
  return result;
  // ────────────────────────────────────────────────────────────────────────
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
    user_id:                userId,
    stripe_customer_id:     customerId,
    stripe_subscription_id: sub.id,
    status:                 sub.status,
    price_id:               sub.items?.data?.[0]?.price?.id || null,
    current_period_start:   sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end:     sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end:   sub.cancel_at_period_end ?? false,
    updated_at:             new Date().toISOString(),
    // provider is always 'stripe' for webhook-sourced rows
    provider:               'stripe',
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
  console.info('[billing:webhook] POST received', {
    supabase_masked: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  console.info('[stripe:webhook] POST received', {
    supabase_masked: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const secretKey    = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('[stripe:webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Stripe env vars missing' }, { status: 500 });
  }

  const sig  = req.headers.get('stripe-signature');
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

  const obj = event.data?.object;
  console.info('[stripe:webhook] event received', {
    event_type:            event.type,
    event_id:              event.id,
    data_object_id:        obj?.id,
    subscription_id:       obj?.subscription ?? (event.type?.startsWith('customer.subscription.') ? obj?.id : null),
    customer_id:           obj?.customer ?? null,
    metadata_user_id:      obj?.metadata?.user_id ?? null,
    client_reference_id:   obj?.client_reference_id ?? null,
    status:                obj?.status ?? null,
  });

  // ── Idempotency check ────────────────────────────────────────────────────
  // billing_events is written AFTER a successful subscription write.
  // If this event_id is already in billing_events, the subscription write
  // already succeeded — return 200 immediately.
  // If the subscription write failed previously and billing_events was never
  // written, this returns false and we retry the subscription write correctly.
  const alreadyProcessed = await isEventProcessed(event.id);
  if (alreadyProcessed) {
    console.info('[stripe:webhook] already processed (idempotent)', event.id);
    return NextResponse.json({ received: true });
  }
  // ────────────────────────────────────────────────────────────────────────

  const payload = {
    id:       event.id,
    type:     event.type,
    livemode: event.livemode,
    created:  event.created,
    data:     event.data,
  };

  let userId = null;
  if (obj) {
    userId = obj.metadata?.user_id ?? obj.client_reference_id ?? null;
  }

  // ── Critical subscription sync ───────────────────────────────────────────
  // This MUST succeed before we write billing_events.
  // If this throws → return 500 → Stripe retries → billing_events not yet written
  // → isEventProcessed returns false → we retry correctly.
  try {
    if (event.type === 'checkout.session.completed') {
      const checkoutSession = event.data.object;
      const subscriptionId  = checkoutSession.subscription;
      userId = checkoutSession.metadata?.user_id ?? checkoutSession.client_reference_id ?? null;

      console.info('[stripe:webhook] checkout.session.completed', {
        session_id:            checkoutSession.id,
        stripe_customer_id:    checkoutSession.customer,
        stripe_subscription_id: subscriptionId,
        metadata_user_id:      checkoutSession.metadata?.user_id,
        client_reference_id:   checkoutSession.client_reference_id,
        mapped_user_id:        userId,
      });

      if (!subscriptionId) {
        console.warn('[stripe:webhook] No subscription id in checkout session — skipping', checkoutSession.id);
        // Write billing event even for no-op events so we don't retry them
        await insertBillingEvent(event.id, event.type, payload, userId);
        return NextResponse.json({ received: true });
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      userId = userId || sub.metadata?.user_id || (await resolveUserId(sub));

      if (!userId) {
        console.error('[stripe:webhook] Cannot resolve user_id — subscription NOT written', {
          session_id:  checkoutSession.id,
          customer:    checkoutSession.customer,
          sub_id:      subscriptionId,
        });
        // Write billing event so we see this in audit log — don't retry without user_id
        await insertBillingEvent(event.id, event.type, payload, null);
        return NextResponse.json({ received: true });
      }

      const row = buildSubscriptionRow(sub, userId);
      console.info('[stripe:webhook] upsert payload', {
        user_id:           userId,
        status:            row.status,
        stripe_sub_id:     row.stripe_subscription_id,
        stripe_customer_id: row.stripe_customer_id,
      });
      await upsertSubscription(row);

    } else if (HANDLED_EVENTS.has(event.type) && event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object;
      userId = sub.metadata?.user_id || (await resolveUserId(sub));

      console.info(`[stripe:webhook] ${event.type}`, {
        stripe_subscription_id: sub.id,
        stripe_customer_id:     sub.customer,
        status:                 sub.status,
        mapped_user_id:         userId,
      });

      if (userId) {
        const row = buildSubscriptionRow(sub, userId);
        await upsertSubscription(row);
      } else {
        console.error('[stripe:webhook] Cannot resolve user_id for subscription event', {
          sub_id:   sub.id,
          customer: sub.customer,
          event:    event.type,
        });
        // Write billing event so we don't retry — can't resolve user without metadata
        await insertBillingEvent(event.id, event.type, payload, null);
        return NextResponse.json({ received: true });
      }
    }
  } catch (err) {
    // Subscription write failed — return 500 so Stripe retries.
    // Do NOT write billing_events here: the next retry must see isEventProcessed=false.
    console.error('[stripe:webhook] Subscription write failed — will retry:', err?.message, err?.stack?.slice(0, 400));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── Audit log (non-blocking) ─────────────────────────────────────────────
  // Written AFTER successful subscription write. This marks the event as
  // processed so future Stripe retries short-circuit via isEventProcessed.
  // Failure here is non-fatal — subscription is already persisted.
  await insertBillingEvent(event.id, event.type, payload, userId);
  // ────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ received: true });
}
