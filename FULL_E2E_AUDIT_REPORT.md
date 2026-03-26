# MassIQ Full End-to-End Audit Report

## PHASE 1 — CHECKPOINT

### 1. Onboarding / Profile Mapping

| Item | Status | Notes |
|------|--------|------|
| Every input → correct DB field | ✅ | Explicit profile in finish(), serializeProfile maps all |
| No null if user filled | ✅ | Trim/coerce in finish; serializeProfile handles |
| One row per user | ✅ | Migration 013 + ensureProfile upsert |
| Upsert by auth user id | ✅ | upsertProfile uses on_conflict=id |
| Name persist/hydrate | ✅ | miq:name fallback in hydration |
| Unit/weight/height/age/gender/goal/activity | ✅ | All mapped |
| diet_prefs, cuisines, avoid | ✅ | Migration 014 + serialize/deserialize |
| **Files** | | client.js, MassIQ.jsx finish/hydration |

### 2. Plan Application

| Item | Status | Notes |
|------|--------|------|
| Apply button works | ✅ | Fixed ReferenceError (week/startDate before declare) |
| Wired correctly | ✅ | onClick={applyPlan}, disabled={applying} |
| Saves intended plan | ✅ | persistUserState → upsertPlan, createScan |
| No silent fail | ✅ | Logs, try/finally, error surfacing |
| **Files** | | MassIQ.jsx applyPlan, Btn |

### 3. Rolling Plan Continuity

| Item | Status | Notes |
|------|--------|------|
| No reset to week 1 every time | ✅ | startDate preserved from existing plan |
| start_date, week used | ✅ | serializePlan, deserializePlan, getPlan |
| First scan → week 1 | ✅ | isFirstScan ? today : existingPlan.startDate |
| Later scans → continue | ✅ | week computed from daysBetween |
| Projected duration | ⚠️ Partial | Plan tab shows week from startDate; no projected_weeks_remaining in UI |
| **Files** | | client.js serialize/deserialize, MassIQ applyPlan, PlanTab |

### 4. Scan-Driven Adaptation

| Item | Status | Notes |
|------|--------|------|
| Compare vs previous scan | ✅ | computeAdaptation(newScan, prevScan, plan) |
| Real deltas | ✅ | bfDelta, lmDelta from stored data |
| scan_context.adaptation | ✅ | Stored in scan row |
| scan_comparisons table | ❌ | Schema exists, app does not use |
| decision_log table | ❌ | Schema exists, app does not use |
| **Files** | | lib/engine/adaptation.js, MassIQ applyPlan |

### 5. Next Decision Logic

| Item | Status | Notes |
|------|--------|------|
| Reflects real state | ⚠️ Partial | Uses getTrajectoryStatus, not adaptation.rationale |
| Near-target → maintain | ❌ | Not implemented |
| Based on actual data | ✅ | getTrajectoryStatus uses scan history |
| **Files** | | MassIQ results view, getTrajectoryStatus |

### 6. Hydration / Consistency

| Item | Status | Notes |
|------|--------|------|
| Profile from DB | ✅ | ensureProfile → getProfile → deserializeProfile |
| Plan from DB | ✅ | getPlan → deserializePlan |
| Scan history from DB | ✅ | getScans; LS overwritten |
| DB overrides LS | ✅ | Hydration sets LS from loaded data |
| **Files** | | MassIQ hydrate effect |

### 7. Stripe / Premium

| Item | Status | Notes |
|------|--------|------|
| Not broken | ✅ | No changes to Stripe/auth flow |

---

## GAPS TO FIX

1. **nextDecision** should use adaptation.rationale when computable (more specific than getTrajectoryStatus)
2. **Near-target maintain** — suggest transition when BF near target (Cut phase)
3. **Verification logs** — ensure all requested debug logs exist
