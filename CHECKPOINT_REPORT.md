# MassIQ Backend Data Correctness — Checkpoint Report

## What EXISTS (current codebase)

### Profiles
- **Migration 013** exists: adds `name` column, deduplicates rows, unique index on `id`
- **serializeProfile** writes: id, name, age, weight, height, gender, goal, activity_level, unit_system
- **serializeProfile** does NOT write: dietPrefs, cuisines, avoid
- **deserializeProfile** returns dietPrefs: `[]`, avoid: `[]` hardcoded — cuisines not in return object
- **upsertProfile** / **ensureProfile** use `on_conflict=id` correctly
- One row per user enforced by migration 013

### Preferences
- **dietPrefs, cuisines, avoid** exist only in onboarding form state and localStorage
- Never persisted to DB — serializeProfile omits them
- On logout, localStorage is cleared → preferences lost
- Boot hydration loads profile from DB → deserializeProfile returns empty arrays for prefs

### Plans
- **serializePlan** writes: user_id, phase, calories, protein, carbs, fat
- **serializePlan** does NOT write: week, start_date
- **deserializePlan** returns: phase, macros, dailyTargets, trainDays — no week, no startDate
- **applyPlan** ALWAYS sets `week: 1`, `startDate: today` — resets every scan
- **upsertPlan** does SELECT→PATCH or INSERT by user_id (one plan per user)
- No rolling logic — every new scan produces a fresh "week 1" plan

### Scans
- **createScan**, **getScans** persist to DB ✓
- **findAssetBySha256**, **findSimilarAsset** exist for duplicate detection ✓
- Duplicate detection wired in runScan (SHA-256 → getScanByAssetId → reuse prior result) ✓
- scan_context JSONB stores adaptation, comparison, hashes ✓

### Subscription logic
- Working — do not touch ✓

---

## What is MISSING

| Item | Gap |
|------|-----|
| **Preferences in DB** | dietPrefs, cuisines, avoid never written or read from DB |
| **Plan week/startDate** | Not stored; applyPlan always resets to week 1 |
| **Rolling plan logic** | No preservation of startDate; no week progression |

---

## What will be CHANGED

1. **Migration 014**: Add `diet_prefs`, `cuisines`, `avoid` (jsonb) to profiles; add `start_date`, `week` to plans
2. **client.js**: serializeProfile — include diet_prefs, cuisines, avoid; deserializeProfile — read them back, add cuisines to return
3. **client.js**: serializePlan — include start_date, week; deserializePlan — return them
4. **client.js**: getProfile — add new columns to SELECT
5. **MassIQ.jsx applyPlan**: Use rolling logic — preserve existing startDate, compute week from days elapsed; only set week:1/startDate:today for first scan
6. **Boot**: No code change needed — deserializeProfile will return prefs from DB once migration + client changes are done

---

## Files to modify

- `massiq-2/supabase/migrations/014_profiles_plans_preferences.sql` (new)
- `massiq-2/lib/supabase/client.js` (serialize/deserialize profile + plan)
- `massiq-2/components/MassIQ.jsx` (applyPlan rolling logic)
