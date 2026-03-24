import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

async function rpc(name, userId, fallback) {
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

async function insertSuccessEvent({ userId, source, mealName }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Server misconfigured');
  const res = await fetch(
    `${supabaseUrl}/rest/v1/food_scan_events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        source: source === 'nutrition' ? 'nutrition' : 'home',
        status: 'success',
        meal_name: mealName || null,
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not save food scan event (${res.status}): ${text}`);
  }
}

export async function POST(req) {
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return bad('Sign in to continue', 401);

  const user = await verifyUser(bearerToken);
  if (!user) return bad('Sign in to continue', 401);
  const userId = user.id;

  let payload = {};
  try { payload = await req.json(); } catch {}
  const source = payload?.source === 'nutrition' ? 'nutrition' : 'home';
  const mealName = typeof payload?.meal_name === 'string' ? payload.meal_name : null;

  const sub = await getSubscription(bearerToken, userId);
  const premium = Boolean(sub && ['active', 'trialing'].includes(sub.status));

  if (!premium) {
    const remainingBefore = await rpc('food_scans_remaining_today', userId, 0);
    if (remainingBefore <= 0) {
      return NextResponse.json(
        { error: 'Food scan limit reached (2 per day). Upgrade for unlimited scans.' },
        { status: 403 }
      );
    }
  }

  await insertSuccessEvent({ userId, source, mealName });

  if (premium) {
    return NextResponse.json({ premium: true, used_today: 0, remaining_today: null });
  }

  const [usedToday, remainingToday] = await Promise.all([
    rpc('food_scans_used_today', userId, 0),
    rpc('food_scans_remaining_today', userId, 0),
  ]);
  return NextResponse.json({
    premium: false,
    used_today: Math.max(0, usedToday),
    remaining_today: Math.max(0, remainingToday),
  });
}
