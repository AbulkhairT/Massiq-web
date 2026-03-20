/* ─── MassIQ Intelligence Engine — HTTP Endpoint ─────────────────────────
   POST /api/engine
   Accepts raw user data, returns full structured engine output.

   This endpoint is the single source of truth for all physiological
   calculations in MassIQ. No other part of the system should generate
   macro targets or timelines independently.
────────────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server'
import { runEngine, buildClaudeContext } from '../../../lib/engine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.profile) {
      return NextResponse.json(
        { error: 'Missing required field: profile' },
        { status: 400 }
      )
    }

    const output = runEngine(body)

    // Optionally include the Claude context string if the caller wants it
    const includeContext = body.include_claude_context === true
    const response: Record<string, unknown> = { ...output }
    if (includeContext) {
      response.claude_context = buildClaudeContext(output)
    }

    return NextResponse.json(response)

  } catch (err) {
    console.error('[engine] Error:', err)
    return NextResponse.json(
      { error: 'Engine calculation failed', detail: String(err) },
      { status: 500 }
    )
  }
}
