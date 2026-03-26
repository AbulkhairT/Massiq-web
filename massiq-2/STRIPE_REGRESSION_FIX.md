# Stripe Subscription Regression Fix

## Root Cause

1. **billing_events insert blocked webhook**: If `insertBillingEvent` failed (schema mismatch, RLS), the webhook returned 500 before ever upserting subscriptions. The subscription write was never attempted.

2. **PostgREST upsert unreliability**: Using `on_conflict=user_id` with PostgREST can behave inconsistently across deployments. Replaced with explicit SELECT → PATCH or POST.

3. **verify-session did not write to DB**: The endpoint only read from Stripe and returned status. It never upserted into `public.subscriptions`. When the webhook failed, there was no fallback.

4. **Swallowed errors**: No visible feedback when activation failed. User saw "Activating premium..." then silently stayed on Free.

## Changes Made

### 1. Webhook (`app/api/stripe/webhook/route.js`)
- **billing_events**: Now non-blocking. If insert fails, log and continue. Never return 500 for audit table issues.
- **upsertSubscription**: Replaced PostgREST `on_conflict` with explicit flow: SELECT by `user_id` → if exists PATCH, else POST.
- **Logging**: Event type, session_id, metadata_user_id, client_reference_id, mapped_user_id, upsert payload, Supabase response/error.
- **user_id resolution**: Use `??` for metadata and client_reference_id fallback.

### 2. Verify-Session (`app/api/stripe/verify-session/route.js`)
- **Now upserts**: When subscription status is `active` or `trialing`, upserts into `public.subscriptions` using the same SELECT→PATCH/POST logic.
- **Fallback path**: If webhook never ran or failed, user's return triggers verify-session which writes the subscription.
- **GET**: Returns masked env diagnostics (supabase_url, has keys).

### 3. Checkout (`app/api/stripe/checkout/route.js`)
- **Logging**: Explicit log of `client_reference_id`, `metadata.user_id`, `success_url` at session creation.
- Already had both `client_reference_id` and `metadata.user_id` set.

### 4. MassIQ (`components/MassIQ.jsx`)
- **verify-session first**: When checkout return detected, call verify-session (which now upserts) before polling.
- **Visible errors**: Toast when verify-session fails or polling exhausts without success.

## Env / Stripe Dashboard

- `NEXT_PUBLIC_APP_URL` must match deployed URL exactly (e.g. `https://massiq.app`). Session is in localStorage; wrong origin = perceived logout.
- Webhook URL: `https://massiq.app/api/stripe/webhook` (or your production domain)
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `STRIPE_WEBHOOK_SECRET` must match the webhook's signing secret
- `SUPABASE_SERVICE_ROLE_KEY` required for webhook and verify-session writes

## Diagnostic Endpoints

- `GET /api/stripe/webhook` — returns `supabase_url_masked`, `has_service_key`
- `GET /api/stripe/verify-session` — returns `supabase_url_masked`, `has_stripe_key`, `has_service_key`

## Why Subscriptions Stayed Empty

1. Webhook may have returned 500 due to billing_events insert failure → Stripe retries but subscription never written.
2. Or: webhook URL/secret misconfigured → webhook never hits.
3. Or: PostgREST upsert with `on_conflict` failed silently in some env.
4. verify-session never wrote to DB, so no fallback when webhook failed.
