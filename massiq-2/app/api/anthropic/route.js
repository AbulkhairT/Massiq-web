import { NextResponse } from "next/server";

export const runtime = "nodejs";

function bad(msg, status=400){
  return NextResponse.json({ error: msg }, { status });
}

/**
 * Verifies the Authorization Bearer token against Supabase and returns the
 * authenticated userId, or null if the token is missing/invalid.
 */
async function verifyAuth(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const authHeader  = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user.id : null;
  } catch {
    return null;
  }
}

export async function POST(req){
  // ── Auth gate ────────────────────────────────────────────────────────────
  const userId = await verifyAuth(req);
  if (!userId) {
    const hasToken = !!(req.headers.get('authorization') || '').trim();
    console.warn('[anthropic] auth:failed', { reason: hasToken ? 'invalid_token' : 'no_token' });
    return bad("Sign in to continue", 401);
  }
  console.info('[anthropic] auth:ok', { user_id: userId });
  // ────────────────────────────────────────────────────────────────────────

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return bad("Server misconfigured: missing ANTHROPIC_API_KEY", 500);

  let body;
  try{ body = await req.json(); }catch{ return bad("Invalid JSON body"); }

  const { messages, system, max_tokens, model } = body || {};
  if(!Array.isArray(messages) || messages.length === 0) return bad("messages must be a non-empty array");
  const maxTokens = Number.isFinite(+max_tokens) ? Math.max(1, Math.min(4000, +max_tokens)) : 600;

  // Allow up to 10 MB for image payloads (base64 photos)
  const approxSize = JSON.stringify({messages, system}).length;
  if(approxSize > 10_000_000) return bad("Payload too large", 413);

  // Allowlist: only these two model IDs are accepted; anything else is ignored
  // and falls back to the default scan model.
  const ALLOWED_SCAN_MODELS = new Set([
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    process.env.ANTHROPIC_SCAN_MODEL,
  ].filter(Boolean));

  const requestedModel = ALLOWED_SCAN_MODELS.has(model) ? model : null;
  if (model && !requestedModel) {
    console.warn('[anthropic] model:rejected', { requested: model, user_id: userId, falling_back_to: 'default' });
  }
  const chosenModel = requestedModel || process.env.ANTHROPIC_SCAN_MODEL || "claude-haiku-4-5-20251001";

  const upstreamBody = { model: chosenModel, max_tokens: maxTokens, messages };
  if(system) upstreamBody.system = system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(upstreamBody),
  });

  const data = await res.json().catch(()=>null);
  if(!res.ok){
    const msg = data?.error?.message || `Anthropic error ${res.status}`;
    return bad(msg, res.status);
  }

  const text = data?.content?.find?.(b=>b?.type==="text")?.text;
  if(!text) return bad("Empty response from model", 502);

  return NextResponse.json({ text });
}
