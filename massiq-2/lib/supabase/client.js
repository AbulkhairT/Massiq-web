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
    throw new Error(payload?.msg || payload?.error_description || payload?.message || `Request failed (${res.status})`);
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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function serializeProfile(userId, profile) {
  return {
    id: userId,
    age: toNumber(profile?.age),
    weight: toNumber(profile?.weightLbs),
    height: toNumber(profile?.heightCm),
    gender: profile?.gender || null,
    goal: profile?.goal || null,
    activity_level: profile?.activity || null,
    unit_system: profile?.unitSystem || 'imperial',
    food_preferences: normalizeStringArray(profile?.dietPrefs),
    dietary_restrictions: normalizeStringArray(profile?.avoid),
    reminder_settings: profile?.reminders || {},
  };
}

function deserializeProfile(row) {
  if (!row) return null;
  const heightCm = toNumber(row.height, 0) || 0;
  return {
    id: row.id,
    name: 'Athlete',
    age: toNumber(row.age, null),
    weightLbs: toNumber(row.weight, null),
    heightCm: toNumber(row.height, null),
    heightIn: heightCm ? Number((heightCm / 2.54).toFixed(1)) : null,
    gender: row.gender || 'Male',
    goal: row.goal || 'Maintain',
    activity: row.activity_level || 'Moderate',
    unitSystem: row.unit_system || 'imperial',
    dietPrefs: normalizeStringArray(row.food_preferences),
    avoid: normalizeStringArray(row.dietary_restrictions),
    reminders: row.reminder_settings || {},
  };
}

function serializePlan(userId, plan) {
  const macros = plan?.dailyTargets || plan?.macros || {};
  return {
    user_id: userId,
    phase: plan?.phase || 'Maintain',
    calories: toNumber(macros.calories),
    protein: toNumber(macros.protein),
    carbs: toNumber(macros.carbs),
    fat: toNumber(macros.fat),
    is_active: true,
    rationale: plan?.objective || plan?.phaseReason || '',
    workout_program: plan?.workoutProgram || { trainDays: plan?.trainDays || macros.trainingDaysPerWeek || 4 },
    meal_guidance: plan?.mealGuidance || { dailyTargets: plan?.dailyTargets || macros },
    source_scan_id: plan?.sourceScanId || null,
  };
}

function deserializePlan(row) {
  if (!row) return null;
  const macros = {
    calories: toNumber(row.calories, 2200),
    protein: toNumber(row.protein, 160),
    carbs: toNumber(row.carbs, 220),
    fat: toNumber(row.fat, 65),
  };
  return {
    phase: row.phase || 'Maintain',
    phaseName: `${row.phase || 'Maintain'} Phase`,
    objective: row.rationale || '',
    macros,
    dailyTargets: {
      ...macros,
      steps: row?.meal_guidance?.dailyTargets?.steps || 9000,
      sleepHours: row?.meal_guidance?.dailyTargets?.sleepHours || 8,
      waterLiters: row?.meal_guidance?.dailyTargets?.waterLiters || 3,
      trainingDaysPerWeek: row?.workout_program?.trainDays || row?.meal_guidance?.dailyTargets?.trainingDaysPerWeek || 4,
      cardioDays: row?.meal_guidance?.dailyTargets?.cardioDays || 2,
    },
    trainDays: row?.workout_program?.trainDays || 4,
    createdAt: row.created_at || null,
    sourceScanId: row.source_scan_id || null,
  };
}

function serializeScan(userId, scan) {
  return {
    user_id: userId,
    body_fat: toNumber(scan?.bodyFat ?? scan?.bodyFatPct),
    lean_mass: toNumber(scan?.leanMass),
    symmetry: toNumber(scan?.symmetryScore ?? scan?.symmetry),
    confidence: toNumber(scan?.confidence),
    raw_result: scan,
  };
}

function deserializeScan(row) {
  const raw = row?.raw_result || {};
  return {
    ...raw,
    id: row?.id || raw.id,
    date: raw.date || row?.created_at,
    bodyFat: toNumber(row?.body_fat, toNumber(raw.bodyFat ?? raw.bodyFatPct, null)),
    bodyFatPct: toNumber(row?.body_fat, toNumber(raw.bodyFatPct ?? raw.bodyFat, null)),
    leanMass: toNumber(row?.lean_mass, toNumber(raw.leanMass, null)),
    symmetryScore: toNumber(row?.symmetry, toNumber(raw.symmetryScore ?? raw.symmetry, null)),
    confidence: toNumber(row?.confidence, toNumber(raw.confidence, 0.75)),
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

export async function refreshSession(refreshToken) {
  const data = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  storeSession(data);
  return data;
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
  const row = serializeProfile(userId, profile);
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
  const rows = await supabaseFetch(`/rest/v1/profiles?select=id,age,weight,height,gender,goal,activity_level,unit_system,food_preferences,dietary_restrictions,reminder_settings,created_at&id=eq.${userId}&limit=1`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return Array.isArray(rows) && rows[0] ? deserializeProfile(rows[0]) : null;
}

export async function upsertPlan(token, userId, plan, scanHistory = []) {
  const row = serializePlan(userId, plan);
  return supabaseFetch('/rest/v1/plans?on_conflict=user_id', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
}

export async function getPlan(token, userId) {
  const rows = await supabaseFetch(`/rest/v1/plans?select=id,user_id,phase,calories,protein,carbs,fat,is_active,rationale,workout_program,meal_guidance,source_scan_id,created_at&user_id=eq.${userId}&is_active=eq.true&order=created_at.desc&limit=1`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return Array.isArray(rows) && rows[0] ? deserializePlan(rows[0]) : null;
}

export async function createScan(token, userId, scan) {
  const row = serializeScan(userId, scan);
  const rows = await supabaseFetch('/rest/v1/scans', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  return Array.isArray(rows) && rows[0] ? deserializeScan(rows[0]) : null;
}

export async function getScans(token, userId, limit = 25) {
  const rows = await supabaseFetch(`/rest/v1/scans?select=id,user_id,body_fat,lean_mass,symmetry,confidence,raw_result,created_at&user_id=eq.${userId}&order=created_at.desc&limit=${limit}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return Array.isArray(rows) ? rows.map(deserializeScan).reverse() : [];
}
