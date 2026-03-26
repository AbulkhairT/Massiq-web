# MassIQ system hardening — implementation report

## Files changed

| File | Change |
|------|--------|
| `lib/supabase/client.js` | Meal/workout **PATCH-or-POST** upsert by `(user_id, plan_id)`; **`getPriorScanForComparison`** (REST: prior scan excluding current id); **`upsertProgressMetric`** (PATCH/POST by `user_id` + `as_of_date`); **`deserializeScan` exported**; `createScanComparison` supports **weight_delta**, **improved_areas**, **worsened_areas** + column fallback; progress metric column fallback |
| `app/api/food-scan/complete/route.js` | After `food_scan_events`, inserts **`food_logs`** (service role) when payload has valid calories; `[food-scan-event]`, `[food-log]` logs; response includes `food_log` result |
| `components/MassIQ.jsx` | Food scan payload sends **macros + `food_items`**; **`persistProgramArtifacts`** surfaces **toast + throw** on failures; **scan step 5** refactored (see below) |
| `app/api/stripe/webhook/route.js` | `[billing:webhook]` log line (alongside existing `[stripe:webhook]`) |
| `app/billing/success/page.jsx` | `[premium:return]` log with `session_id` |

---

## Scan intelligence layer — why tables were still empty (after first hardening pass)

1. **Single `try/catch` around all of step 5**  
   Inserts ran in order: `scan_comparisons` → `scan_decisions` → `decision_log` → `progress_metrics` → `plan_adjustments`. **If an early insert failed** (RLS, FK, missing column, unique constraint), **execution stopped** and **later tables never received writes**. A failing `scan_comparisons` row therefore left **`progress_metrics` at 0 rows** even though the scan row existed.

2. **Prior scan only from local `historyBeforeInsert`**  
   Comparison required `prevValid.dbId`. If the previous scan existed in **Supabase** but local history **lost `dbId`** (refresh, multi-device, or stale LS), **`scan_comparisons` was skipped** while two rows still existed in `scans`.

3. **`plan_adjustments` only compared a narrow macro object**  
   Phase / week / `startDate` / BF targets could change while the small macro snapshot stayed equal → **no adjustment row** even when the plan meaningfully changed.

4. **`workout_programs`**  
   Generation is **implemented** (`generateWorkoutPlan` → `buildWorkoutPlan` in `lib/content/workouts.ts`). Persistence runs in **`persistProgramArtifacts`** from **`applyPlan`** after `generateWorkoutPlan` resolves. If this table is still empty, treat it as **RLS/permission on `workout_programs` INSERT** or a failed upsert (see browser console `[db:workout]`).

---

## What now writes each table (exact path)

### `progress_metrics`

| Step | Location |
|------|----------|
| UI | **Scan** tab → **Apply plan** |
| Function | `ScanTab` → `applyPlan` → `onPlanApplied` |
| Orchestrator | `MassIQ` → `persistUserState` → **step 5d** |
| Helper | `upsertProgressMetric` in `lib/supabase/client.js` |
| HTTP | `PATCH` or `POST` → `/rest/v1/progress_metrics` |
| Prior reason empty | Blocked by **earlier failure in the same try** before this pass; or **RLS**; or **missing columns** (fallback retry strips `weight_kg` / `weekly_weight_change_pct` if DB lacks them) |

### `scan_comparisons`

| Step | Location |
|------|----------|
| UI | Scan tab → Apply plan |
| Function | `applyPlan` → `onPlanApplied` → `persistUserState` step **5a** |
| Prior resolution | **`getPriorScanForComparison(token, userId, savedScanEntry.dbId)`** → `GET /rest/v1/scans?user_id=eq...&id=neq.{current}&order=created_at.desc&limit=1` |
| Helper | `createScanComparison` |
| HTTP | `POST` `/rest/v1/scan_comparisons` (minimal body retry if extended columns missing) |
| Prior reason empty | **No prior row in DB** (first scan) — logged `[scan:compare] skip`; or **local-only prior without DB id** — now mitigated by **DB lookup**; or **failure** — logged `[scan:compare] sub-step FAILED` |

### `scan_decisions`

| Step | Location |
|------|----------|
| UI | Scan tab → Apply plan |
| Orchestrator | `persistUserState` step **5b** (own `try/catch`) |
| Helper | `createScanDecision` |
| HTTP | `POST` `/rest/v1/scan_decisions` |
| Payload | `adaptationDecision`, `adaptationRationale`, `scanComparison`, `limitingFactor`, `scanContext.adaptation` |
| Prior reason empty | **Swallowed by earlier combined try** so never reached; or **RLS** |

### `decision_log`

| Step | Location |
|------|----------|
| UI | Scan tab → Apply plan |
| Orchestrator | `persistUserState` step **5c** (own `try/catch`) |
| Helper | `createDecisionLog` |
| HTTP | `POST` `/rest/v1/decision_log` |
| Prior reason empty | Same as `scan_decisions` |

### `plan_adjustments`

