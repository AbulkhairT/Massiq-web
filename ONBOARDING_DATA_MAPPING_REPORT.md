# MassIQ Onboarding Data Mapping — Checkpoint Report

## 1. Current Mappings (UI → State → DB)

| Input | UI Field | Form State Key | Profile Object Key | DB Column (profiles) | serializeProfile | deserializeProfile |
|-------|----------|----------------|-------------------|----------------------|------------------|-------------------|
| Name | input | `data.name` | `name` | `name` | ✓ | ✓ |
| Goal | GOALS[].key | `data.goal` | `goal` | `goal` | ✓ | ✓ |
| Unit system | chips | `data.unitSystem` | `unitSystem` | `unit_system` | ✓ (imperial/metric) | ✓ |
| Weight | input | `data.weightLbs` or `data.weightKg` | `weightLbs` (normalized) | `weight` (kg) | ✓ (kg) | ✓ (→ weightLbs) |
| Height | inputs | `data.heightCm` or `heightFt`+`heightInch` | `heightCm`, `heightIn` | `height` (cm) | ✓ (cm) | ✓ |
| Age | input | `data.age` | `age` | `age` | ✓ | ✓ |
| Gender | chips | `data.gender` | `gender` | `gender` | ✓ | ✓ |
| Activity | ACTIVITIES[].key | `data.activity` | `activity` | `activity_level` | ✓ (Sedentary→sedentary, Active→high) | ✓ (reverse map) |
| Diet prefs | chips | `data.dietPrefs` | `dietPrefs` | `diet_prefs` (jsonb) | ✓ | ✓ |
| Cuisines | chips | `data.cuisines` | `cuisines` | `cuisines` (jsonb) | ✓ | ✓ |
| Foods to avoid | chips | `data.avoid` | `avoid` | `avoid` (jsonb) | ✓ | ✓ |

## 2. Activity Level Mapping (Verified)

- UI: `Sedentary`, `Light`, `Moderate`, `Active`
- DB: `sedentary`, `light`, `moderate`, `high` (Active → high)
- Round-trip: correct via `activityMap` in serialize/deserialize

## 3. Weight/Height Unit Handling

- **Persist**: Always stored in DB as kg (weight) and cm (height)
- **finish()**: Normalizes to `weightLbs` and `heightCm` in profile before save
- **Pre-fill**: Converts weightLbs → weightKg for metric form; heightCm → ft/in for imperial

## 4. Exact Mismatches / Broken Mappings Found

| Issue | Severity | Location |
|-------|----------|----------|
| Profile from finish() may have untrimmed `name` | Low | MassIQ.jsx finish() |
| Profile built with spread includes form-only keys (heightFt, heightInch) — harmless but noisy | Info | MassIQ.jsx |
| No debug logging to verify end-to-end | — | Requested add |

## 5. Summary Screen Data Source

- **Name**: `data.name` ✓
- **Goal**: `data.goal` ✓
- **Calories/Protein**: `macros` from `calcMacros({...data})` — same `data` as user input ✓

## 6. Hydration Flow

- `ensureProfile` → `getProfile` → `deserializeProfile` → `loadedProfile`
- Name fallback: `miq:name:${userId}` if `loadedProfile.name` is empty
- Preferences: `diet_prefs`, `cuisines`, `avoid` read via `toStrArr`

## 7. Fixes Implemented

| File | Change |
|------|--------|
| `massiq-2/components/MassIQ.jsx` | Build explicit profile in finish() — no form-only keys; trim name; add weightKg for engine; add `[onboarding:debug]` logs (finish, handleOnboardingComplete, hydrate) |
| `massiq-2/lib/supabase/client.js` | Add `[onboarding:debug]` log of serialized row before DB write |

## 8. Persistence Path Verified

1. `finish()` builds profile from `data`
2. `onComplete(profile, plan)` → `handleOnboardingComplete(p, plan)`
3. `profileWithId = { ...p, id: session.user.id }`
4. `persistUserState(profileWithId, plan, null)` → `upsertProfile(token, userId, profileWithId)`
5. `serializeProfile(userId, profile)` → DB row

## 9. Read Path Verified

1. `hydrate()` → `ensureProfile` → `getProfile` → `deserializeProfile`
2. `setProfile(loadedProfile)` + `LS.set(profile)`
3. Name fallback from `miq:name:${userId}` if null
