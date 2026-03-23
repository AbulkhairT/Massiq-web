# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

MassIQ is an AI-powered body composition intelligence platform. The primary application is in `massiq-2/` (Next.js 15, App Router). A secondary skeleton React Native app in `massiq-native/` is not functional and can be ignored.

### Running the app

- **Dev server:** `npm run dev` from `massiq-2/` — runs on port 3000.
- **Build:** `npm run build` from `massiq-2/`.
- **Lint:** No ESLint config exists in the repo. Running `npm run lint` (`next lint`) triggers an interactive setup wizard; avoid in non-interactive contexts.
- **Tests:** No test framework or test scripts are configured.

### Environment variables

A `.env.local` file is needed in `massiq-2/`. The app degrades gracefully:
- Without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: no auth or data persistence (login UI renders but calls fail).
- Without `ANTHROPIC_API_KEY`: the `/api/engine` route still returns deterministic physiology calculations (no AI narrative). The `/api/anthropic` and `/api/claude` routes return 500.
- Without Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`): premium/billing features are non-functional; core app works.
- `SUPABASE_SERVICE_ROLE_KEY` is needed for the Stripe webhook to write subscription rows.
- `NEXT_PUBLIC_APP_URL` must match the deployed URL (used for Stripe checkout redirect URLs).

### Key architecture notes

- The Supabase client (`lib/supabase/client.js`) is a custom REST wrapper using raw `fetch()` — no `@supabase/supabase-js` SDK.
- The intelligence engine (`lib/engine/`) is fully deterministic TypeScript — no AI dependency. It expects properly cased enum values (e.g. `'Cut'`, `'Bulk'`, `'Recomp'`, `'Maintain'` for goal).
- Only 4 runtime npm dependencies: `next`, `react`, `react-dom`, `stripe`.

### Database schema alignment

The Supabase client code must match the actual database schema. Known alignment issues:
- `plans` table: `target_bf` and `start_bf` columns require migration `004_plans_target_bf.sql`. Code gracefully omits these fields and computes them from scan data.
- `profiles` table: `name` column does not exist — stripped on write. `unit_system` column EXISTS — included in read/write.
- `user_entitlements` table: requires migration `003_entitlements_and_trigger.sql`. Migration `005_food_scan_entitlements.sql` adds `free_food_scans_used` and `allocate_food_scan` RPC for server-side food scan limits. Code handles 404 gracefully (non-fatal).
- `subscriptions.stripe_subscription_id`: may lack a UNIQUE constraint. Webhook uses two-step SELECT→PATCH/INSERT instead of `on_conflict` upsert.

### Premium/Stripe flow

1. Paywall calls `POST /api/stripe/checkout` → creates Stripe checkout session
2. Stripe redirects to `/premium/success?session_id=...`
3. Success page polls subscription status (12 attempts, 30s total)
4. Stripe webhook (`POST /api/stripe/webhook`) writes to `subscriptions` table via service role
5. If session is lost during Stripe redirect (common on mobile), success page shows "Payment successful" and redirects to `/app`
6. MassIQ component detects `?premium_activated=1` and polls subscription on return

### Gotchas

- `npm run lint` is interactive and will block in CI/headless environments.
- The `massiq-native/` app references an `App` component that doesn't exist — it cannot run.
- Onboarding pre-fill: if DB has a skeleton profile (all nulls), the pre-fill is skipped to avoid spreading null values into controlled inputs (causes React warning → Next.js error overlay).
- localStorage keys use `massiq:` prefix and are cleared on logout/user-switch. `miq:name:{userId}` survives logout by design.
