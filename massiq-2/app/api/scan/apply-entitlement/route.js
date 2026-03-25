import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ENT_SELECT =
  'user_id,free_scans_used,free_scan_limit,lifetime_scan_count,free_food_scans_used,free_food_scans_date,free_food_scans_used_today';

async function verifyUser(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return { error: 'Server misconfigured', status: 500 };
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return { error: 'Unauthorized', status: 401 };
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return { error: 'Unauthorized', status: 401 };
    const user = await res.json();
    const userId = user?.id;
    if (!userId || typeof userId !== 'string') return { error: 'Unauthorized', status: 401 };
    return { userId, bearerToken, supabaseUrl, anonKey };
  } catch {
    return { error: 'Unauthorized', status: 401 };
  }
}

async function fetchEntitlementsUser(supabaseUrl, anonKey, bearerToken, userId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_entitlements?user_id=eq.${userId}&select=${ENT_SELECT}&limit=1`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${bearerToken}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Ensure default row exists (server-side, service role).
 */
async function ensureEntitlementsRowService(supabaseUrl, serviceKey, userId) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Prefer: 'return=representation',
  };
  const ins = await fetch(`${supabaseUrl}/rest/v1/user_entitlements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      free_scans_used: 0,
      free_scan_limit: 2,
      lifetime_scan_count: 0,
    }),
  });
  if (ins.ok) {
    const rows = await ins.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }
  const text = await ins.text().catch(() => '');
  if (ins.status === 409 || /duplicate|unique/i.test(text)) {
    return null;
  }
  console.warn('[scan:apply-entitlement] ensure row insert non-ok', { status: ins.status, body: text.slice(0, 200) });
  return null;
}

/**
 * Fallback when RPC is missing or fails: read scan with service role, increment counters.
 */
async function applyEntitlementFallback(serviceKey, supabaseUrl, userId, scanId) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  const scanRes = await fetch(
    `${supabaseUrl}/rest/v1/scans?id=eq.${scanId}&user_id=eq.${userId}&select=id,scan_status,duplicate_of_scan_id`,
    { headers },
  );
  if (!scanRes.ok) {
    const t = await scanRes.text().catch(() => '');
    throw new Error(`scan lookup failed (${scanRes.status}): ${t.slice(0, 200)}`);
  }
  const scanRows = await scanRes.json().catch(() => []);
  const scan = Array.isArray(scanRows) && scanRows[0] ? scanRows[0] : null;
  if (!scan) {
    return { ok: false, error: 'scan_not_found', increment_applied: false, entitlements: null };
  }

  const st = String(scan.scan_status || 'complete').toLowerCase();
  const dupId = scan.duplicate_of_scan_id;
  if (st === 'duplicate' || dupId) {
    const ent = await fetchEntitlementsService(supabaseUrl, serviceKey, userId);
    return {
      ok: true,
      increment_applied: false,
      reason: 'duplicate_skip',
      entitlements: ent,
    };
  }
  if (st === 'failed' || st === 'error') {
    const ent = await fetchEntitlementsService(supabaseUrl, serviceKey, userId);
    return {
      ok: true,
      increment_applied: false,
      reason: 'failed_scan_skip',
      entitlements: ent,
    };
  }

  await ensureEntitlementsRowService(supabaseUrl, serviceKey, userId);

  const entRes = await fetch(
    `${supabaseUrl}/rest/v1/user_entitlements?user_id=eq.${userId}&select=free_scans_used,free_scan_limit,lifetime_scan_count&limit=1`,
    { headers },
  );
  const entRows = await entRes.json().catch(() => []);
  const cur = Array.isArray(entRows) && entRows[0] ? entRows[0] : { free_scans_used: 0, free_scan_limit: 2, lifetime_scan_count: 0 };

  const patchRes = await fetch(`${supabaseUrl}/rest/v1/user_entitlements?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      free_scans_used: (Number(cur.free_scans_used) || 0) + 1,
      lifetime_scan_count: (Number(cur.lifetime_scan_count) || 0) + 1,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!patchRes.ok) {
    const t = await patchRes.text().catch(() => '');
    throw new Error(`entitlements patch failed (${patchRes.status}): ${t.slice(0, 300)}`);
  }
  const updated = await patchRes.json().catch(() => []);
  const row = Array.isArray(updated) && updated[0] ? updated[0] : null;
  const full = await fetchEntitlementsService(supabaseUrl, serviceKey, userId);
  return {
    ok: true,
    increment_applied: true,
    reason: 'new_scan_fallback',
    entitlements: full || row,
  };
}

async function fetchEntitlementsService(supabaseUrl, serviceKey, userId) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_entitlements?user_id=eq.${userId}&select=${ENT_SELECT}&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * POST /api/scan/apply-entitlement
 * Body: { scan_id: uuid }
 *
 * Server-side application of body-scan entitlement after a successful scans row insert.
 * Uses DB RPC apply_body_scan_entitlement with the user's JWT; falls back to service-role
 * PATCH if RPC is unavailable.
 */
export async function POST(req) {
  const auth = await verifyUser(req);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { userId, bearerToken, supabaseUrl, anonKey } = auth;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const scanId = body?.scan_id;
  if (!scanId || typeof scanId !== 'string') {
    return NextResponse.json({ error: 'scan_id is required' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('[scan:apply-entitlement] SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  console.info('[scan:apply-entitlement] start', { user_id: userId, scan_id: scanId });

  try {
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_body_scan_entitlement`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_scan_id: scanId }),
    });

    const rpcText = await rpcRes.text().catch(() => '');
    let rpcJson = null;
    if (rpcText) {
      try {
        rpcJson = JSON.parse(rpcText);
      } catch {
        rpcJson = { raw: rpcText.slice(0, 200) };
      }
    }

    if (rpcRes.ok && rpcJson && typeof rpcJson === 'object') {
      const ent = await fetchEntitlementsUser(supabaseUrl, anonKey, bearerToken, userId);
      console.info('[scan:apply-entitlement] rpc ok', {
        user_id: userId,
        scan_id: scanId,
        increment_applied: rpcJson.increment_applied === true,
        free_scans_used: rpcJson.free_scans_used ?? ent?.free_scans_used,
      });
      return NextResponse.json({
        ok: rpcJson.ok !== false,
        rpc: rpcJson,
        entitlements: ent,
      });
    }

    console.warn('[scan:apply-entitlement] rpc failed — fallback', {
      user_id: userId,
      scan_id: scanId,
      status: rpcRes.status,
      body: rpcText.slice(0, 300),
    });

    const fallback = await applyEntitlementFallback(serviceKey, supabaseUrl, userId, scanId);
    const ent =
      fallback.entitlements ||
      (await fetchEntitlementsUser(supabaseUrl, anonKey, bearerToken, userId)) ||
      (await fetchEntitlementsService(supabaseUrl, serviceKey, userId));

    console.info('[scan:apply-entitlement] fallback result', {
      user_id: userId,
      scan_id: scanId,
      increment_applied: fallback.increment_applied,
      reason: fallback.reason || null,
    });

    return NextResponse.json({
      ok: fallback.ok !== false,
      rpc: rpcJson,
      fallback: true,
      increment_applied: fallback.increment_applied,
      reason: fallback.reason,
      entitlements: ent,
    });
  } catch (err) {
    console.error('[scan:apply-entitlement] error', { user_id: userId, scan_id: scanId, message: err?.message });
    return NextResponse.json({ error: err?.message || 'apply_entitlement_failed' }, { status: 500 });
  }
}
