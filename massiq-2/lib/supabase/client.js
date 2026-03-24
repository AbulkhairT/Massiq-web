const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const AUTH_KEY = 'massiq:auth:session';

function hasConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function authHeaders(token) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * PostgREST / Supabase REST errors expose `code`, `details`, `hint`, `message` in JSON body.
 * We attach them on the Error for client debugging (RLS, FK, constraint names).
 */
export function logPostgrestFailure(label, err, payloadSent = null) {
  const e = err && typeof err === 'object' ? err : {};
  let payload_json = null;
  try {
    payload_json = payloadSent != null ? JSON.stringify(payloadSent) : null;
  } catch {
    payload_json = '[stringify failed]';
  }
  console.error(label, {
    code: e.postgrestCode ?? e.code,
    message: e.message,
    details: e.postgrestDetails ?? e.details,
    hint: e.postgrestHint ?? e.hint,
    httpStatus: e.httpStatus,
    path: e.requestPath,
    payload: payloadSent,
    payload_json,
  });
}

function attachPostgrestMeta(err, path, res, payload) {
  if (!err || typeof err !== 'object') return;
  err.requestPath = path;
  err.httpStatus = res.status;
  if (payload && typeof payload === 'object') {
    err.postgrestCode = payload.code;
    err.postgrestDetails = payload.details;
    err.postgrestHint = payload.hint;
    err.postgrestMessage = payload.message;
  }
}

async function supabaseFetch(path, opts = {}, retries = 1) {
  if (!hasConfig()) throw new Error('Supabase env is missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text || 'non-json error body' };
  }
  if (!res.ok) {
    const isTransient = res.status >= 500 || res.status === 429;
    if (isTransient && retries > 0) {
      await new Promise(r => setTimeout(r, 350));
      return supabaseFetch(path, opts, retries - 1);
    }
    const message =
      payload?.msg ||
      payload?.error_description ||
      payload?.message ||
      (typeof payload === 'string' ? payload : null) ||
      `Request failed (${res.status})`;
    const err = new Error(`[supabase:${path}] ${message}`);
    attachPostgrestMeta(err, path, res, payload);
    throw err;
  }
  return payload;
}

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

function storeSession(session) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(session)); } catch {}
}

function toNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPhaseValue(phase) {
  const p = String(phase || '').trim().toLowerCase();
  if (p === 'bulk' || p === 'cut' || p === 'recomp' || p === 'maintain') return p;
  return 'maintain';
}

function toPhaseLabel(phase) {
  const p = toPhaseValue(phase);
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function toSafeInt(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`[plans] Invalid ${field}: ${String(value)}`);
  }
  return Math.round(n);
}

function serializeProfile(userId, profile) {
  const lbs = toNumber(profile?.weightLbs, null);
  const kgRaw = toNumber(profile?.weightKg, null);
  const heightCm = toNumber(profile?.heightCm, null);
  const heightIn = toNumber(profile?.heightIn, null);
  const normalizedWeightKg = kgRaw ?? (lbs ? lbs * 0.453592 : null);
  const normalizedHeightCm = heightCm ?? (heightIn ? heightIn * 2.54 : null);
  const activityMap = {
    sedentary: 'sedentary',
    light: 'light',
    moderate: 'moderate',
    active: 'high',
    high: 'high',
  };
  const activityKey = String(profile?.activity || profile?.activity_level || '').trim().toLowerCase();
  const dietPrefs = Array.isArray(profile?.dietPrefs) ? profile.dietPrefs : [];
  const cuisines = Array.isArray(profile?.cuisines) ? profile.cuisines : [];
  const avoid = Array.isArray(profile?.avoid) ? profile.avoid : [];
  return {
    id: userId,
    name: String(profile?.name || '').trim() || null,
    age: toNumber(profile?.age),
    weight: normalizedWeightKg ? Number(normalizedWeightKg.toFixed(3)) : null,
    height: normalizedHeightCm ? Number(normalizedHeightCm.toFixed(2)) : null,
    gender: profile?.gender || null,
    goal: profile?.goal || null,
    activity_level: activityMap[activityKey] || null,
    unit_system: profile?.unitSystem === 'metric' ? 'metric' : 'imperial',
    diet_prefs: dietPrefs,
    cuisines,
    avoid,
  };
}

function isMissingNameColumnError(err) {
  const raw = String(err?.message || '').toLowerCase();
  return raw.includes('name') && raw.includes('profiles') && (raw.includes('column') || raw.includes('schema cache'));
}

function isMissingUnitSystemColumnError(err) {
  const raw = String(err?.message || '').toLowerCase();
  return raw.includes('unit_system') && raw.includes('profiles') && (raw.includes('column') || raw.includes('schema cache'));
}

function deserializeProfile(row) {
  if (!row) return null;
  const heightCm = toNumber(row.height, null);
  const weightKg = toNumber(row.weight, null);
  const weightLbs = weightKg ? Number((weightKg * 2.20462).toFixed(1)) : null;
  const activityMap = {
    sedentary: 'Sedentary',
    light: 'Light',
    moderate: 'Moderate',
    high: 'Active',
  };
  const toStrArr = (v) => {
    if (Array.isArray(v)) return v.filter(x => typeof x === 'string');
    if (v == null) return [];
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(x => typeof x === 'string') : []; } catch { return []; }
    }
    return [];
  };
  const dietPrefs = toStrArr(row.diet_prefs);
  const cuisines = toStrArr(row.cuisines);
  const avoid = toStrArr(row.avoid);
  return {
    id: row.id,
    name: String(row.name || '').trim(),
    age: toNumber(row.age, null),
    weightLbs,
    weightKg,
    heightCm,
    heightIn: heightCm ? Number((heightCm / 2.54).toFixed(1)) : null,
    gender: row.gender || null,
    goal: row.goal || null,
    activity: activityMap[String(row.activity_level || '').toLowerCase()] || null,
    unitSystem: row.unit_system === 'metric' ? 'metric' : 'imperial',
    dietPrefs,
    cuisines,
    avoid,
    reminders: {},
  };
}

function serializePlan(userId, plan) {
  const macros = plan?.dailyTargets || plan?.macros || {};
  if (!userId) throw new Error('[plans] Missing user_id for plan insert');
  const week = plan?.week != null ? Math.round(Number(plan.week)) : null;
  const startDate = plan?.startDate || null;
  return {
    user_id:   userId,
    phase:     toPhaseValue(plan?.phase),
    calories:  toSafeInt(macros.calories, 'calories'),
    protein:   toSafeInt(macros.protein, 'protein'),
    carbs:     toSafeInt(macros.carbs, 'carbs'),
    fat:       toSafeInt(macros.fat, 'fat'),
    start_date: startDate ? String(startDate).slice(0, 10) : null,
    week:      week,
  };
}

function deserializePlan(row) {
  if (!row) return null;
  const phaseLabel = toPhaseLabel(row.phase);
  const macros = {
    calories: toNumber(row.calories, 2200),
    protein: toNumber(row.protein, 160),
    carbs: toNumber(row.carbs, 220),
    fat: toNumber(row.fat, 65),
  };
  const week = row.week != null ? Math.max(1, Math.min(12, Math.round(Number(row.week)))) : null;
  const startDate = row.start_date ? String(row.start_date).slice(0, 10) : null;
  return {
    phase: phaseLabel,
    phaseName: `${phaseLabel} Phase`,
    objective: '',
    macros,
    dailyTargets: {
      ...macros,
      steps: 9000,
      sleepHours: 8,
      waterLiters: 3,
      trainingDaysPerWeek: 4,
      cardioDays: 2,
    },
    trainDays: 4,
    week,
    startDate,
    targetBF:    null,
    startBF:     null,
    createdAt: row.created_at || null,
    sourceScanId: null,
  };
}

// Current schema version — increment when columns change
const SCAN_SCHEMA_VERSION = '2';

