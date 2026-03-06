import { NextResponse } from "next/server";

export const runtime = "nodejs";

function bad(msg, status=400){
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return bad("Server misconfigured: missing ANTHROPIC_API_KEY", 500);

  let body;
  try{ body = await req.json(); }catch{ return bad("Invalid JSON body"); }

  const { messages, system, max_tokens, model } = body || {};
  if(!Array.isArray(messages) || messages.length === 0) return bad("messages must be a non-empty array");
  const maxTokens = Number.isFinite(+max_tokens) ? Math.max(1, Math.min(2048, +max_tokens)) : 600;

  // Very lightweight validation to avoid accidental huge payloads
  const approxSize = JSON.stringify({messages, system}).length;
  if(approxSize > 250_000) return bad("Payload too large", 413);

  const chosenModel = (model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6");

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
