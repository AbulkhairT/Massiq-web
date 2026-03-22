import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
 * DELETE /api/user/scan-history
 *
 * Deletes all scan rows, scan_asset rows, and Storage objects for the
 * authenticated user. Does NOT touch user_entitlements — free scan
 * eligibility is tracked separately and is never restored by deletion.
 *
 * Security:
 *   - JWT verified via /auth/v1/user (Supabase anon key + user token)
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
  } catch (err) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // ── 2. Fetch storage paths from scan_assets (so we can delete objects) ───
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
    console.warn('[delete-scan-history] Could not fetch scan_assets (continuing):', err.message);
  }

  // ── 3. Delete scans (cascade deletes scan_assets via FK if configured,
  //       otherwise we delete both explicitly) ─────────────────────────────
  const errors = [];

  try {
    await sbFetch(`/rest/v1/scans?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
  } catch (err) {
    errors.push(`scans: ${err.message}`);
  }

  try {
    await sbFetch(`/rest/v1/scan_assets?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
  } catch (err) {
    errors.push(`scan_assets: ${err.message}`);
  }

  // ── 4. Delete Storage objects ─────────────────────────────────────────────
  if (storagePaths.length > 0) {
    try {
      await sbFetch('/storage/v1/object/scan-photos', {
        method: 'DELETE',
        headers: serviceHeaders(),
        body: JSON.stringify({ prefixes: storagePaths }),
      });
    } catch (err) {
      // Non-fatal: storage objects may already be gone
      console.warn('[delete-scan-history] Storage delete failed (non-fatal):', err.message);
    }
  }

  if (errors.length > 0) {
    console.error('[delete-scan-history] Partial failure:', errors);
    return NextResponse.json(
      { error: 'Partial deletion failure', details: errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deleted: { storagePaths: storagePaths.length } });
}