function serializeScan(userId, scan) {
  const bodyFat  = toNumber(scan?.bodyFat ?? scan?.bodyFatPct);
  const leanMass = toNumber(scan?.leanMass);
  if (bodyFat  === null) throw new Error('[scans] Missing body_fat value');
  if (leanMass === null) throw new Error('[scans] Missing lean_mass value');

  // muscle_assessment: weakest groups, daily targets, legacy rich data
  const muscleAssessment = {
    weakest_groups:               scan?.weakestGroups            || [],
    phase:                        scan?.phase                    || null,
    body_fat_range:               scan?.bodyFatRange             || null,
    limiting_factor:              scan?.limitingFactor           || null,
    limiting_factor_explanation:  scan?.limitingFactorExplanation || null,
    nutrition_key_change:         scan?.nutritionKeyChange       || null,
    recommendation:               scan?.recommendation           || null,
    is_baseline:                  scan?.isBaseline               || false,
    daily_targets:                scan?.dailyTargets             || null,
  };

  // scan_context: adaptation decision, scoring breakdown, image hashes
  const scanContext = scan?.scanContext
    ? { ...scan.scanContext, schema_version: SCAN_SCHEMA_VERSION }
    : { schema_version: SCAN_SCHEMA_VERSION };

  const physiqueScore = toNumber(scan?.physiqueScore, null);
  const symmetryScore = toNumber(scan?.symmetryScore, null);

  return {
    user_id:                userId,
    body_fat:               bodyFat,
    lean_mass:              leanMass,
    physique_score:         physiqueScore !== null ? Math.round(physiqueScore) : null,
    symmetry_score:         symmetryScore !== null ? Math.round(symmetryScore) : null,
    scan_confidence:        scan?.confidence || 'medium',
    muscle_assessment:      muscleAssessment,
    scan_notes:             scan?.assessment || scan?.limitingFactor || null,
    // Extended fields (require schema migration — see supabase/migrations/)
    engine_version:         scan?.engineVersion        || null,
    scan_status:            scan?.scanStatus            || 'complete',
    duplicate_of_scan_id:   scan?.duplicateOfScanId    || null,
    asset_id:               scan?.assetId              || null,
    scan_context:           scanContext,
  };
}

export function deserializeScan(row) {
  const ma  = row?.muscle_assessment || {};
  const ctx = row?.scan_context      || {};
  const pa  = ctx?.premium_analysis  || {};
  return {
    id:                          row?.id,
    dbId:                        row?.id,
    date:                        row?.created_at,
    bodyFat:                     toNumber(row?.body_fat,           null),
    bodyFatPct:                  toNumber(row?.body_fat,           null),
    leanMass:                    toNumber(row?.lean_mass,          null),
    physiqueScore:               toNumber(row?.physique_score,     null),
    symmetryScore:               toNumber(row?.symmetry_score,     null),
    confidence:                  row?.scan_confidence              || 'medium',
    phase:                       ma?.phase                         || null,
    bodyFatRange:                ma?.body_fat_range                || null,
    assessment:                  row?.scan_notes                   || ma?.limiting_factor || null,
    limitingFactor:              ma?.limiting_factor               || null,
    limitingFactorExplanation:   ma?.limiting_factor_explanation   || null,
    nutritionKeyChange:          ma?.nutrition_key_change          || null,
    recommendation:              ma?.recommendation                || null,
    weakestGroups:               Array.isArray(ma?.weakest_groups) ? ma.weakest_groups : [],
    isBaseline:                  ma?.is_baseline                   || false,
    dailyTargets:                ma?.daily_targets                 || null,
    // Extended fields
    engineVersion:               row?.engine_version               || null,
    scanStatus:                  row?.scan_status                  || 'complete',
    duplicateOfScanId:           row?.duplicate_of_scan_id         || null,
    assetId:                     row?.asset_id                     || null,
    adaptationDecision:          ctx?.adaptation?.decision         || null,
    adaptationRationale:         ctx?.adaptation?.rationale        || null,
    scanComparison:              ctx?.comparison                   || null,
    scoringBreakdown:            ctx?.scoring_breakdown            || null,
    imageHash:                   ctx?.image_hash                   || null,
    perceptualHash:              ctx?.perceptual_hash              || null,
    // Premium analysis (persisted for revisiting scan details)
    bodyFatSummary:              pa?.body_fat_summary              || null,
    muscleSummary:               pa?.muscle_summary                || null,
    muscleGroups:                pa?.muscle_groups                 || null,
    balanceNote:                 pa?.balance_note                  || null,
    diagnosis:                   pa?.diagnosis                     || null,
    strengths:                   pa?.strengths                     || null,
  };
}

export async function signUpWithPassword(email, password) {
  const data = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (data?.access_token) {
    storeSession(data);
  }
  return data;
}

export async function signInWithPassword(email, password) {
  const data = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  storeSession(data);
  return data;
}

/**
 * Sends a password reset email via Supabase Auth.
 * The email link redirects to /reset-password which handles the recovery token.
 */
export async function requestPasswordReset(email) {
  if (!hasConfig()) throw new Error('Supabase env missing');
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return supabaseFetch('/auth/v1/recover', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, redirect_to: `${appUrl}/reset-password` }),
  });
}

/**
 * Updates the authenticated user's password using a recovery access token.
 * Pass the access_token extracted from the Supabase recovery URL.
 */
export async function updatePassword(accessToken, newPassword) {
  if (!hasConfig()) throw new Error('Supabase env missing');
  return supabaseFetch('/auth/v1/user', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ password: newPassword }),
  });
}

export async function refreshSession(refreshToken) {
  try {
    const data = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    storeSession(data);
    return data;
  } catch (err) {
    // Only clear stored session for definitive refresh-token errors.
    // Transient network failures or rate limits should NOT log the user out.
    const msg = String(err?.message || '').toLowerCase();
    const isDefinitiveTokenError =
      (msg.includes('refresh token') && (msg.includes('revoked') || msg.includes('expired') || msg.includes('not found'))) ||
      msg.includes('user not found') ||
      msg.includes('user banned');
    if (isDefinitiveTokenError) {
      console.warn('[auth] Refresh token permanently invalid — clearing session');
      clearStoredSession();
      return null;
    }
    // For transient errors, return null but do NOT clear the session.
    // initializeSession will decide whether to use the existing token.
    console.warn('[auth] Refresh failed (transient) — not clearing session:', msg);
    return null;
  }
}

export async function signOut(token) {
  try {
    await supabaseFetch('/auth/v1/logout', {
      method: 'POST',
      headers: authHeaders(token),
    });
  } finally {
    clearStoredSession();
  }
}

export async function initializeSession() {
  const session = getStoredSession();
  if (!session?.access_token) {
    if (typeof window !== 'undefined' && window.location?.search?.includes('checkout_success=1')) {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        console.info('[auth:initSession] no usable session', { hasRawKey: !!raw, rawLength: raw?.length ?? 0 });
      } catch {}
    }
    return null;
  }
  const expiresAt = Number(session.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  const isExpired = expiresAt && expiresAt <= now;
  const isNearExpiry = expiresAt && expiresAt - now < 90;

  if ((isExpired || isNearExpiry) && session.refresh_token) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const refreshed = await refreshSession(session.refresh_token);
        if (refreshed?.access_token) return refreshed;
      } catch (err) {
        if (typeof window !== 'undefined' && window.location?.search?.includes('checkout_success=1')) {
          console.warn('[auth:initSession] refresh attempt', { attempt: attempt + 1, msg: err?.message });
        }
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }
    // Refresh failed — if the token hasn't actually expired yet, use it as-is
    // rather than logging the user out. This prevents false logouts during
    // Stripe return when the refresh endpoint is temporarily unreachable.
    if (!isExpired) {
      console.warn('[auth] Token refresh failed but token not yet expired — using existing session');
      return session;
    }
    // Token is expired AND refresh failed. Do NOT clear — refresh may have been transient
    // (network blip, rate limit). Clearing would log the user out on Stripe return.
    // Retries can try again; only refreshSession clears on definitive token errors.
    if (typeof window !== 'undefined' && window.location?.search?.includes('checkout_success=1')) {
      console.warn('[auth:initSession] expired+refresh failed, returning null (retry may succeed)');
    } else {
      console.warn('[auth] Token expired and refresh failed — not clearing (retry may succeed)');
    }
    return null;
  }
  return session;
}

export async function fetchUser(token) {
  return supabaseFetch('/auth/v1/user', {
    method: 'GET',
    headers: authHeaders(token),
  });
}

export async function upsertProfile(token, userId, profile) {
  const row = serializeProfile(userId, profile);
  // [onboarding:debug] — remove after verifying end-to-end mapping
  console.info('[onboarding:debug] serialized row for DB write', JSON.stringify({
    id: row.id, name: row.name, goal: row.goal, unit_system: row.unit_system,
    age: row.age, weight: row.weight, height: row.height, gender: row.gender,
    activity_level: row.activity_level, diet_prefs: row.diet_prefs,
    cuisines: row.cuisines, avoid: row.avoid,
  }));
  try {
    const result = await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(row),
    });
    console.info('[db:profile] ok', { user_id: userId });
    console.info('[onboarding:debug] DB response after profile upsert', result);
    return result;
  } catch (err) {
    if (isColumnError(err)) {
      const { diet_prefs, cuisines, avoid, ...base } = row;
      const result = await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
        method: 'POST',
        headers: {
          ...authHeaders(token),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(base),
      });
      console.info('[db:profile] ok (fallback cols)', { user_id: userId });
      console.info('[onboarding:debug] DB response after profile upsert (fallback cols)', result);
      return result;
    }
    console.error('[db:profile] FAILED', { user_id: userId, error: err?.message });
    throw err;
  }
}

