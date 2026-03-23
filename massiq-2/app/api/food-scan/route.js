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
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=status&order=updated_at.desc&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } }
    );
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

async function getFoodScanUsed(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return 0;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/user_entitlements?user_id=eq.${userId}&select=free_food_scans_used&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await res.json().catch(() => []);
    const used = Array.isArray(rows) && rows[0] ? Number(rows[0].free_food_scans_used) : 0;
    return Number.isFinite(used) ? used : 0;
  } catch {
    return 0;
  }
}

async function recordFoodScan(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rpc/record_food_scan`,
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
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 404 || text.includes('does not exist')) {
        console.error('[food-scan] record_food_scan RPC not found — run migration 005');
      }
    }
  } catch (err) {
    console.error('[food-scan] record_food_scan failed:', err);
  }
}

async function callClaudeForFood(messages, apiKey) {
  const MODEL_SONNET = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_SONNET,
      max_tokens: 200,
      messages,
      system: 'You are a fitness and nutrition assistant. Return only valid JSON unless told otherwise. Be concise.',
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Anthropic error ${res.status}`;
    throw new Error(msg);
  }
  const text = data?.content?.find?.(b => b?.type === 'text')?.text;
  if (!text) throw new Error('Empty response from model');
  return text;
}

/**
 * POST /api/food-scan
 *
 * Server-side food scan with DB-backed limit enforcement.
 * Requires Authorization. Premium users: unlimited. Free users: 2 total.
 */
export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return bad('Server misconfigured', 500);

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return bad('Sign in to continue', 401);

  const user = await verifyUser(bearerToken);
  if (!user) return bad('Sign in to continue', 401);
  const userId = user.id;

  const subscription = await getSubscription(bearerToken, userId);
  const isPremium = subscription && ['active', 'trialing'].includes(subscription.status);

  if (!isPremium) {
    const used = await getFoodScanUsed(userId);
    if (used >= FREE_FOOD_SCAN_LIMIT) {
      return NextResponse.json(
        { error: `Food scan limit reached (${FREE_FOOD_SCAN_LIMIT} free). Upgrade for unlimited scans.` },
        { status: 403 }
      );
    }
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON body');
  }

  const { messages } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return bad('messages must be a non-empty array');
  }

  const approxSize = JSON.stringify(body).length;
  if (approxSize > 10_000_000) return bad('Payload too large', 413);

  try {
    const text = await callClaudeForFood(messages, apiKey);
    const match = (text || '').match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed?.error === 'not_food') {
        return NextResponse.json({ error: 'Oops, you need to scan a food.' }, { status: 400 });
      }
      if (parsed?.name !== undefined || parsed?.calories !== undefined) {
        await recordFoodScan(userId);
      }
    }
    return NextResponse.json({ text });
  } catch (err) {
    console.error('[food-scan] Claude error:', err?.message);
    return bad(err?.message || 'Food scan failed', 502);
  }
}
