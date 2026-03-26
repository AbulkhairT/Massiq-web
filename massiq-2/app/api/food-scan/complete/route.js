import { NextResponse } from 'next/server';
import { extractFoodSignals, summarizeFoodSignals } from '../../../lib/engine/foodSignals';

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
  const row = {
    user_id: userId,
    source: source === 'nutrition' ? 'nutrition' : 'home',
    status: 'success',
    meal_name: mealName || null,
  };
  console.info('[food-scan-event] insert', { user_id: userId, source: row.source, meal_name: row.meal_name });
  const res = await fetch(
    `${supabaseUrl}/rest/v1/food_scan_events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[food-scan-event] FAILED', { user_id: userId, status: res.status, error: text.slice(0, 500) });
    throw new Error(`Could not save food scan event (${res.status}): ${text}`);
  }
  const parsed = await res.json().catch(() => null);
  const eventId = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;
  return { id: eventId ?? null };
}

/**
 * Persists a nutrition log row for confirmed real-food scans (not for not_food / failed — those never call complete).
 * Skips when macros are missing or invalid (preview-only / client bug).
 */
async function insertFoodLogRow({ userId, source, mealName, payload }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn('[food-log] skip — server misconfigured');
    return { ok: false, skip_reason: 'server_misconfigured' };
  }

  const foodSignals = extractFoodSignals(payload || {});
  const summary = summarizeFoodSignals(foodSignals);
  const cals = Number(summary?.calories);
  if (!Number.isFinite(cals) || cals < 0) {
    console.info('[food-log] skip — no valid calories (preview-only or incomplete payload)', {
      user_id: userId,
      skip_reason: 'no_valid_calories',
    });
    return { ok: false, skip_reason: 'no_valid_calories' };
  }

  const protein = Math.round(Number(summary?.protein_g ?? 0)) || 0;
  const carbs = Math.round(Number(summary?.carbs_g ?? 0)) || 0;
  const fat = Math.round(Number(summary?.fat_g ?? 0)) || 0;
  const fiberRaw = payload?.fiber_g ?? payload?.fiber;
  const fiberNum = fiberRaw != null && fiberRaw !== '' ? Number(fiberRaw) : null;
  const fiber = fiberNum != null && Number.isFinite(fiberNum) ? Math.round(fiberNum) : null;

  let foodItems = payload?.food_items;
  if (!Array.isArray(foodItems) || foodItems.length === 0) {
    foodItems = [
      {
        name: mealName || 'Meal',
        calories: Math.round(cals),
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
      },
    ];
  }

  const row = {
    user_id: userId,
    source: 'food_scan',
    meal_name: mealName || null,
    calories: Math.round(cals),
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    food_items: summary?.canonical_items?.length ? summary.canonical_items : foodItems,
    notes: `scan_source:${source === 'nutrition' ? 'nutrition' : 'home'};confidence:${summary?.confidence_label || 'medium'};ambiguity:${(summary?.ambiguity_flags || []).join('|')}`,
  };

  console.info('[food-log] insert', {
    user_id: userId,
    meal_name: row.meal_name,
    calories: row.calories,
    protein_g: row.protein_g,
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/food_logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[food-log] FAILED', {
      user_id: userId,
      status: res.status,
      error: text.slice(0, 800),
    });
    return { ok: false, error: text, status: res.status };
  }
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  const id = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;
  console.info('[food-log] ok', { user_id: userId, food_log_id: id ?? null });
  return { ok: true, id: id ?? null, foodSignals };
}

async function insertFoodSignalSetRow({ userId, foodLogId, foodScanEventId, foodSignals }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, skip_reason: 'server_misconfigured' };
  if (!foodSignals || typeof foodSignals !== 'object') return { ok: false, skip_reason: 'missing_signals' };
  const row = {
    user_id: userId,
    food_log_id: foodLogId || null,
    food_scan_event_id: foodScanEventId || null,
    ...foodSignals,
  };
  const res = await fetch(`${supabaseUrl}/rest/v1/food_signal_sets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[food-signal-set] FAILED', { user_id: userId, status: res.status, error: text.slice(0, 500) });
    return { ok: false, error: text, status: res.status };
  }
  const parsed = await res.json().catch(() => null);
  const id = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;
  return { ok: true, id: id ?? null };
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

  const foodScanEvent = await insertSuccessEvent({ userId, source, mealName });

  const foodLogResult = await insertFoodLogRow({ userId, source, mealName, payload });
  const foodSignalSetResult = await insertFoodSignalSetRow({
    userId,
    foodLogId: foodLogResult?.id || null,
    foodScanEventId: foodScanEvent?.id || null,
    foodSignals: foodLogResult?.foodSignals || null,
  });

  if (premium) {
    return NextResponse.json({
      premium: true,
      used_today: 0,
      remaining_today: null,
      food_log: foodLogResult,
      food_signal_set: foodSignalSetResult,
    });
  }

  const [usedToday, remainingToday] = await Promise.all([
    rpc('food_scans_used_today', userId, 0),
    rpc('food_scans_remaining_today', userId, 0),
  ]);
  return NextResponse.json({
    premium: false,
    used_today: Math.max(0, usedToday),
    remaining_today: Math.max(0, remainingToday),
    food_log: foodLogResult,
    food_signal_set: foodSignalSetResult,
  });
}