function isColumnError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('column') || msg.includes('does not exist');
}

export async function getProfile(token, userId) {
  const extended = 'id,name,age,weight,height,gender,goal,activity_level,unit_system,diet_prefs,cuisines,avoid,created_at';
  const base = 'id,name,age,weight,height,gender,goal,activity_level,unit_system,created_at';
  let rows;
  try {
    rows = await supabaseFetch(
      `/rest/v1/profiles?select=${extended}&id=eq.${userId}&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
  } catch (err) {
    if (isColumnError(err)) {
      rows = await supabaseFetch(
        `/rest/v1/profiles?select=${base}&id=eq.${userId}&limit=1`,
        { method: 'GET', headers: authHeaders(token) },
      );
    } else throw err;
  }
  return Array.isArray(rows) && rows[0] ? deserializeProfile(rows[0]) : null;
}

export async function ensureProfile(token, userId) {
  // Use upsert (on_conflict=id) so concurrent calls or retries never create
  // a second row. Migration 013 added the UNIQUE index required for this.
  await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ id: userId }),
  });
  return getProfile(token, userId);
}

function isConflictError(err) {
  const s = String(err?.message || '');
  return s.includes('409') || s.toLowerCase().includes('conflict') || s.includes('duplicate key');
}

async function doUpsertPlan(token, userId, existingId, row) {
  if (existingId) {
    const rows = await supabaseFetch(`/rest/v1/plans?id=eq.${existingId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const planRow = (Array.isArray(rows) && rows[0]) ? rows[0] : { id: existingId };
    return planRow;
  }
  const rows = await supabaseFetch('/rest/v1/plans', {
    method: 'POST',
    headers: { ...authHeaders(token), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const planRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!planRow?.id) throw new Error('[plans] Insert succeeded but no id returned');
  return planRow;
}

/**
 * Single entry point for plans writes. Respects UNIQUE(user_id): PATCH existing row or INSERT once.
 * On 409 (race), re-fetch by user_id and PATCH.
 */
export async function upsertPlan(token, userId, plan) {
  const row = serializePlan(userId, plan);
  console.info('[db:plan] upsert start', { user_id: userId, phase: row.phase, calories: row.calories, protein: row.protein });
  console.info('[sync] upsertPlan:payload', { userId, phase: row.phase, calories: row.calories, protein: row.protein });

  let existingId = null;
  try {
    const existing = await supabaseFetch(
      `/rest/v1/plans?select=id&user_id=eq.${userId}&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
    existingId = Array.isArray(existing) && existing[0]?.id ? existing[0].id : null;
  } catch (e) {
    console.warn('[db:plan] existing lookup failed', { user_id: userId, error: e?.message });
  }
  console.info('[db:plan] upsert state', { user_id: userId, existing_plan_id: existingId || null });

  const attempt = async (r) => {
    try {
      const planRow = await doUpsertPlan(token, userId, existingId, r);
      console.info('[db:plan] success', {
        user_id: userId,
        existing_plan_id: existingId || null,
        final_plan_id: planRow.id,
      });
      console.info('[sync] upsertPlan:ok', { planId: planRow.id });
      return planRow;
    } catch (err) {
      if (isConflictError(err)) {
        console.warn('[db:plan] conflict — refetch and PATCH', { user_id: userId, error: err?.message });
        let rid = null;
        try {
          const again = await supabaseFetch(
            `/rest/v1/plans?select=id&user_id=eq.${userId}&limit=1`,
            { method: 'GET', headers: authHeaders(token) },
          );
          rid = Array.isArray(again) && again[0]?.id ? again[0].id : null;
        } catch (e2) {
          console.error('[db:plan] refetch after conflict failed', e2?.message);
          throw err;
        }
        if (rid) {
          existingId = rid;
          const planRow = await doUpsertPlan(token, userId, existingId, r);
          console.info('[db:plan] success after conflict', { user_id: userId, final_plan_id: planRow.id });
          return planRow;
        }
      }
      throw err;
    }
  };

  try {
    return await attempt(row);
  } catch (err) {
    if (isColumnError(err)) {
      const { start_date, week, ...base } = row;
      existingId = null;
      try {
        const existing = await supabaseFetch(
          `/rest/v1/plans?select=id&user_id=eq.${userId}&limit=1`,
          { method: 'GET', headers: authHeaders(token) },
        );
        existingId = Array.isArray(existing) && existing[0]?.id ? existing[0].id : null;
      } catch {}
      try {
        const planRow = await attempt(base);
        console.info('[db:plan] ok (fallback cols)', { user_id: userId, plan_id: planRow.id });
        return planRow;
      } catch (e2) {
        console.error('[db:plan] FAILED', { user_id: userId, error: e2?.message });
        throw e2;
      }
    }
    console.error('[db:plan] FAILED', { user_id: userId, error: err?.message });
    throw err;
  }
}

export async function getPlan(token, userId) {
  const extended = 'id,user_id,phase,calories,protein,carbs,fat,start_date,week,created_at';
  const base = 'id,user_id,phase,calories,protein,carbs,fat,created_at';
  let rows;
  try {
    rows = await supabaseFetch(
      `/rest/v1/plans?select=${extended}&user_id=eq.${userId}&order=created_at.desc&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
  } catch (err) {
    if (isColumnError(err)) {
      rows = await supabaseFetch(
        `/rest/v1/plans?select=${base}&user_id=eq.${userId}&order=created_at.desc&limit=1`,
        { method: 'GET', headers: authHeaders(token) },
      );
    } else throw err;
  }
  return Array.isArray(rows) && rows[0] ? deserializePlan(rows[0]) : null;
}

/**
 * Upsert meal_plans for (user_id, plan_id): PATCH existing row or POST new.
 * profiles.id === auth user id — userId must be session user id.
 */
export async function upsertMealPlan(token, userId, { planId, preferencesSnapshot = {}, meals = [], totals = {} }) {
  if (!planId) {
    const err = new Error('[meal_plans] Missing planId — cannot persist meal plan artifact');
    console.error('[db:meal-plan]', { user_id: userId, plan_id: null, error: err.message });
    throw err;
  }
  const payload = {
    user_id: userId,
    plan_id: planId,
    preferences_snapshot: preferencesSnapshot || {},
    meals: Array.isArray(meals) ? meals : [],
    total_calories: Math.round(Number(totals?.calories ?? 0)),
    total_protein_g: Math.round(Number(totals?.protein ?? 0)),
    total_carbs_g: Math.round(Number(totals?.carbs ?? 0)),
    total_fat_g: Math.round(Number(totals?.fat ?? 0)),
    updated_at: new Date().toISOString(),
  };
  console.info('[db:meal-plan] upsert start', { user_id: userId, plan_id: planId, meal_days: Array.isArray(meals) ? meals.length : 0 });
  let existing = null;
  try {
    const found = await supabaseFetch(
      `/rest/v1/meal_plans?user_id=eq.${userId}&plan_id=eq.${planId}&select=id&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
    existing = Array.isArray(found) && found[0]?.id ? found[0] : null;
  } catch (e) {
    console.warn('[db:meal-plan] lookup existing failed (will try POST)', e?.message);
  }
  try {
    if (existing?.id) {
      const rows = await supabaseFetch(`/rest/v1/meal_plans?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      console.info('[db:meal-plan] ok PATCH', { user_id: userId, plan_id: planId, meal_plan_id: row?.id ?? existing.id });
      return row || { id: existing.id, ...payload };
    }
    const rows = await supabaseFetch('/rest/v1/meal_plans', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[db:meal-plan] ok POST', { user_id: userId, plan_id: planId, meal_plan_id: row?.id ?? null });
    return row;
  } catch (err) {
    console.error('[db:meal-plan] FAILED', { user_id: userId, plan_id: planId, error: err?.message, raw: String(err) });
    throw err;
  }
}

export async function getLatestMealPlan(token, userId) {
  const rows = await supabaseFetch(
    `/rest/v1/meal_plans?user_id=eq.${userId}&select=id,user_id,plan_id,preferences_snapshot,meals,total_calories,total_protein_g,total_carbs_g,total_fat_g,created_at,updated_at&order=updated_at.desc&limit=1`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function upsertWorkoutProgram(token, userId, { planId, splitName = null, daysPerWeek = null, structure = {}, progressionRules = {} }) {
  if (!planId) {
    const err = new Error('[workout_programs] Missing planId');
    console.error('[db:workout]', { user_id: userId, plan_id: null, error: err.message });
    throw err;
  }
  const payload = {
    user_id: userId,
    plan_id: planId,
    split_name: splitName,
    days_per_week: daysPerWeek != null ? toSafeInt(daysPerWeek, 'days_per_week') : null,
    structure: structure || {},
    progression_rules: progressionRules || {},
    updated_at: new Date().toISOString(),
  };
  console.info('[db:workout] upsert start', { user_id: userId, plan_id: planId });
  let existing = null;
  try {
    const found = await supabaseFetch(
      `/rest/v1/workout_programs?user_id=eq.${userId}&plan_id=eq.${planId}&select=id&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
    existing = Array.isArray(found) && found[0]?.id ? found[0] : null;
  } catch (e) {
    console.warn('[db:workout] lookup existing failed (will try POST)', e?.message);
  }
  try {
    if (existing?.id) {
      const rows = await supabaseFetch(`/rest/v1/workout_programs?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      console.info('[db:workout] ok PATCH', { user_id: userId, plan_id: planId, workout_program_id: row?.id ?? existing.id });
      return row || { id: existing.id, ...payload };
    }
    const rows = await supabaseFetch('/rest/v1/workout_programs', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[db:workout] ok POST', { user_id: userId, plan_id: planId, workout_program_id: row?.id ?? null });
    return row;
  } catch (err) {
    console.error('[db:workout] FAILED', { user_id: userId, plan_id: planId, error: err?.message });
    throw err;
  }
}

export async function getLatestWorkoutProgram(token, userId) {
  const rows = await supabaseFetch(
    `/rest/v1/workout_programs?user_id=eq.${userId}&select=id,user_id,plan_id,split_name,days_per_week,structure,progression_rules,created_at,updated_at&order=updated_at.desc&limit=1`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Most recent scan for this user excluding the current scan id (for comparisons).
 */
export async function getPriorScanForComparison(token, userId, excludeScanId) {
  if (!excludeScanId) {
    console.info('[scan:prior] skip lookup — no excludeScanId');
    return null;
  }
  const pathBase = `/rest/v1/scans?user_id=eq.${userId}&id=neq.${excludeScanId}&order=created_at.desc&limit=1&select=`;
  const colsExtended = [
    'id', 'user_id', 'body_fat', 'lean_mass',
    'physique_score', 'symmetry_score', 'scan_confidence',
    'muscle_assessment', 'scan_notes', 'created_at',
    'engine_version', 'scan_status', 'duplicate_of_scan_id',
    'asset_id', 'scan_context',
  ].join(',');
  const colsBase = 'id,user_id,body_fat,lean_mass,physique_score,symmetry_score,scan_confidence,muscle_assessment,scan_notes,created_at';
  let rows;
  try {
    rows = await supabaseFetch(`${pathBase}${colsExtended}`, { method: 'GET', headers: authHeaders(token) });
  } catch (err) {
    if (String(err?.message).includes('column') || String(err?.message).includes('does not exist')) {
      console.warn('[scan:prior] extended columns missing — fallback', err?.message);
      try {
        rows = await supabaseFetch(`${pathBase}${colsBase}`, { method: 'GET', headers: authHeaders(token) });
      } catch (err2) {
        console.error('[scan:prior] lookup FAILED (fallback)', { user_id: userId, error: err2?.message });
        return null;
      }
    } else {
      console.error('[scan:prior] lookup FAILED', { user_id: userId, exclude_scan_id: excludeScanId, error: err?.message, raw: String(err) });
      return null;
    }
  }
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) {
    console.info('[scan:prior] no row — first scan or exclude is only scan', { user_id: userId, exclude_scan_id: excludeScanId });
    return null;
  }
  const parsed = deserializeScan(row);
  console.info('[scan:prior] ok', { user_id: userId, prior_scan_id: parsed.id, current_excluded: excludeScanId });
  return parsed;
}

export async function createScanComparison(token, userId, payload) {
  const body = {
    user_id: userId,
    current_scan_id: payload.currentScanId,
    previous_scan_id: payload.previousScanId || null,
    body_fat_delta: payload.bodyFatDelta ?? null,
    lean_mass_delta: payload.leanMassDelta ?? null,
    physique_score_delta: payload.physiqueScoreDelta ?? null,
    symmetry_score_delta: payload.symmetryScoreDelta ?? null,
    weight_delta: payload.weightDelta ?? null,
    summary: payload.summary || null,
    comparison_confidence: payload.comparisonConfidence || null,
    improved_areas: payload.improvedAreas ?? [],
    worsened_areas: payload.worsenedAreas ?? [],
  };
  console.info('[scan:compare] write', {
    user_id: userId,
    current_scan_id: body.current_scan_id,
    previous_scan_id: body.previous_scan_id,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/scan_comparisons', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[scan:compare] ok', { user_id: userId, comparison_id: row?.id ?? null });
    return row;
  } catch (err) {
    if (isColumnError(err)) {
      const minimal = {
        user_id: userId,
        current_scan_id: payload.currentScanId,
        previous_scan_id: payload.previousScanId || null,
        body_fat_delta: payload.bodyFatDelta ?? null,
        lean_mass_delta: payload.leanMassDelta ?? null,
        physique_score_delta: payload.physiqueScoreDelta ?? null,
        symmetry_score_delta: payload.symmetryScoreDelta ?? null,
        summary: payload.summary || null,
        comparison_confidence: payload.comparisonConfidence || null,
      };
      console.warn('[scan:compare] retry without extended columns', err?.message);
      const rows = await supabaseFetch('/rest/v1/scan_comparisons', {
        method: 'POST',
        headers: { ...authHeaders(token), Prefer: 'return=representation' },
        body: JSON.stringify(minimal),
      });
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      console.info('[scan:compare] ok (minimal)', { user_id: userId, comparison_id: row?.id ?? null });
      return row;
    }
    console.error('[scan:compare] FAILED', { user_id: userId, error: err?.message, raw: String(err) });
    throw err;
  }
}

export async function createScanDecision(token, userId, payload) {
  const row = {
    user_id: userId,
    scan_id: payload.scanId,
    plan_id: payload.planId || null,
    decision_type: payload.decisionType || 'keep_plan',
    decision_reason: payload.decisionReason || null,
    payload: payload.payload || {},
  };
  console.info('[db:scan-decision] payload', {
    insert_keys: Object.keys(row),
    payload_json: JSON.stringify(row),
    user_id: row.user_id,
    scan_id: row.scan_id,
    plan_id: row.plan_id,
    scan_id_null: row.scan_id == null,
    plan_id_null: row.plan_id == null,
    decision_type: row.decision_type,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/scan_decisions', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[db:scan-decision] ok', { user_id: userId, scan_decision_id: out?.id ?? null });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:scan-decision] insert FAILED', err, row);
    const e = new Error(`scan_decisions: ${err?.message || err}`);
    e.personalizationTable = 'scan_decisions';
    e.cause = err;
    e.postgrestCode = err?.postgrestCode;
    e.postgrestDetails = err?.postgrestDetails;
    e.postgrestHint = err?.postgrestHint;
    e.postgrestMessage = err?.postgrestMessage || err?.message;
    throw e;
  }
}

export async function createDecisionLog(token, userId, payload) {
  const row = {
    user_id: userId,
    scan_id: payload.scanId || null,
    plan_id: payload.planId || null,
    decision_category: payload.decisionCategory || 'adaptation',
    decision: payload.decision || {},
    confidence: payload.confidence || null,
    explanation: payload.explanation || null,
  };
  console.info('[db:decision-log] payload', {
    insert_keys: Object.keys(row),
    payload_json: JSON.stringify(row),
    user_id: row.user_id,
    scan_id: row.scan_id,
    plan_id: row.plan_id,
    scan_id_null: row.scan_id == null,
    plan_id_null: row.plan_id == null,
    decision_category: row.decision_category,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/decision_log', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[db:decision-log] ok', { user_id: userId, decision_log_id: out?.id ?? null });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:decision-log] insert FAILED', err, row);
    const e = new Error(`decision_log: ${err?.message || err}`);
    e.personalizationTable = 'decision_log';
    e.cause = err;
    e.postgrestCode = err?.postgrestCode;
    e.postgrestDetails = err?.postgrestDetails;
    e.postgrestHint = err?.postgrestHint;
    e.postgrestMessage = err?.postgrestMessage || err?.message;
    throw e;
  }
}

export async function createPlanAdjustment(token, userId, payload) {
  const row = {
    user_id: userId,
    plan_id: payload.planId,
    scan_id: payload.scanId || null,
    adjustment_type: payload.adjustmentType || 'macro_update',
    old_value: payload.oldValue || {},
    new_value: payload.newValue || {},
    trigger_reason: payload.triggerReason || null,
    explanation: payload.explanation || null,
  };
  console.info('[db:plan-adjustment] payload', {
    insert_keys: Object.keys(row),
    payload_json: JSON.stringify(row),
    user_id: row.user_id,
    scan_id: row.scan_id,
    plan_id: row.plan_id,
    scan_id_null: row.scan_id == null,
    plan_id_null: row.plan_id == null,
    adjustment_type: row.adjustment_type,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/plan_adjustments', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[db:plan-adjustment] ok', { user_id: userId, plan_adjustment_id: out?.id ?? null });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:plan-adjustment] insert FAILED', err, row);
    const e = new Error(`plan_adjustments: ${err?.message || err}`);
    e.personalizationTable = 'plan_adjustments';
    e.cause = err;
    e.postgrestCode = err?.postgrestCode;
    e.postgrestDetails = err?.postgrestDetails;
    e.postgrestHint = err?.postgrestHint;
    e.postgrestMessage = err?.postgrestMessage || err?.message;
    throw e;
  }
}

/**
 * Insert or update progress_metrics for (user_id, as_of_date) so multiple scans same day still persist.
 */
export async function upsertProgressMetric(token, userId, payload) {
  const row = {
    user_id: userId,
    as_of_date: payload.asOfDate,
    body_fat_pct: payload.bodyFatPct ?? null,
    lean_mass_kg: payload.leanMassKg ?? null,
    weight_kg: payload.weightKg ?? null,
    weekly_body_fat_change: payload.weeklyBodyFatChange ?? null,
    weekly_weight_change_pct: payload.weeklyWeightChangePct ?? null,
    trend_status: payload.trendStatus || null,
  };
  console.info('[progress:metrics] upsert start', { user_id: userId, as_of_date: row.as_of_date });
  let existingId = null;
  try {
    const found = await supabaseFetch(
      `/rest/v1/progress_metrics?user_id=eq.${userId}&as_of_date=eq.${row.as_of_date}&select=id&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
    existingId = Array.isArray(found) && found[0]?.id ? found[0].id : null;
  } catch (e) {
    console.warn('[progress:metrics] lookup existing failed (will POST)', e?.message);
  }
  try {
    if (existingId) {
      const rows = await supabaseFetch(`/rest/v1/progress_metrics?id=eq.${existingId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
      console.info('[progress:metrics] ok PATCH', { user_id: userId, progress_metric_id: out?.id ?? existingId });
      return out || { id: existingId, ...row };
    }
    const rows = await supabaseFetch('/rest/v1/progress_metrics', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    console.info('[progress:metrics] ok POST', { user_id: userId, progress_metric_id: out?.id ?? null });
    return out;
  } catch (err) {
    if (isColumnError(err)) {
      const rowMinimal = {
        user_id: userId,
        as_of_date: payload.asOfDate,
        body_fat_pct: payload.bodyFatPct ?? null,
        lean_mass_kg: payload.leanMassKg ?? null,
        weekly_body_fat_change: payload.weeklyBodyFatChange ?? null,
        trend_status: payload.trendStatus || null,
      };
      console.warn('[progress:metrics] retry without weight_kg / weekly_weight_change_pct', err?.message);
      try {
        if (existingId) {
          const rows2 = await supabaseFetch(`/rest/v1/progress_metrics?id=eq.${existingId}`, {
            method: 'PATCH',
            headers: { ...authHeaders(token), Prefer: 'return=representation' },
            body: JSON.stringify(rowMinimal),
          });
          const out2 = Array.isArray(rows2) && rows2[0] ? rows2[0] : null;
          console.info('[progress:metrics] ok PATCH (minimal)', { user_id: userId, progress_metric_id: out2?.id ?? existingId });
          return out2 || { id: existingId, ...rowMinimal };
        }
        const rows2 = await supabaseFetch('/rest/v1/progress_metrics', {
          method: 'POST',
          headers: { ...authHeaders(token), Prefer: 'return=representation' },
          body: JSON.stringify(rowMinimal),
        });
        const out2 = Array.isArray(rows2) && rows2[0] ? rows2[0] : null;
        console.info('[progress:metrics] ok POST (minimal)', { user_id: userId, progress_metric_id: out2?.id ?? null });
        return out2;
      } catch (err2) {
        console.error('[progress:metrics] FAILED (minimal retry)', { user_id: userId, error: err2?.message });
        throw err2;
      }
    }
    console.error('[progress:metrics] FAILED', { user_id: userId, as_of_date: row.as_of_date, error: err?.message, raw: String(err) });
    throw err;
  }
}

/** @deprecated prefer upsertProgressMetric — kept for callers that need raw POST */
export async function createProgressMetric(token, userId, payload) {
  return upsertProgressMetric(token, userId, payload);
}

export async function getScanComparisons(token, userId, limit = 50) {
  const rows = await supabaseFetch(
    `/rest/v1/scan_comparisons?user_id=eq.${userId}&select=id,current_scan_id,previous_scan_id,body_fat_delta,lean_mass_delta,physique_score_delta,symmetry_score_delta,summary,comparison_confidence,created_at&order=created_at.desc&limit=${limit}`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getScanDecisions(token, userId, limit = 50) {
  const rows = await supabaseFetch(
    `/rest/v1/scan_decisions?user_id=eq.${userId}&select=id,scan_id,plan_id,decision_type,decision_reason,payload,created_at&order=created_at.desc&limit=${limit}`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getDecisionLogs(token, userId, limit = 50) {
  const rows = await supabaseFetch(
    `/rest/v1/decision_log?user_id=eq.${userId}&select=id,scan_id,plan_id,decision_category,decision,confidence,explanation,created_at&order=created_at.desc&limit=${limit}`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getLatestPlanAdjustment(token, userId, planId = null) {
  const filter = planId ? `&plan_id=eq.${planId}` : '';
  const rows = await supabaseFetch(
    `/rest/v1/plan_adjustments?user_id=eq.${userId}${filter}&select=id,plan_id,scan_id,adjustment_type,old_value,new_value,trigger_reason,explanation,created_at&order=created_at.desc&limit=1`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function getProgressMetrics(token, userId, limit = 30) {
  const rows = await supabaseFetch(
    `/rest/v1/progress_metrics?user_id=eq.${userId}&select=id,as_of_date,weight_kg,body_fat_pct,lean_mass_kg,weekly_weight_change_pct,weekly_body_fat_change,trend_status,created_at&order=as_of_date.desc&limit=${limit}`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createScan(token, userId, scan) {
  const row = serializeScan(userId, scan);
  console.info('[scan:save] payload', { user_id: userId, body_fat: row.body_fat, lean_mass: row.lean_mass, asset_id: row.asset_id, scan_status: row.scan_status });
  console.info('[sync] createScan:payload', { userId, body_fat: row.body_fat, lean_mass: row.lean_mass, asset_id: row.asset_id, scan_status: row.scan_status });
  const rows = await supabaseFetch('/rest/v1/scans', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  console.info('[sync] createScan:response', rows);
  const raw = Array.isArray(rows) ? rows[0] : rows;
  if (!raw) {
    // Supabase returned 201 but empty body — means the row was inserted but
    // `Prefer: return=representation` wasn't honoured (e.g. RLS policy blocks SELECT).
    throw new Error('[scans] Row inserted but Supabase returned no data. Check RLS SELECT policy on scans table.');
  }
  const result = deserializeScan(raw);
  if (!result?.id) {
    throw new Error(`[scans] Insert succeeded but no id in response: ${JSON.stringify(raw)}`);
  }
  console.info('[scan:save] ok', { user_id: userId, scan_id: result.id });
  console.info('[sync] createScan:ok', { id: result.id, bodyFat: result.bodyFat, leanMass: result.leanMass });
  return result;
}

export async function getScans(token, userId, limit = 25) {
  const cols = [
    'id', 'user_id', 'body_fat', 'lean_mass',
    'physique_score', 'symmetry_score', 'scan_confidence',
    'muscle_assessment', 'scan_notes', 'created_at',
    // Extended fields added in migration 001_extend_scans
    'engine_version', 'scan_status', 'duplicate_of_scan_id',
    'asset_id', 'scan_context',
  ].join(',');
  let rows;
  try {
    rows = await supabaseFetch(
      `/rest/v1/scans?select=${cols}&user_id=eq.${userId}&order=created_at.desc&limit=${limit}`,
      { method: 'GET', headers: authHeaders(token) },
    );
  } catch (err) {
    // Fall back to base columns if extended columns don't exist yet (pre-migration)
    if (String(err?.message).includes('column') || String(err?.message).includes('does not exist')) {
      console.warn('[scans] Extended columns not found, falling back to base columns. Run supabase migration.');
      const baseCols = 'id,user_id,body_fat,lean_mass,physique_score,symmetry_score,scan_confidence,muscle_assessment,scan_notes,created_at';
      rows = await supabaseFetch(
        `/rest/v1/scans?select=${baseCols}&user_id=eq.${userId}&order=created_at.desc&limit=${limit}`,
        { method: 'GET', headers: authHeaders(token) },
      );
    } else {
      throw err;
    }
  }
  return Array.isArray(rows) ? rows.map(deserializeScan).reverse() : [];
}

// ─── scan_assets ──────────────────────────────────────────────────────────────

/**
 * Upload a scan photo to Supabase Storage (scan-photos bucket).
 * Returns the storage path on success.
 */
export async function uploadScanPhoto(token, userId, base64, mediaType) {
  if (!hasConfig()) throw new Error('Supabase env missing');
  const ext      = mediaType === 'image/png' ? 'png' : 'jpg';
  const now      = new Date();
  const yyyy     = now.getUTCFullYear();
  const mm       = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ts       = now.getTime();
  const rand     = Math.random().toString(36).slice(2, 8);
  const filename = `${ts}-${rand}.${ext}`;
  const path     = `${userId}/${yyyy}/${mm}/${filename}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/scan-photos/${path}`;

  console.info('[storage:upload] Starting', { path, mediaType, base64Bytes: base64.length });

  // Decode base64 → binary blob
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mediaType });

  console.info('[storage:upload] Sending POST', uploadUrl, 'blobSize:', blob.size);

  const res = await fetch(uploadUrl, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': mediaType },
    body:    blob,
  });

  const resText = await res.text().catch(() => '');
  console.info('[storage:upload] Response', { status: res.status, body: resText.slice(0, 300) });

  if (!res.ok) {
    throw new Error(`[storage] Upload failed (${res.status}): ${resText}`);
  }
  return path;
}

/**
 * Save metadata for an uploaded scan photo in the scan_assets table.
 */
export async function createScanAsset(token, userId, { storagePath, mimeType, fileSizeBytes, sha256, perceptualHash, width, height }) {
  const payload = {
    user_id:         userId,
    storage_path:    storagePath,
    mime_type:       mimeType,
    file_size_bytes: fileSizeBytes || null,
    sha256:          sha256 || null,
    perceptual_hash: perceptualHash || null,
    width:           width   || null,
    height:          height  || null,
  };
  console.info('[db:scan_assets] Inserting row', {
    ...payload,
    sha256: sha256 ? sha256.slice(0, 12) + '…' : null,
  });
  const rows = await supabaseFetch('/rest/v1/scan_assets', {
    method:  'POST',
    headers: { ...authHeaders(token), Prefer: 'return=representation' },
    body:    JSON.stringify(payload),
  });
  console.info('[db:scan_assets] Insert response', rows);
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Look up an existing asset by SHA-256 hash for the given user.
 * Returns the asset row (with id, scan_id if linked) or null.
 */
export async function findAssetBySha256(token, userId, sha256) {
  const rows = await supabaseFetch(
    `/rest/v1/scan_assets?sha256=eq.${encodeURIComponent(sha256)}&user_id=eq.${userId}&order=created_at.desc&limit=1`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Fetch recent assets and return the first one whose perceptual hash is
 * within the given Hamming-distance threshold.
 * threshold = 8 bits out of 64 (≈12.5% difference) is "likely same photo"
 */
export async function findSimilarAsset(token, userId, perceptualHash, threshold = 8) {
  const rows = await supabaseFetch(
    `/rest/v1/scan_assets?user_id=eq.${userId}&order=created_at.desc&limit=15`,
    { method: 'GET', headers: authHeaders(token) },
  );
  if (!Array.isArray(rows)) return null;
  for (const asset of rows) {
    if (asset.perceptual_hash && hammingDistance(asset.perceptual_hash, perceptualHash) <= threshold) {
      return asset;
    }
  }
  return null;
}

/**
 * Given an asset id, find the most recent scan that references it.
 */
export async function getScanByAssetId(token, assetId) {
  const cols = 'id,user_id,body_fat,lean_mass,physique_score,symmetry_score,scan_confidence,muscle_assessment,scan_notes,created_at,engine_version,scan_status,duplicate_of_scan_id,asset_id,scan_context';
  const rows = await supabaseFetch(
    `/rest/v1/scans?asset_id=eq.${assetId}&order=created_at.desc&limit=1&select=${cols}`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) && rows[0] ? deserializeScan(rows[0]) : null;
}

/** Hex-encoded Hamming distance between two perceptual hashes */
function hammingDistance(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 64;
  let dist = 0;
  for (let i = 0; i < h1.length; i++) {
    const xor = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    // popcount nibble
    dist += [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4][xor];
  }
  return dist;
}

// ─── subscriptions ───────────────────────────────────────────────────────────

/**
 * Fetch the user's current subscription from public.subscriptions.
 * Premium access is ONLY granted for status in ['active', 'trialing'].
 * Returns null if no subscription exists, request fails, or only incomplete/stale rows.
 */
export async function getSubscription(token, userId) {
  if (!token || !userId) return null;
  try {
    // Fetch multiple rows — prefer active/trialing; never treat incomplete as premium.
    const rows = await supabaseFetch(
      `/rest/v1/subscriptions?user_id=eq.${userId}&select=id,user_id,status,stripe_customer_id,stripe_subscription_id,price_id,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at&order=updated_at.desc&limit=10`,
      { method: 'GET', headers: authHeaders(token) },
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // Prefer active/trialing; fall back to most recent only for display (canceled/past_due).
    // Do NOT return incomplete — it is not premium and should not be shown as "the" subscription.
    const best = rows.find(r => r.status === 'active' || r.status === 'trialing');
    if (best) return best;
    // For display: use most recent if it's a "relevant" non-incomplete state
    const fallback = rows.find(r => !['incomplete', 'incomplete_expired'].includes(r.status));
    return fallback || null;
  } catch (err) {
    console.warn('[subscription] getSubscription failed (non-fatal):', err?.message);
    return null;
  }
}

/**
 * Fetch or lazily create the user's entitlement row.
 * Returns null when the row cannot be read or created — do not invent counters client-side.
 */
export async function ensureEntitlements(token, userId) {
  if (!token || !userId) return null;
  console.info('[entitlements] ensure start', { user_id: userId });
  let row = null;
  try {
    const rows = await supabaseFetch(
      `/rest/v1/user_entitlements?user_id=eq.${userId}&select=user_id,free_scans_used,free_scan_limit,lifetime_scan_count,free_food_scans_used,free_food_scans_date,free_food_scans_used_today&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
    row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.warn('[entitlements] fetch failed', { user_id: userId, error: err?.message });
    return null;
  }
  if (row) {
    console.info('[entitlements] ok', { user_id: userId });
    return row;
  }
  console.info('[entitlements] no row — inserting default', { user_id: userId });
  try {
    const ins = await supabaseFetch('/rest/v1/user_entitlements', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        free_scans_used: 0,
        free_scan_limit: 2,
        lifetime_scan_count: 0,
      }),
    });
    const created = Array.isArray(ins) && ins[0] ? ins[0] : null;
    if (created) {
      console.info('[entitlements] created default row', { user_id: userId });
      return created;
    }
  } catch (e) {
    if (isConflictError(e)) {
      try {
        const rows = await supabaseFetch(
          `/rest/v1/user_entitlements?user_id=eq.${userId}&select=user_id,free_scans_used,free_scan_limit,lifetime_scan_count,free_food_scans_used,free_food_scans_date,free_food_scans_used_today&limit=1`,
          { method: 'GET', headers: authHeaders(token) },
        );
        const again = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (again) return again;
      } catch {}
    }
    console.warn('[entitlements] insert failed', { user_id: userId, error: e?.message });
  }
  return null;
}

/** @deprecated use ensureEntitlements */
export async function getEntitlements(token, userId) {
  return ensureEntitlements(token, userId);
}

// ─── physique_projections ───────────────────────────────────────────────────

function serializeProjection(userId, scanId, planId, plan, scan, profile) {
  const startBF    = toNumber(plan?.startBF   ?? scan?.bodyFat ?? scan?.bodyFatPct, 20);
  const targetBF   = toNumber(plan?.targetBF  ?? startBF, startBF);
  const startWeight = toNumber(profile?.weightLbs ?? profile?.weight, 170);
  const goal       = String(plan?.phase || 'Maintain').toLowerCase();
  const timelineWeeks = 12;

  // Estimate projected weight range from goal
  const iscut  = goal === 'cut';
  const isbulk = goal === 'bulk';
  const delta  = iscut ? -(startWeight * 0.05) : isbulk ? (startWeight * 0.03) : 0;

  // Visual keys — e.g. "bf_15" — used to look up before/after physique images
  const currentVisualKey   = `bf_${Math.round(startBF)}`;
  const projectedVisualKey = `bf_${Math.round(targetBF)}`;

  // Confidence: the scan field may be 'low'/'medium'/'high' string or a number
  const rawConf    = scan?.confidence ?? scan?.bodyFatConfidence ?? 'medium';
  const confidence = ['low', 'medium', 'high'].includes(String(rawConf).toLowerCase())
    ? String(rawConf).toLowerCase()
    : 'medium';

  const summary    = plan?.objective || plan?.whyThisWorks || scan?.assessment || scan?.limitingFactor || '';
  const disclaimer = 'AI visual estimate only. Individual results vary. Consult a qualified professional for medical or nutritional advice.';

  return {
    user_id:                 userId,
    scan_id:                 scanId,
    plan_id:                 planId,
    current_stage:           plan?.phase   || 'Maintain',
    projected_stage:         plan?.phase   || 'Maintain',
    projection_type:         'body_composition',
    timeline_weeks:          timelineWeeks,
    confidence,
    current_visual_key:      currentVisualKey,
    projected_visual_key:    projectedVisualKey,
    start_body_fat:          Number(startBF.toFixed(2)),
    projected_body_fat_low:  Number(Math.max(4,  targetBF - 2).toFixed(2)),
    projected_body_fat_high: Number(Math.min(50, targetBF + 2).toFixed(2)),
    start_weight:            Number(startWeight.toFixed(1)),
    projected_weight_low:    Number(Math.max(80, startWeight + delta - 3).toFixed(1)),
    projected_weight_high:   Number((startWeight + delta + 3).toFixed(1)),
    summary,
    disclaimer,
  };
}

/** True when migration 016 tables are not deployed — safe to skip personalization persistence only. */
function isPersonalizationTableMissingError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return (
    (m.includes('does not exist') && (m.includes('decision_engine') || m.includes('phase_history') || m.includes('muscle_priorities') || m.includes('plan_directives')))
    || m.includes('pgrst205')
    || (m.includes('relation') && m.includes('public.') && m.includes('does not exist'))
  );
}

/** PostgREST schema cache / missing column on an existing table. */
function isPostgrestColumnOrSchemaCacheError(err) {
  const m = String(err?.message || err || '');
  const ml = m.toLowerCase();
  return (
    ml.includes('schema cache')
    || (ml.includes('could not find') && ml.includes('column'))
    || (ml.includes('column') && ml.includes('does not exist'))
  );
}

function parseMissingColumnName(message) {
  const m = String(message || '');
  const q = m.match(/['"]([a-zA-Z0-9_]+)['"]\s+column/);
  if (q) return q[1];
  const alt = m.match(/column\s+['"]?([a-zA-Z0-9_]+)['"]?/i);
  return alt ? alt[1] : null;
}

/**
 * Latest food_logs for adherence heuristics (RLS: own rows only).
 */
export async function getFoodLogsRecentForAdherence(token, userId, limit = 150) {
  if (!token || !userId) return [];
  try {
    const rows = await supabaseFetch(
      `/rest/v1/food_logs?user_id=eq.${userId}&select=calories,protein_g,created_at&order=created_at.desc&limit=${limit}`,
      { method: 'GET', headers: authHeaders(token) },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('[food_logs] adherence fetch failed', err?.message);
    throw err;
  }
}

/**
 * Insert decision_engine_run. Returns null only if migration 016 is not applied; otherwise throws on failure.
 * Column/schema-cache mismatches are logged (table + column + payload) and retried once with a compatible shape.
 */
function personalizationTableError(table, message, cause) {
  const e = new Error(`${table}: ${message}`);
  e.personalizationTable = table;
  if (cause) {
    e.cause = cause;
    if (cause.postgrestCode != null) e.postgrestCode = cause.postgrestCode;
    if (cause.postgrestDetails != null) e.postgrestDetails = cause.postgrestDetails;
    if (cause.postgrestHint != null) e.postgrestHint = cause.postgrestHint;
    e.postgrestMessage = cause.postgrestMessage || cause.message || message;
  }
  return e;
}

/**
 * Optional debug: minimal row to verify client JWT + ids + RLS (may insert an extra row when enabled).
 * Enable: NEXT_PUBLIC_DEBUG_DECISION_ENGINE_PROBE=1 or localStorage massiq:debug:decision_engine_probe=1
 */
export async function probeMinimalDecisionEngineRun(token, userId, scanId, planId) {
  const envOn = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG_DECISION_ENGINE_PROBE === '1';
  const lsOn = typeof window !== 'undefined' && window.localStorage?.getItem('massiq:debug:decision_engine_probe') === '1';
  if (!envOn && !lsOn) return null;
  console.info('[db:decision-engine-run] PROBE — minimal insert (empty JSON)');
  try {
    const out = await createDecisionEngineRun(token, userId, {
      scanId,
      planId,
      engineVersion: 'debug-probe',
      triggerType: 'probe',
      inputSummary: {},
      outputJson: {},
    });
    console.info('[db:decision-engine-run] PROBE success — DB response', out);
    return out;
  } catch (err) {
    logPostgrestFailure('[db:decision-engine-run] PROBE failed', err, {
      user_id: userId,
      scan_id: scanId,
      plan_id: planId,
    });
    throw err;
  }
}

function jsonbObjectOrEmpty(v) {
  if (v != null && typeof v === 'object' && !Array.isArray(v)) return v;
  return {};
}

export async function createDecisionEngineRun(token, userId, payload) {
  const rawTrigger = payload.triggerType;
  if (rawTrigger == null || String(rawTrigger).trim() === '') {
    throw personalizationTableError('decision_engine_runs', 'triggerType is required (maps to trigger_type, NOT NULL)', null);
  }
  const safeTriggerType = String(rawTrigger).trim();

  const inputSummary = jsonbObjectOrEmpty(payload.inputSummary);
  const outputJson = jsonbObjectOrEmpty(payload.outputJson);
  const inputSnapshot = jsonbObjectOrEmpty(payload.inputSnapshot ?? inputSummary);
  const outputSnapshot = jsonbObjectOrEmpty(payload.outputSnapshot ?? outputJson);

  const engineVersion = String(payload.engineVersion || '2.0.0').trim() || '2.0.0';

  const baseRow = {
    user_id: userId,
    scan_id: payload.scanId || null,
    plan_id: payload.planId || null,
    engine_version: engineVersion,
    trigger_type: safeTriggerType,
    input_summary: inputSummary,
    output_json: outputJson,
    input_snapshot: inputSnapshot,
    output_snapshot: outputSnapshot,
  };

  console.info('[db:decision-engine-run] payload', {
    insert_keys: Object.keys(baseRow),
    payload_json: JSON.stringify(baseRow),
    user_id: userId,
    scan_id: baseRow.scan_id,
    plan_id: baseRow.plan_id,
    scan_id_null: baseRow.scan_id == null,
    plan_id_null: baseRow.plan_id == null,
    engine_version: baseRow.engine_version,
    trigger_type: safeTriggerType,
    trigger_type_raw: rawTrigger,
  });

  const postRow = async (row) => {
    const rows = await supabaseFetch('/rest/v1/decision_engine_runs', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!out?.id) {
      throw new Error('[decision_engine_runs] insert returned no row id');
    }
    return out;
  };

  console.info('[db:decision-engine-run] write start', {
    user_id: userId,
    scan_id: baseRow.scan_id,
    trigger_type: safeTriggerType,
  });
  try {
    const out = await postRow(baseRow);
    console.info('[db:decision-engine-run] ok', { id: out.id, trigger_type: safeTriggerType });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:decision-engine-run] insert FAILED', err, baseRow);
    if (isPersonalizationTableMissingError(err)) {
      console.warn('[db:decision-engine-run] migration 016 not applied — personalization tables skipped', err?.message);
      return null;
    }
    const missing = parseMissingColumnName(err?.message);
    if (isPostgrestColumnOrSchemaCacheError(err)) {
      console.error('[db:decision-engine-run] schema/column mismatch', {
        table: 'decision_engine_runs',
        missing_column: missing,
        error: err?.message,
      });
      throw personalizationTableError('decision_engine_runs', err?.message || String(err), err);
    }
    console.error('[db:decision-engine-run] FAILED', err?.message);
    throw personalizationTableError('decision_engine_runs', err?.message || String(err), err);
  }
}

export async function createPhaseHistoryRow(token, userId, payload) {
  const row = {
    user_id: userId,
    plan_id: payload.planId || null,
    scan_id: payload.scanId || null,
    from_phase: payload.fromPhase ?? null,
    to_phase: payload.toPhase,
    reason: payload.reason || null,
  };
  console.info('[db:phase-history] payload', {
    insert_keys: Object.keys(row),
    payload_json: JSON.stringify(row),
    user_id: row.user_id,
    scan_id: row.scan_id,
    plan_id: row.plan_id,
    scan_id_null: row.scan_id == null,
    plan_id_null: row.plan_id == null,
    from_phase: row.from_phase,
    to_phase: row.to_phase,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/phase_history', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!out?.id) throw new Error('[phase_history] insert returned no id');
    console.info('[db:phase-history] ok', { id: out.id });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:phase-history] insert FAILED', err, row);
    throw personalizationTableError('phase_history', err?.message || String(err), err);
  }
}

export async function createMusclePriorityRow(token, userId, payload) {
  const rawMuscle = payload.muscle;
  const muscle = rawMuscle != null ? String(rawMuscle).trim() : '';
  if (!muscle) {
    throw personalizationTableError('muscle_priorities', 'muscle is required', null);
  }
  const priorityLevel = String(payload.priorityLevel ?? 'medium').trim() || 'medium';
  const rationale = payload.rationale != null ? String(payload.rationale) : null;

  const row = {
    user_id: userId,
    scan_id: payload.scanId || null,
    muscle,
    priority_level: priorityLevel,
    rationale,
  };

  console.info('[db:muscle-priority] payload', {
    insert_keys: Object.keys(row),
    payload_json: JSON.stringify(row),
    user_id: row.user_id,
    scan_id: row.scan_id,
    scan_id_null: row.scan_id == null,
    muscle: row.muscle,
    priority_level: row.priority_level,
    rationale: row.rationale,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/muscle_priorities', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!out?.id) throw new Error('[muscle_priorities] insert returned no id');
    console.info('[db:muscle-priority] ok', { id: out.id, muscle: row.muscle });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:muscle-priority] insert FAILED', err, row);
    throw personalizationTableError('muscle_priorities', err?.message || String(err), err);
  }
}

export async function createPlanDirectiveRow(token, userId, payload) {
  const rawType = payload.directiveType;
  const directiveType = rawType != null ? String(rawType).trim() : '';
  if (!directiveType) {
    throw personalizationTableError(
      'plan_directives',
      'directive_type is required (pass directiveType)',
      null,
    );
  }
  const directives = jsonbObjectOrEmpty(payload.directives);
  const row = {
    user_id: userId,
    plan_id: payload.planId || null,
    scan_id: payload.scanId || null,
    directive_type: directiveType,
    directives,
  };
  console.info('[db:plan-directive] payload', {
    insert_keys: Object.keys(row),
    payload_json: JSON.stringify(row),
    user_id: row.user_id,
    scan_id: row.scan_id,
    plan_id: row.plan_id,
    scan_id_null: row.scan_id == null,
    plan_id_null: row.plan_id == null,
    directive_type: row.directive_type,
  });
  try {
    const rows = await supabaseFetch('/rest/v1/plan_directives', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    const out = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!out?.id) throw new Error('[plan_directives] insert returned no id');
    console.info('[db:plan-directive] ok', { id: out.id, directive_type: row.directive_type });
    return out;
  } catch (err) {
    logPostgrestFailure('[db:plan-directive] insert FAILED', err, row);
    throw personalizationTableError('plan_directives', err?.message || String(err), err);
  }
}

export async function createUserFeedbackEvent(token, userId, payload) {
  const row = {
    user_id: userId,
    event_type: payload.eventType || 'unknown',
    payload: payload.payload || {},
    scan_id: payload.scanId || null,
  };
  try {
    const rows = await supabaseFetch('/rest/v1/user_feedback_events', {
      method: 'POST',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.warn('[user_feedback_events] skip', err?.message);
    return null;
  }
}

/**
 * Orchestrates decision_engine_runs, phase_history, muscle_priorities, plan_directives.
 * Throws if any write fails after `decision_engine_runs` exists (migration applied).
 * Returns silently if migration 016 is not deployed (first insert returns null).
 */
export async function persistPersonalizationArtifacts(token, userId, {
  scanId,
  planId,
  previousPhase,
  engineOutput,
  inputSummary = {},
}) {
  if (!scanId) {
    throw personalizationTableError('precondition', 'scan_id is missing — cannot persist personalization');
  }
  if (!engineOutput) {
    throw personalizationTableError(
      'decision_engine_runs',
      'decision engine output missing on scan entry (expected entry.decisionEngine or scanContext.decision_engine)',
    );
  }
  console.info('[db:personalization] resolved ids', {
    user_id: userId,
    scan_id: scanId,
    plan_id: planId,
    scan_id_null: scanId == null,
    plan_id_null: planId == null,
  });
  const run = await createDecisionEngineRun(token, userId, {
    scanId,
    planId,
    engineVersion: engineOutput.engine_version || '2.0.0',
    triggerType: 'post_scan_apply',
    inputSummary,
    outputJson: engineOutput,
  });
  if (!run) return;

  const newPhase = engineOutput.phase_decision?.recommended_phase;
  if (previousPhase != null && newPhase != null && String(previousPhase) !== String(newPhase)) {
    await createPhaseHistoryRow(token, userId, {
      planId,
      scanId,
      fromPhase: previousPhase,
      toPhase: newPhase,
      reason: engineOutput.phase_decision?.reason || engineOutput.phase_decision?.rationale || null,
    });
  }
  const ta = engineOutput.training_adjustments || {};
  for (const m of ta.priority_muscles_high || []) {
    await createMusclePriorityRow(token, userId, {
      scanId,
      muscle: m,
      priorityLevel: 'high',
      rationale: (ta.exercise_emphasis || []).find((x) => String(x).includes(m)) || null,
    });
  }
  for (const m of ta.priority_muscles_medium || []) {
    await createMusclePriorityRow(token, userId, {
      scanId,
      muscle: m,
      priorityLevel: 'medium',
    });
  }
  const na = engineOutput.nutrition_adjustments || {};
  await createPlanDirectiveRow(token, userId, {
    planId,
    scanId,
    directiveType: 'nutrition',
    directives: {
      deficit_aggressiveness: na.deficit_aggressiveness,
      carb_timing: na.carb_timing,
      simplify_meals: na.simplify_meals,
      carb_training_emphasis: na.carb_training_emphasis,
      directives: na.directives,
    },
  });
  await createPlanDirectiveRow(token, userId, {
    planId,
    scanId,
    directiveType: 'training',
    directives: {
      weekly_set_targets: ta.weekly_set_targets,
      frequency_targets: ta.frequency_targets,
      volume_delta_sets: ta.volume_delta_sets,
      unilateral: ta.unilateral,
      recovery_notes: ta.recovery_notes,
    },
  });
}

export async function createProjection(token, userId, scanId, planId, plan, scan, profile) {
  if (!scanId) throw new Error('[projection] Missing scanId');
  if (!planId) throw new Error('[projection] Missing planId');
  const row = serializeProjection(userId, scanId, planId, plan, scan, profile);
  console.info('[sync] createProjection:payload', row);
  const rows = await supabaseFetch('/rest/v1/physique_projections', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  console.info('[sync] createProjection:response', rows);
  const result = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!result?.id) throw new Error('[projection] Insert succeeded but no id returned');
  return result;
}

// ─── Domain persistence aliases (single import surface for app code) ─────────
export const saveProfile = upsertProfile;
export const saveScan = createScan;
export const saveProgressMetrics = upsertProgressMetric;
export const saveScanComparison = createScanComparison;
export const savePlanDecision = createScanDecision;
export const saveDecisionLog = createDecisionLog;
export const savePlanAdjustment = createPlanAdjustment;
export const saveMealPlan = upsertMealPlan;
export const saveWorkoutProgram = upsertWorkoutProgram;
export const refreshSubscriptionState = getSubscription;
export const fetchPriorScanForComparison = getPriorScanForComparison;
