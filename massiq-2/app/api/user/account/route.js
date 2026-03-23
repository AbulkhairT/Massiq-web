import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;

function anonHeaders(token) {
  return {
    apikey:        SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function serviceHeaders() {
  return {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbFetch(path, opts) {
  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message || body?.error_description || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

/**
 * DELETE /api/user/account
 *
 * Permanently deletes the authenticated user's account and all associated data:
 *   - Storage objects (scan photos)
 *   - scan_assets rows
 *   - scans rows
 *   - user_entitlements row
 *   - physique_projections rows
 *   - plans rows
 *   - profiles row
 *   - subscriptions rows
 *   - auth.users entry (via Supabase Admin API)
 *
 * Data cascade: auth.users ON DELETE CASCADE will clean up any remaining rows
 * that have user_id → auth.users FK, so the explicit deletes are belt-and-suspenders.
 *
 * Security:
 *   - JWT verified via /auth/v1/user before any deletion
 *   - All destructive operations use the service role key
 */
export async function DELETE(request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // ── 1. Verify the caller's JWT ────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  let userId;
  try {
    const user = await sbFetch('/auth/v1/user', {
      method: 'GET',
      headers: anonHeaders(token),
    });
    userId = user?.id;
    if (!userId) throw new Error('No user id in token response');
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // ── 2. Fetch storage paths before deleting rows ───────────────────────────
  let storagePaths = [];
  try {
    const assets = await sbFetch(
      `/rest/v1/scan_assets?user_id=eq.${userId}&select=storage_path`,
      { method: 'GET', headers: serviceHeaders() },
    );
    storagePaths = Array.isArray(assets)
      ? assets.map(a => a.storage_path).filter(Boolean)
      : [];
  } catch (err) {
    console.warn('[delete-account] Could not fetch scan_assets (continuing):', err.message);
  }

  // ── 3. Delete storage objects ─────────────────────────────────────────────
  if (storagePaths.length > 0) {
    try {
      await sbFetch('/storage/v1/object/scan-photos', {
        method: 'DELETE',
        headers: serviceHeaders(),
        body: JSON.stringify({ prefixes: storagePaths }),
      });
    } catch (err) {
      console.warn('[delete-account] Storage delete failed (continuing):', err.message);
    }
  }

  // ── 4. Delete application data (order matters for FK constraints) ─────────
  const tables = [
    'physique_projections',
    'scans',
    'scan_assets',
    'user_entitlements',
    'plans',
    'subscriptions',
    'profiles',
  ];

  const errors = [];
  for (const table of tables) {
    try {
      await sbFetch(`/rest/v1/${table}?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      });
    } catch (err) {
      // Log but continue — auth.users deletion cascade will handle stragglers
      console.warn(`[delete-account] Failed to delete from ${table}:`, err.message);
      errors.push(`${table}: ${err.message}`);
    }
  }

  // ── 5. Delete auth.users entry (Supabase Admin API) ───────────────────────
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Admin delete failed (${res.status}): ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('[delete-account] Auth user deletion failed:', err.message);
    return NextResponse.json(
      { error: 'Account deletion failed — please contact support', details: err.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
