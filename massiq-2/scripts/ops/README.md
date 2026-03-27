# Operational scripts (canonical tables)

## Environment

All scripts need:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required by `lib/supabase/client.js` `hasConfig()`)
- `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS — **never** ship to clients)

Load from `massiq-2/.env.local` or export in the shell.

## Backfill (production one-off)

Populates normalized rows from legacy JSON:

- `meal_plans.meals` → `meal_plan_days` + `meal_plan_items`
- `workout_programs.structure.days` → `workout_program_days` + `workout_program_exercises`
- `plans` → `plan_weeks` for the **current** program week (from `start_date` vs today) when missing
- `scans` → `symmetry_corrections` when `scan_context` / notes suggest symmetry (best-effort)

```bash
cd massiq-2
# Dry run
npx tsx scripts/ops/backfill-canonical-tables.ts --dry-run

# Single user
npx tsx scripts/ops/backfill-canonical-tables.ts --user=YOUR_USER_UUID

# Re-write normalized rows even if they already exist
npx tsx scripts/ops/backfill-canonical-tables.ts --force

# Skip sections
npx tsx scripts/ops/backfill-canonical-tables.ts --skip-symmetry --skip-plans
```

## Verify one user (JSON)

```bash
npx tsx scripts/ops/verify-user-canonical.ts YOUR_USER_UUID
```

## Verify in SQL

See `verify-user-canonical.sql` — replace `:user_id` with a literal UUID in the Supabase SQL editor.

## NPM scripts

```bash
npm run ops:backfill -- --dry-run
npm run ops:verify -- YOUR_USER_UUID
```

## Manual QA (tightened)

Use **two** test accounts in staging (replace with your real staging UUIDs):

| Role | User ID placeholder | After backfill + one scan + apply plan |
|------|---------------------|----------------------------------------|
| Staging user A | `STAGING_USER_A` | `plan_weeks`: ≥ 1 row for latest `plan_id` with `week_number` 1–12; `meal_plan_days` = count of JSON days; `meal_plan_items` ≥ `meal_plan_days` (slots); `workout_program_days` = JSON days; `workout_program_exercises` ≥ 1 if training days have exercises; `symmetry_corrections` ≥ 0 (may be 0 if no signals); `product_events` contains `scan_started` / `scan_completed` after scan |
| Staging user B (legacy-only) | `STAGING_USER_B` | Before backfill: normalized counts may be 0. After backfill: same expectations as A for meal/workout/plan_week rows |

**Expected row counts (order of magnitude, not exact):**

- `plan_weeks`: **1** row per active plan per current week (merge upsert — not one row per user total).
- `meal_plan_days`: equals number of **day objects** in `meal_plans.meals` JSON (typically 7).
- `meal_plan_items`: ≥ number of slots filled per day (4 slots or `meals[]` length).
- `workout_program_days`: equals `structure.days.length`.
- `workout_program_exercises`: sum of `exercises.length` per training day.
- `symmetry_corrections`: **0–N** per user depending on legacy `scan_context`; not 1:1 with scans.
- `product_events`: grows with actions; recent list should show analytics event names from the web app.

Re-verify with:

```bash
npx tsx scripts/ops/verify-user-canonical.ts STAGING_USER_A
```

and the SQL file for the same UUID.
