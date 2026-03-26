# MassIQ Premium Purchase Flow — Root Cause Report & Fixes

## Executive Summary

Users were returning from Stripe Checkout in a logged-out state or on the login page. The primary root cause was a **success_url origin mismatch**: Stripe redirected to a different origin (e.g. apex vs www) than where the user started, so `localStorage` (where auth lives) was empty on the return origin → perceived logout.

---

## 1. Root Cause Analysis

### A. Success URL / Origin Mismatch (Primary)

- **Issue**: `success_url` was built from `NEXT_PUBLIC_APP_URL` (e.g. `https://example.com`) while the user might be on `https://www.example.com`.
- **Effect**: Stripe redirected to `example.com`; session is stored in `localStorage` under `www.example.com` → different origin → no session.
- **Fix**: Checkout now accepts `return_origin` from the client and validates it (same host, www variant, localhost, Vercel preview). If valid, success/cancel URLs use the client's origin.

### B. Auth Storage & Hydration

- **Auth storage**: Custom Supabase client stores session in `localStorage` under `massiq:auth:session` (not cookies). Session survives same-origin redirects.
- **Hydration**: `initializeSession()` reads from localStorage, optionally refreshes if near expiry. On Stripe return, a full page load runs; if origin matches, session is present.
- **Fix**: Auth boot retries session load when `massiq:billing-return`, `massiq:premium-return`, or `premium_activated=1` is present. Added logging for boot stages.

### C. Billing Success Page

- **Flow**: Page loads → waits for session (up to 24×500ms) → reconciles profile → polls subscription (12×2.5s) → redirects to `/app?premium_activated=1` when premium is active.
- **Unauthenticated path**: If no session after retries, shows "Continue to sign in" and sets `massiq:premium-return` so app can poll after login.
- **Fix**: Added logging (page load, origin, session result, redirect). Simplified `waitForSession` logic.

### D. Webhook & User Mapping

- **Mapping**: `user_id` comes from `sub.metadata?.user_id`, `checkoutSession.metadata?.user_id`, or fallback lookup by `stripe_customer_id` in `subscriptions`.
- **Checkout**: Sets `metadata: { user_id }` on the session and `subscription_data.metadata: { user_id }` so Stripe attaches it to the subscription.
- **Fix**: Improved error logging when `user_id` cannot be resolved. Added structured logs for webhook processing.

### E. Profile / Subscription Consistency

- **Schema**: `subscriptions.user_id` references `auth.users(id)` (not profiles). Profile is not required for subscription lookup.
- **Checkout flow**: Paywall calls `ensureProfile` before checkout; profile is created/updated before redirect to Stripe.
- **Conclusion**: No changes needed; profile is guaranteed before checkout.

---

## 2. Files Changed

| File | Changes |
|------|---------|
| `app/api/stripe/checkout/route.js` | Origin validation for `return_origin`; logging for success/cancel URLs (from prior work) |
| `app/billing/success/page.jsx` | Logging; simplified `waitForSession`; removed redundant `getStoredSession` |
| `components/MassIQ.jsx` | Boot logging for premium/billing return retry and session result |
| `app/api/stripe/webhook/route.js` | Improved error logging when `user_id` unresolved; structured logs for sync results |
| `lib/supabase/client.js` | (No changes) — already has refresh-failure fallback for near-expiry tokens |

---

## 3. Edge Cases Covered

| Scenario | Behavior |
|----------|----------|
| **Webhook delayed** | Billing success polls subscription 12×2.5s. If not active, shows "Payment successful" + "Open MassIQ"; app continues polling when user lands on `/app` with `premium_activated=1`. |
| **Profile missing** | Profile is ensured before checkout. On return, `getProfile` is non-fatal; subscription lookup uses `user_id` from auth. |
| **Stale subscription cache** | Premium poll effect on `/app` refetches subscription; `getSubscription` is authoritative. |
| **Checkout canceled** | User returns to `cancel_url` (`/billing/cancel`); no success flow, no auth impact. |
| **Mobile return** | Same-origin redirect; localStorage persists. In-app browser (e.g. Safari View Controller) may have separate storage — known limitation for WebView contexts. |
| **Return URL in new tab** | Same origin; session in localStorage is shared. Works. |
| **Slow hydration** | Boot retries 12×600ms when premium/billing flags present. Billing success retries session 24×500ms. |

---

## 4. Final Flow Guarantee

1. Authenticated user taps upgrade.
2. Paywall ensures profile, sets `massiq:billing-return`, calls checkout API with `return_origin: window.location.origin`.
3. Checkout uses client origin (when valid) for `success_url` and `cancel_url`.
4. User completes payment on Stripe.
5. Stripe redirects to `{clientOrigin}/billing/success?session_id=...`.
6. Billing success loads, restores session from localStorage (same origin), reconciles profile, polls subscription.
7. When premium is active: sets `massiq:premium-return`, redirects to `/app?premium_activated=1`.
8. MassIQ mounts, boot restores session (retries if needed), hydrate loads profile/subscription.
9. Premium poll effect sees flag, refetches subscription until active, unlocks Premium UI.
10. User remains authenticated; Premium unlocks without manual logout/login.

---

## 5. Observability

Logs added:

- `[stripe:checkout]` — success_url, cancel_url, userId
- `[stripe:webhook]` — event type, user_id resolution failure details, sync result with user_id and status
- `[billing:success]` — page load (origin, hasBillingReturn), no-session warning, premium-confirmed redirect
- `[auth:boot]` — premium/billing return retry, session restored or no session
- `[sync]` — existing hydrate logs (getUser, ensureProfile, subscription, etc.)
- `[premium-poll]` — existing poll logs

---

## 6. Verification Checklist

- [x] `success_url` uses client origin when valid (www/apex/localhost/Vercel)
- [x] App does not redirect to login before auth boot and retries complete
- [x] Premium state is re-fetched on billing success and on app return
- [x] Webhook maps Stripe customer/subscription to user via metadata and fallback
- [x] Profile is ensured before checkout
- [x] Subscriptions do not depend on profile row (use auth user id)
