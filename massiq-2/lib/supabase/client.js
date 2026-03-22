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

async function supabaseFetch(path, opts = {}, retries = 1) {
  if (!hasConfig()) throw new Error('Supabase env is missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const isTransient = res.status >= 500 || res.status === 429;
    if (isTransient && retries > 0) {
      await new Promise(r => setTimeout(r, 350));
      return supabaseFetch(path, opts, retries - 1);
    }
    const message = payload?.msg || payload?.error_description || payload?.message || `Request failed (${res.status})`;
    throw new Error(`[supabase:${path}] ${message}`);
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
    dietPrefs: [],
    avoid: [],
    reminders: {},
  };
}

function serializePlan(userId, plan) {
  const macros = plan?.dailyTargets || plan?.macros || {};
  if (!userId) throw new Error('[plans] Missing user_id for plan insert');
  return {
    user_id: userId,
    phase: toPhaseValue(plan?.phase),
    calories: toSafeInt(macros.calories, 'calories'),
    protein: toSafeInt(macros.protein, 'protein'),
    carbs: toSafeInt(macros.carbs, 'carbs'),
    fat: toSafeInt(macros.fat, 'fat'),
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

function deserializeScan(row) {
  const ma  = row?.muscle_assessment || {};
  const ctx = row?.scan_context      || {};
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
 * On success, the user receives a link to reset their password.
 */
export async function requestPasswordReset(email) {
  if (!hasConfig()) throw new Error('Supabase env missing');
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return supabaseFetch('/auth/v1/recover', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, redirect_to: `${appUrl}/app` }),
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
    // Stale/revoked refresh token — clear it so the user sees a clean login form
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('refresh token') || msg.includes('invalid') || msg.includes('not found')) {
      clearStoredSession();
      return null;
    }
    throw err;
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
  if (!session?.access_token) return null;
  const expiresAt = Number(session.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt - now < 90 && session.refresh_token) {
    return refreshSession(session.refresh_token);
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
  const full = serializeProfile(userId, profile);
  // Strip columns that don't exist in the current DB schema
  // (name, unit_system are optional additions not yet in the base schema)
  const row = { ...full };
  delete row.name;
  delete row.unit_system;
  return supabaseFetch('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
}

export async function getProfile(token, userId) {
  const rows = await supabaseFetch(
    `/rest/v1/profiles?select=id,age,weight,height,gender,goal,activity_level,created_at&id=eq.${userId}&limit=1`,
    { method: 'GET', headers: authHeaders(token) },
  );
  return Array.isArray(rows) && rows[0] ? deserializeProfile(rows[0]) : null;
}

export async function ensureProfile(token, userId) {
  const existing = await getProfile(token, userId);
  if (existing) return existing;
  await supabaseFetch('/rest/v1/profiles', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ id: userId }),
  });
  return getProfile(token, userId);
}

export async function upsertPlan(token, userId, plan) {
  const row = serializePlan(userId, plan);
  console.info('[sync] upsertPlan:payload', { userId, phase: row.phase, calories: row.calories, protein: row.protein });

  // Check if a plan already exists for this user
  const existing = await supabaseFetch(
    `/rest/v1/plans?select=id&user_id=eq.${userId}&limit=1`,
    { method: 'GET', headers: authHeaders(token) },
  );
  const existingId = Array.isArray(existing) && existing[0]?.id;

  let rows;
  if (existingId) {
    // PATCH existing row — returns updated representation
    rows = await supabaseFetch(`/rest/v1/plans?id=eq.${existingId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(token), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    // PATCH may return empty array on some PostgREST configs; fall back to existingId
    const planRow = (Array.isArray(rows) && rows[0]) ? rows[0] : { id: existingId };
    console.info('[sync] upsertPlan:patch:ok', { planId: planRow.id });
    return planRow;
  }

  // INSERT new row
  rows = await supabaseFetch('/rest/v1/plans', {
    method: 'POST',
    headers: { ...authHeaders(token), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const planRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
  console.info('[sync] upsertPlan:insert:ok', { planId: planRow?.id });
  if (!planRow?.id) throw new Error('[plans] Insert succeeded but no id returned');
  return planRow;
}

export async function getPlan(token, userId) {
  const rows = await supabaseFetch(`/rest/v1/plans?select=id,user_id,phase,calories,protein,carbs,fat,created_at&user_id=eq.${userId}&order=created_at.desc&limit=1`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return Array.isArray(rows) && rows[0] ? deserializePlan(rows[0]) : null;
}

export async function createScan(token, userId, scan) {
  const row = serializeScan(userId, scan);
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
  const filename = `${Date.now()}.${ext}`;
  const path     = `${userId}/${filename}`;
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
 * Fetch the user's subscription row from public.subscriptions.
 * Returns null if no subscription exists or if the request fails.
 * Read-only: no client writes to this table (webhook-only).
 */
export async function getSubscription(token, userId) {
  if (!token || !userId) return null;
  try {
    const rows = await supabaseFetch(
      `/rest/v1/subscriptions?user_id=eq.${userId}&select=id,user_id,status,stripe_customer_id,stripe_subscription_id,price_id,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at&limit=1`,
      { method: 'GET', headers: authHeaders(token) },
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    // Non-fatal: subscriptions table may not exist yet in dev
    console.warn('[subscription] getSubscription failed (non-fatal):', err?.message);
    return null;
  }
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