| Step | Location |
|------|----------|
| UI | Scan tab → Apply plan |
| Orchestrator | `persistUserState` step **5e** |
| Condition | **`planAuditSnapshot(previousPlan)`** vs **`planAuditSnapshot(nextPlan)`** (phase, week, startDate, targetBF, startBF, macros) |
| Helper | `createPlanAdjustment` with `adjustment_type: 'plan_update'` |
| HTTP | `POST` `/rest/v1/plan_adjustments` |
| Prior reason empty | **Snapshots identical** — logged `[plan:adjustment] skip — plan audit snapshot unchanged`; or **missing `previousPlan` / `nextPlan` / `planId`** |

### `workout_programs`

| Step | Location |
|------|----------|
| UI | Plan tab / scan flow shows workout after apply; data from `LS_KEYS.workoutplan` |
| Function | `applyPlan` → `generateWorkoutPlan` → `onPersistProgramArtifacts(profile, plan, { workoutDays: days })` |
| Helper | `upsertWorkoutProgram` |
| HTTP | `PATCH` or `POST` `/rest/v1/workout_programs` |
| Prior reason empty | **Upsert error** (see `[db:workout]` logs); **RLS** on insert; or **user never reached a successful `persistProgramArtifacts` workout branch** |

---

## What was fixed (scan layer — second pass)

- **Independent `try/catch` per sub-step** — comparison/decision/log/progress/adjustment failures **do not block** each other.
- **`getPriorScanForComparison`** — prior scan is resolved from **Supabase** by excluding the current scan id, so **two `scans` rows always yield a comparison** when the second scan is saved (unless RLS blocks reads).
- **`upsertProgressMetric`** — same calendar day **updates** the existing row instead of failing a duplicate insert.
- **Richer comparison payload** — `weight_delta` (estimated from lean mass + BF), `improved_areas` / `worsened_areas` from `scanComparison`.
- **Plan audit** — `plan_adjustments` uses a **full plan snapshot**, not macros alone.
- **Column fallbacks** — `scan_comparisons` and `progress_metrics` retry with a **minimal** column set if migrations lag.

---

## Persistence map (high level)

| Flow | Write path | Tables |
|------|------------|--------|
| Onboarding submit | `persistUserState` → `upsertProfile`, `upsertPlan` | `profiles`, `plans` |
| Meal/workout generation | `persistProgramArtifacts` → `upsertPlan` + `upsertMealPlan` / `upsertWorkoutProgram` | `plans`, `meal_plans`, `workout_programs` |
| Body scan apply | `persistUserState` → `createScan`, optional projection, **step 5 (isolated sub-steps)** | `scans`, `physique_projections`, `scan_comparisons`, `scan_decisions`, `decision_log`, `progress_metrics`, `plan_adjustments` |
| Food confirm | `POST /api/food-scan/complete` | `food_scan_events`, `food_logs` |
| Premium return | Stripe webhook + client poll | `subscriptions`, `billing_events` (webhook) |

---

## Remaining risky spots

- **RLS on `scan_comparisons`, `scan_decisions`, `decision_log`, `progress_metrics`, `plan_adjustments`** — if INSERT is denied for the authenticated role, each sub-step logs **`sub-step FAILED`** with the Supabase error text. Fix policies in Supabase, not only app code.
- **`workout_programs`** — same as above for INSERT/PATCH.
- **Non-transactional flow** — `scans` can succeed while intelligence rows fail; user sees **scan in DB** but should see **console errors** for failed sub-steps.

---

## Manual QA (short)

1. Fresh user: complete onboarding → verify `profiles` + `plans` in Supabase.
2. Apply plan → generate meal + workout → verify **one** `meal_plans` and **one** `workout_programs` row per `(user, plan)`; regenerate → same row **updated** (PATCH).
3. First body scan → `scans` + **`progress_metrics`**; **`scan_comparisons` empty** with console skip reason (baseline).
4. Second scan → **`scan_comparisons`** links scan2 → scan1; **`scan_decisions`** + **`decision_log`** rows; **`plan_adjustments`** if snapshot changed.
5. Home food scan → confirm meal → `food_scan_events` + `food_logs` with matching macros.
6. Stripe test checkout → webhook logs `[billing:webhook]`; billing success page logs `[premium:return]`.

---

## SQL checks (Supabase SQL editor)

Replace `:uid` with your test user id.

```sql
-- profiles
select * from public.profiles where id = :uid;

-- active plan
select * from public.plans where user_id = :uid order by updated_at desc limit 1;

-- meal plans (should align with plan id)
select * from public.meal_plans where user_id = :uid order by updated_at desc limit 3;

-- workout programs
select * from public.workout_programs where user_id = :uid order by updated_at desc limit 3;

-- scans + comparisons
select id, created_at from public.scans where user_id = :uid order by created_at desc limit 5;
select * from public.scan_comparisons where user_id = :uid order by created_at desc limit 5;

-- decisions / audit
select * from public.scan_decisions where user_id = :uid order by created_at desc limit 5;
select * from public.decision_log where user_id = :uid order by created_at desc limit 5;
select * from public.plan_adjustments where user_id = :uid order by created_at desc limit 5;

-- progress
select * from public.progress_metrics where user_id = :uid order by as_of_date desc limit 10;

-- food
select * from public.food_scan_events where user_id = :uid order by created_at desc limit 5;
select * from public.food_logs where user_id = :uid order by created_at desc limit 5;
```
