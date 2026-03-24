# Subscription Row Logic — What Changed and Why

## 1. Did we introduce one-row-per-user?

**No.** Migration 007 (pre-existing) enforces this:

- `subscriptions_user_id_unique_idx` — UNIQUE on `user_id`
- When 007 runs, it **deletes** duplicate rows (keeps one per user, most recent by `updated_at`)

Our code did not add this; it was already in the schema.

---

## 2. Do we overwrite instead of insert?

**Yes — by design.** The webhook and verify-session use:

1. `SELECT` by `user_id` with `order=updated_at.desc`, `limit=1`
2. If a row exists → `PATCH` it with new subscription data
3. If no row exists → `POST` a new row

So we always maintain **one row per user**. New Stripe subscriptions for the same user replace the previous row. That was the behavior before our changes.

---

## 3. Did cleanup logic remove rows?

**No automatic cleanup.** We added a manual script:

- `supabase/scripts/cleanup_incomplete_subscriptions.sql` — run by hand in the SQL Editor
- No cleanup runs automatically in app or webhook code

**Migration 007** (when applied) removes duplicates. If 007 was run recently, it would have deleted extra rows and kept one per user.

---

## 4. What uniqueness/update rule controls writes?

| Constraint | Source | Effect |
|------------|--------|--------|
| `user_id` UNIQUE | Migration 007 | At most one row per user |
| `stripe_subscription_id` UNIQUE | Migration 002/007 | At most one row per Stripe subscription |

**Write flow:**
1. Webhook receives event (e.g. `checkout.session.completed`)
2. Build subscription row from Stripe data
3. **Incomplete guard:** if status is `incomplete` and user already has `active`/`trialing` → **skip** (do not overwrite)
4. `SELECT` row by `user_id`
5. If found → `PATCH` with new data
6. If not found → `POST` new row

---

## 5. For the latest successful checkout, which row was written?

For a user’s latest successful checkout:

1. Webhook receives `checkout.session.completed` with status `active`
2. Fetches subscription from Stripe
3. Builds row with `user_id`, `status`, `stripe_subscription_id`, etc.
4. `SELECT` finds existing row for that `user_id` (or none)
5. Either `PATCH` that row or `POST` a new one

**Why prior rows are no longer visible**

- With one row per user, there are no “prior rows” for that user
- Any old row is replaced by the `PATCH` with the new subscription data

If 007 was run, it also deleted older duplicate rows and left one per user.

---

## 6. Is this expected deduplication or data loss?

**Expected deduplication.** The design is one canonical subscription row per user. Older/duplicate rows are:

- Removed by 007 when it runs
- Or replaced by `PATCH` when a new subscription is written for the same user

---

## 7. Is premium logic using the correct active row?

**Yes.** `getSubscription` (client):

1. Fetches up to 10 rows for the user, ordered by `updated_at` desc
2. Chooses the first `active` or `trialing` row
3. Ignores `incomplete` as “current” subscription

With one row per user, there is only one row; it is used as the current subscription.

---

## Summary

| Question | Answer |
|----------|--------|
| One-row-per-user introduced by us? | No — Migration 007 |
| Overwrite vs insert? | Overwrite existing row; insert only when none exists |
| Automatic cleanup? | No — only manual script; 007 de-duplicates |
| Uniqueness rules? | `user_id` and `stripe_subscription_id` UNIQUE |
| Why fewer rows? | 007 or PATCH replacing old rows |
| Expected or data loss? | Expected deduplication |
| Correct active row for premium? | Yes |
