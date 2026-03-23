import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FREE_FOOD_SCAN_LIMIT = 2;

function bad(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function verifyUser(bearerToken) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

async function getSubscription(token, userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=status,updated_at&order=updated_at.desc&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } }
    );
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.find(r => r.status === 'active' || r.status === 'trialing') || rows[0];
  } catch {
    return null;
  }
}

async function callNumericRpc(name, userId, fallback) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return fallback;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rpc/${name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ p_user_id: userId }),
      }
    );
    if (!res.ok) return fallback;
    const data = await res.json().catch(() => null);
    const n = Number(data);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req) {
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return bad('Sign in to continue', 401);

  const user = await verifyUser(bearerToken);
  if (!user) return bad('Sign in to continue', 401);
  const userId = user.id;

  const sub = await getSubscription(bearerToken, userId);
  const premium = Boolean(sub && ['active', 'trialing'].includes(sub.status));
  if (premium) {
    return NextResponse.json({ premium: true, used_today: 0, remaining_today: null });
  }

  const [usedToday, remainingToday] = await Promise.all([
    callNumericRpc('food_scans_used_today', userId, 0),
    callNumericRpc('food_scans_remaining_today', userId, FREE_FOOD_SCAN_LIMIT),
  ]);

  return NextResponse.json({
    premium: false,
    used_today: Math.max(0, usedToday),
    remaining_today: Math.max(0, remainingToday),
  });
}
