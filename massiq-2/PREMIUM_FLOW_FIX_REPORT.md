# MassIQ Premium Purchase Flow — End-to-End Fix Report

## Summary

This document summarizes the audit and fixes applied to the premium purchase flow. All changes are production-safe and deterministic.

---

## A. Checkout Session Creation

**File:** `app/api/stripe/checkout/route.js`

### Confirmed
- `client_reference_id` = authenticated user.id ✓
- `metadata.user_id` = authenticated user.id ✓
- `subscription_data.metadata.user_id` = authenticated user.id ✓
- `success_url` uses client origin (return_origin, Origin, or Referer fallback) ✓
- `cancel_url` returns to `/app` (no state break) ✓

### Changes
- Added `return_origin` to structured log
- Log now includes: `user_id`, `client_reference_id`, `metadata_user_id`, `return_origin`, `success_url`, `cancel_url`, `session_id`
- Moved `body` to outer scope so it's available for logging

---

## B. Webhook

**File:** `app/api/stripe/webhook/route.js`

### Confirmed
- Signature verification via `stripe.webhooks.constructEvent` ✓
- Idempotency via `isEventProcessed` (billing_events.stripe_event_id) ✓
- `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` handled ✓
- `insertBillingEvent` is non-blocking — catch and log, never throw to caller ✓
- Webhook writes subscription even if billing_events insert fails ✓
- User mapping: metadata.user_id → client_reference_id → subscription.metadata → resolveUserId(customer) ✓

### Changes
- **Incomplete guard strengthened:** Never overwrite existing active/trialing with incoming incomplete (any source: duplicate click, abandoned checkout, race). Previously only skipped when `differentSub`; now skips all incomplete when user already has active/trialing.
- Added `order=updated_at.desc` to all subscription SELECTs for deterministic row selection
- Expanded event log: `event_type`, `event_id`, `data_object_id`, `subscription_id`, `customer_id`, `metadata_user_id`, `client_reference_id`, `status`
- Upsert success log now includes `db_response_id`

---

## C. Verify-Session Fallback

**File:** `app/api/stripe/verify-session/route.js`

### Confirmed
- Verifies checkout session via Stripe
- Upserts into `public.subscriptions` when status is active/trialing ✓
- User verified via Bearer token; session metadata must match ✓

### Changes
- Added `order=updated_at.desc` to subscription SELECT
- Logs: `session_id`, `stripe_sub_id`, `stripe_customer_id`, `premium_decision` (granted/not_granted), `db_result_id`
- Final `verified` log includes `premium_decision`

---

## D. Subscription Persistence

**Logic:** Webhook and verify-session both use SELECT-by-user_id → PATCH or POST (no on_conflict).

### Behavior
1. SELECT row by `user_id` with `order=updated_at.desc`, `limit=1`
2. If row exists: PATCH it with new subscription data
3. If no row: POST new row
4. **Incomplete guard:** Before writing incomplete, check if user has active/trialing; if yes, skip write

### Determinism
- Migration 007 enforces one row per user (`subscriptions_user_id_unique_idx`)
- `stripe_subscription_id` has unique index
- All SELECTs use `order=updated_at.desc`

---

## E. Duplicate / Incomplete Handling

### Why incomplete rows appear
1. **customer.subscription.created** — Stripe fires when a subscription is created (often with status `incomplete` before first payment)
2. **Abandoned checkout** — User starts checkout, subscription created (incomplete), never pays
3. **Duplicate click** — User clicks Upgrade twice; second creates new session and subscription (incomplete)
4. **Race** — Webhook receives events out of order

### Fix
- **Never overwrite active/trialing with incomplete.** When incoming event has status incomplete and the user already has active/trialing, skip the write.
- `getSubscription` (client) prefers active/trialing; never returns incomplete as "current" subscription; returns `null` when only incomplete exists.

---

## F. Client Auth + Return Flow

**File:** `components/MassIQ.jsx`

### Current behavior (unchanged from prior fix)
1. `!authReady` → loading
2. `checkoutActivating` → "Activating premium..."
3. `!session` + `checkout_success` + `!checkoutRetryExhausted` → "Restoring session..."
4. `!session` → login (only when no checkout_success OR retries exhausted)
5. `!ready` → loading
6. App content

### Retry windows
- Boot: 60×500ms (~30s) for checkout return
- Extended effect: 30×500ms (~15s)
- Total: ~45s before login can render

### Session clearing audit
- `clearStoredSession` only in `refreshSession` (definitive token errors) and `signOut`
- Boot does NOT clear on transient refresh failure
- No `localStorage.clear`/`sessionStorage.clear` during checkout return
- No `router.replace('/login')` in MassIQ

### No middleware
- No `middleware.ts` in the project

---

## G. Premium Access Decision

**File:** `lib/features.js` — `isPremiumActive(subscription)`
```js
return ['active', 'trialing'].includes(subscription?.status);
```

**File:** `lib/supabase/client.js` — `getSubscription(token, userId)`
- Fetches up to 10 rows, `order=updated_at.desc`
- Prefers first active/trialing
- Falls back to most recent non-incomplete (e.g. canceled, past_due) for display
- Returns `null` when only incomplete exists

### Sync log
`[sync] subscription:ok` now logs: `status`, `stripe_sub_id`, `premium_decision`

---

## H. Database

### Schema
- `public.subscriptions`: Migration 002 + 007
- `public.billing_events`: Migration 009 + 010
- No new migrations added; 007 already enforces one row per user and unique stripe_subscription_id

### Cleanup script
`supabase/scripts/cleanup_incomplete_subscriptions.sql` — Run manually if you have pre-007 duplicate rows.

---

## Env vars

| Variable | Required for |
|----------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook, verify-session |
| `STRIPE_SECRET_KEY` | Checkout, webhook, verify-session |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature |
| `STRIPE_PRICE_ID` | Checkout |
| `NEXT_PUBLIC_APP_URL` | Fallback success_url when origin invalid |

### Stripe Dashboard
- Webhook URL: `https://<your-domain>/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## Scenario Matrix

| Scenario | Behavior |
|----------|----------|
| **Fresh successful purchase** | Webhook writes active; user returns; session restored; premium active |
| **Duplicate click / repeated checkout** | First completes; second creates incomplete; webhook skips incomplete (user has active); premium unchanged |
| **Webhook delayed** | verify-session upserts on return; premium activates; webhook later idempotent |
| **Abandoned checkout** | Incomplete row created; no premium; later successful purchase overwrites row |
| **Returning user with existing active** | Subscription loaded; isPremiumActive true; no change |

---

## Files Changed

| File | Changes |
|------|---------|
| `app/api/stripe/checkout/route.js` | Structured log, body scope |
| `app/api/stripe/webhook/route.js` | Incomplete guard, ORDER BY, event log, upsert log |
| `app/api/stripe/verify-session/route.js` | ORDER BY, expanded logs |
| `components/MassIQ.jsx` | Sync subscription log |
| `supabase/scripts/cleanup_incomplete_subscriptions.sql` | New cleanup script |
