import { NextResponse } from "next/server";

export const runtime = "nodejs";

// NOTE: The Pages Router `config` export does nothing in Next.js App Router.
// Body size for Node.js runtime route handlers is not limited by Next.js itself.
// Large base64 image payloads (up to ~10 MB) are handled fine without extra config.

function bad(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

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

// ── Model selection ─────────────────────────────────────────────────────────
// Allowlist: only 'haiku' and 'sonnet' string aliases are accepted from callers.
// Any other value (including raw model IDs or Opus) is rejected and auto-detected.
// Text-only requests use Haiku (~12x cheaper). Vision requests require Sonnet.
const MODEL_HAIKU  = "claude-haiku-4-5-20251001";
const MODEL_SONNET = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function resolveModel(requestedModel, messages, userId) {
  if (requestedModel === 'haiku')  return MODEL_HAIKU;
  if (requestedModel === 'sonnet') return MODEL_SONNET;
  // Anything else (arbitrary model ID, Opus, unknown string) is rejected
  if (requestedModel) {
    console.warn('[claude] model:rejected', { requested: requestedModel, user_id: userId, falling_back_to: 'auto_detect' });
  }
  // Auto-detect: if any message contains an image block, require Sonnet
  const hasImage = messages.some(m =>
    Array.isArray(m.content) && m.content.some(b => b?.type === 'image')
  );
  return hasImage ? MODEL_SONNET : MODEL_HAIKU;
}

function getSystemPrompt(max_tokens, providedSystem) {
  if (providedSystem) return providedSystem;
  return "You are a fitness and nutrition assistant. Return only valid JSON unless told otherwise. Be concise.";
}

export async function POST(req) {
  // ── Auth gate ────────────────────────────────────────────────────────────
  const userId = await verifyAuth(req);
  if (!userId) {
    const hasToken = !!(req.headers.get('authorization') || '').trim();
    console.warn('[claude] auth:failed', { reason: hasToken ? 'invalid_token' : 'no_token' });
    return bad("Sign in to continue", 401);
  }
  console.info('[claude] auth:ok', { user_id: userId });
  // ────────────────────────────────────────────────────────────────────────

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return bad("Server misconfigured: missing ANTHROPIC_API_KEY", 500);

  let body;
  try { body = await req.json(); } catch { return bad("Invalid JSON body"); }

  const { messages, system, max_tokens, model } = body || {};
  if (!Array.isArray(messages) || messages.length === 0)
    return bad("messages must be a non-empty array");

  // Allow up to 4000 tokens; default 600 (Haiku handles short outputs well)
  const maxTokens = Number.isFinite(+max_tokens) ? Math.max(1, Math.min(4000, +max_tokens)) : 600;

  // Rough payload size guard
  const approxSize = JSON.stringify({ messages, system }).length;
  if (approxSize > 10_000_000) return bad("Payload too large", 413);

  const chosenModel  = resolveModel(model, messages, userId);
  const systemPrompt = getSystemPrompt(maxTokens, system);

  const upstreamBody = {
    model: chosenModel,
    max_tokens: maxTokens,
    messages,
    system: systemPrompt,
  };

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    return bad(`Network error: ${err.message}`, 502);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Anthropic error ${res.status}`;
    return bad(msg, res.status);
  }

  const text = data?.content?.find?.(b => b?.type === "text")?.text;
  if (!text) return bad("Empty response from model", 502);

  return NextResponse.json({ text });
}
