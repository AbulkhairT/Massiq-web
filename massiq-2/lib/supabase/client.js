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

async function supabaseFetch(path, opts = {}) {
  if (!hasConfig()) throw new Error('Supabase env is missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
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
  const row = { id: userId, profile, updated_at: new Date().toISOString() };
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
  const rows = await supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${userId}&limit=1`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function upsertPlan(token, userId, plan, scanHistory = []) {
  const row = { user_id: userId, plan, scan_history: scanHistory, updated_at: new Date().toISOString() };
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
  const rows = await supabaseFetch(`/rest/v1/plans?select=*&user_id=eq.${userId}&limit=1`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
