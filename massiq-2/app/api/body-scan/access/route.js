import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function authUserId(req) {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

async function verifyAuth(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = authUserId(req);
  if (!supabaseUrl || !anonKey || !token) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id || null;
}

async function adminFetch(path) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${supabaseUrl}${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function ensureEntitlementsRow(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const existing = await adminFetch(`/rest/v1/user_entitlements?user_id=eq.${userId}&select=user_id,free_scans_used,free_scan_limit,lifetime_scan_count&limit=1`);
  if (Array.isArray(existing) && existing[0]) return existing[0];
  const ins = await fetch(`${supabaseUrl}/rest/v1/user_entitlements?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ user_id: userId, free_scans_used: 0, free_scan_limit: 2, lifetime_scan_count: 0 }),
  });
  if (!ins.ok) return null;
  const rows = await ins.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function GET(req) {
  const userId = await verifyAuth(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  console.info('[entitlements:body] entitlement fetch', { user_id: userId });

  const subRows = await adminFetch(`/rest/v1/subscriptions?user_id=eq.${userId}&select=status&order=updated_at.desc.nullslast&limit=1`);
  const subStatus = Array.isArray(subRows) && subRows[0] ? subRows[0].status : null;
  const isPremium = ['active', 'trialing'].includes(String(subStatus || '').toLowerCase());

  const ent = await ensureEntitlementsRow(userId);
  if (!ent) return NextResponse.json({ error: 'Could not load entitlements' }, { status: 500 });

  const freeScansUsed = Number(ent.free_scans_used) || 0;
  const freeScanLimit = Number(ent.free_scan_limit) || 2;
  const lifetimeScanCount = Number(ent.lifetime_scan_count) || 0;
  const freeScansRemaining = Math.max(freeScanLimit - freeScansUsed, 0);
  const canScan = isPremium || freeScansRemaining > 0;

  return NextResponse.json({
    isPremium,
    subscriptionStatus: subStatus || 'none',
    freeScansUsed,
    freeScanLimit,
    freeScansRemaining,
    lifetimeScanCount,
    canScan,
    entitlements: {
      free_scans_used: freeScansUsed,
      free_scan_limit: freeScanLimit,
      lifetime_scan_count: lifetimeScanCount,
    },
  });
}
