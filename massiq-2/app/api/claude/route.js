import { NextResponse } from "next/server";

export const runtime = "nodejs";

// NOTE: The Pages Router `config` export does nothing in Next.js App Router.
// Body size for Node.js runtime route handlers is not limited by Next.js itself.
// Large base64 image payloads (up to ~10 MB) are handled fine without extra config.

function bad(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// Derive system prompt based on max_tokens (request type)
function getSystemPrompt(max_tokens, providedSystem) {
  if (providedSystem) return providedSystem;
  if (max_tokens >= 4000) return "You are an elite sports nutritionist. Return only valid JSON arrays.";
  if (max_tokens >= 2000) return "You are an expert physique analyst. Return only valid JSON.";
  return "You are a nutrition expert. Return only valid JSON.";
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return bad("Server misconfigured: missing ANTHROPIC_API_KEY", 500);

  let body;
  try { body = await req.json(); } catch { return bad("Invalid JSON body"); }

  const { messages, system, max_tokens, model } = body || {};
  if (!Array.isArray(messages) || messages.length === 0)
    return bad("messages must be a non-empty array");

  // Allow up to 4000 tokens; default 1000
  const maxTokens = Number.isFinite(+max_tokens) ? Math.max(1, Math.min(4000, +max_tokens)) : 1000;

  // Rough payload size guard (base64 images can be large — allow up to 10 MB)
  const approxSize = JSON.stringify({ messages, system }).length;
  if (approxSize > 10_000_000) return bad("Payload too large", 413);

  const chosenModel = model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
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
