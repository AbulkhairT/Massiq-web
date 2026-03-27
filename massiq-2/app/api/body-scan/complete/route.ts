/**
 * POST /api/body-scan/complete
 * Orchestrates Claude vision → sanitize → engine → storage → scans row for native guided capture.
 * Auth: Bearer JWT (same as /api/anthropic).
 */
import { NextRequest, NextResponse } from 'next/server';
import { runEngine } from '../../../../lib/engine';
import { SCORING_VERSION } from '../../../../lib/engine/scoring';
import { sanitizeScanData } from '../../../../lib/scan/sanitizeScanData';
import { calcTargets, clampMacros, calcMacros } from '../../../../lib/scan/macroHelpers';
import {
  uploadScanPhoto,
  createScanAsset,
  createScan,
  updateScanCaptureSession,
  insertScanQualityReview,
  insertProductEvent,
} from '../../../../lib/supabase/client';

export const runtime = 'nodejs';

async function verifyAuth(req: NextRequest): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const authHeader = req.headers.get('authorization') || '';
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

function mapPreviousScansForEngine(history: unknown[]): unknown[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((s: any) => s && (s.date || s.created_at))
    .map((s: any) => {
      const date = String(s.date || s.created_at || '').slice(0, 10);
      const bf = typeof s.bodyFat === 'number' ? s.bodyFat : Number(s.bodyFatPct ?? s.bodyFat);
      return {
        date,
        bodyFat: bf,
        leanMass: s.leanMass,
        weight: s.weight,
      };
    })
    .filter((s: any) => s.date && s.bodyFat >= 3 && s.bodyFat <= 55)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));
}

function lastScanForSanitize(history: unknown[]): any | null {
  if (!Array.isArray(history) || !history.length) return null;
  const sorted = [...history].sort((a: any, b: any) => {
    const da = new Date(a.date || a.created_at || 0).getTime();
    const db = new Date(b.date || b.created_at || 0).getTime();
    return da - db;
  });
  return sorted[sorted.length - 1] || null;
}

export async function POST(req: NextRequest) {
  const userId = await verifyAuth(req);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server misconfigured: missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    imageBase64,
    mediaType = 'image/jpeg',
    profile,
    captureSessionId,
    scanHistory = [],
    imageWidth,
    imageHeight,
  } = body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
  }
  if (!profile || typeof profile !== 'object') {
    return NextResponse.json({ error: 'Missing profile' }, { status: 400 });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const age = profile?.age || 25;
  const gender = profile?.gender || 'Male';
  const height = profile?.heightIn || 70;
  const weight = profile?.weightLbs || 170;
  const heightCm = Math.round(height * 2.54);
  const weightKg = Math.round(weight * 0.4536);

  const prevScansEngine = mapPreviousScansForEngine(scanHistory);
  const baselineScan = Array.isArray(scanHistory)
    ? (scanHistory as any[]).find((s: any) => s?.isBaseline) || (scanHistory as any[])[0]
    : null;
  const prevScan = lastScanForSanitize(scanHistory);
  const daysSinceBaseline = baselineScan?.date
    ? Math.round((Date.now() - new Date(baselineScan.date).getTime()) / 86400000)
    : 0;
  const daysSincePrev = prevScan?.date
    ? Math.round((Date.now() - new Date(prevScan.date).getTime()) / 86400000)
    : 0;
  const maxBFChange = Math.max(2, daysSinceBaseline / 14).toFixed(1);
  const maxLMChange = Math.max(3, daysSinceBaseline / 7).toFixed(1);

  const baselineBF = baselineScan
    ? (baselineScan.bodyFat ?? baselineScan.bodyFatPct ?? baselineScan.body_fat)
    : null;
  const baselineContext = baselineScan
    ? `\n\nCONSISTENCY ANCHOR — this user's baseline scan was ${daysSinceBaseline} days ago:\n- Baseline body fat: ${baselineBF}%  |  Lean mass: ${baselineScan.leanMass} lbs  |  Score: ${baselineScan.physiqueScore}\nRealistic change limits given ${daysSinceBaseline} days: ±${maxBFChange}% BF, ±${maxLMChange} lbs lean mass.\nIf your visual estimate falls significantly outside these limits, use the conservative estimate closer to the baseline. Focus on RELATIVE CHANGE detection, not fresh absolute estimates.`
    : '';

  const systemPrompt = `You are a physique analysis AI. Analyze this photo using visual body composition estimation techniques.

IMPORTANT RULES:
- Give body fat as a RANGE not single number (e.g. low:15, high:18)
- Be conservative — photos consistently make people look leaner than they are
- Flag any photo quality issues that reduce accuracy
- Explain your reasoning for each estimate with specific visual markers
- Do not give medical advice
- State confidence level clearly based on photo quality and visibility
- BANNED words: underdeveloped, below average, above average, lacks, lacking, weak, beginner, poor, inadequate, unfortunately
- Muscle levels (use exactly): "not yet defined"|"early"|"moderate"|"solid"|"well-developed"
- SCORES: physique 30-95 (calibrated, avg 52-65), symmetry 60-95 (avg 70-85). Be honest, not generous.${baselineContext}`;

  const userPrompt = `Person details: ${age}yo ${gender}, ${heightCm}cm (${height}in), ${weightKg}kg (${weight}lbs).

Return ONLY this JSON (no markdown, no extra text):
{"bodyFatRange":{"low":0,"high":0,"midpoint":0},"bodyFatConfidence":"medium","bodyFatReasoning":"specific visual markers that led to this range","leanMass":0,"leanMassTrend":"maintaining","physiqueScore":0,"symmetryScore":0,"symmetryDetails":"specific description of balance or imbalances","muscleGroups":{"chest":"moderate","shoulders":"moderate","back":"moderate","arms":"moderate","core":"moderate","legs":"moderate"},"weakestGroups":[],"limitingFactor":"the single most important thing holding this physique back","limitingFactorExplanation":"specific explanation with reference to their stats and what is visible","strengths":[],"asymmetries":[],"bodyFatSummary":"","muscleSummary":"","priorityAreas":[],"balanceNote":"","diagnosis":"2-3 sentence honest assessment referencing their specific stats","photoQualityIssues":[],"photoQuality":{"overall":"medium","lighting":"good","clothing":"acceptable","pose":"acceptable","notes":""},"recommendation":"2-3 sentence specific recommendation referencing their weight and goal","disclaimer":"Visual AI estimate based on photo. Accuracy improves with consistent lighting and front/side pose."}`;

  const upstream = {
    model: process.env.ANTHROPIC_SCAN_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    temperature: 0,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  };

  let text: string;
  try {
    const upstreamRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(upstream),
    });
    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      console.error('[body-scan/complete] anthropic failed', upstreamRes.status, errText.slice(0, 400));
      return NextResponse.json({ error: `Vision analysis failed (${upstreamRes.status})` }, { status: 502 });
    }
    const data = await upstreamRes.json();
    text = data?.content?.find((b: any) => b?.type === 'text')?.text ?? '';
  } catch (e) {
    console.error('[body-scan/complete] anthropic error', e);
    return NextResponse.json({ error: 'Vision analysis failed' }, { status: 502 });
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: 'Could not parse scan result' }, { status: 422 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from vision model' }, { status: 422 });
  }

  const meaningfulChange = daysSincePrev > 0;
  const visualData = sanitizeScanData(parsed, profile, {
    previousScan: prevScan,
    meaningfulChange,
  });

  const today = new Date().toISOString().slice(0, 10);
  const currentScan = {
    date: today,
    bodyFat: visualData.bodyFatPct,
    weight,
    leanMass: visualData.leanMass,
  };

  let engineOutput: any;
  try {
    engineOutput = runEngine({
      profile,
      currentScan,
      previousScans: prevScansEngine,
      recentLogs: [],
    } as any);
  } catch (e) {
    console.error('[body-scan/complete] engine error', e);
    return NextResponse.json({ error: 'Engine calculation failed', detail: String(e) }, { status: 500 });
  }

  const scanTargets = calcTargets(profile, { leanMass: visualData.leanMass });
  const engineBase = engineOutput?.macro_targets || calcMacros({ ...profile, goal: profile.goal });
  const dailyTargets = clampMacros({
    ...engineBase,
    protein: scanTargets.protein,
  }, profile);

  const phase = {
    label: profile.goal,
    name: `${profile.goal} Phase`,
    durationWeeks: 12,
    objective: engineOutput?.diagnosis?.primary?.recommended_action || '',
  };

  let resolvedAssetId: string | null = null;
  let storagePath: string | null = null;

  try {
    storagePath = await uploadScanPhoto(token, userId, imageBase64, mediaType);
    const w = Number(imageWidth) || 1024;
    const h = Number(imageHeight) || 1024;
    const asset = await createScanAsset(token, userId, {
      storagePath,
      mimeType: mediaType,
      fileSizeBytes: Math.round(imageBase64.length * 0.75),
      sha256: null,
      perceptualHash: null,
      width: w,
      height: h,
    });
    resolvedAssetId = asset?.id || null;
    if (!resolvedAssetId) {
      throw new Error('scan_assets insert returned no id');
    }
  } catch (e: any) {
    console.error('[body-scan/complete] storage/asset failed', e?.message);
    return NextResponse.json({
      error: e?.message || 'Photo upload failed',
      stage: 'upload',
    }, { status: 500 });
  }

  let scanId: string;
  try {
    const newScanEntry = {
      bodyFat: visualData.bodyFatPct,
      bodyFatRange: visualData.bodyFatRange,
      leanMass: visualData.leanMass,
      physiqueScore: visualData.physiqueScore,
      symmetryScore: visualData.symmetryScore,
      confidence: visualData.confidence || 'medium',
      weakestGroups: visualData.weakestGroups || [],
      phase,
      dailyTargets,
      limitingFactor: visualData.limitingFactor,
      limitingFactorExplanation: visualData.limitingFactorExplanation,
      nutritionKeyChange: engineOutput?.narrative?.nutritionKeyChange || visualData.nutritionKeyChange,
      recommendation: visualData.recommendation,
      assessment: visualData.bodyFatSummary || visualData.diagnosis,
      engineVersion: SCORING_VERSION,
      scanStatus: 'complete',
      assetId: resolvedAssetId,
      scanContext: {
        schema_version: '2',
        engine_output: engineOutput,
        scoring_breakdown: visualData.scoringBreakdown || null,
        scoring_version: visualData.scoringVersion || SCORING_VERSION,
        ffmi: visualData.ffmi ?? null,
        premium_analysis: {
          body_fat_summary: visualData.bodyFatSummary || null,
          muscle_summary: visualData.muscleSummary || null,
          muscle_groups: visualData.muscleGroups || null,
          balance_note: visualData.balanceNote || null,
          diagnosis: visualData.diagnosis || null,
          strengths: visualData.strengths || null,
        },
      },
      photoQualityIssues: visualData.photoQualityIssues || [],
    };

    const saved = await createScan(token, userId, newScanEntry);
    scanId = saved?.id || saved?.dbId;
    if (!scanId) {
      throw new Error('createScan returned no id');
    }
  } catch (e: any) {
    console.error('[body-scan/complete] createScan failed', e?.message);
    return NextResponse.json({
      error: e?.message || 'Scan could not be saved',
      stage: 'persist',
    }, { status: 500 });
  }

  if (captureSessionId && token) {
    try {
      await updateScanCaptureSession(token, captureSessionId, {
        scan_id: scanId,
        scan_asset_id: resolvedAssetId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[body-scan/complete] updateScanCaptureSession', e);
    }
  }

  const pq = visualData.photoQuality || {};
  const lowConfidence = String(visualData.confidence || '').toLowerCase() === 'low';
  const poorLighting = String(pq.lighting || '').toLowerCase() === 'poor' || String(pq.overall || '').toLowerCase() === 'poor';
  const framingIssues = Array.isArray(visualData.photoQualityIssues) && visualData.photoQualityIssues.length > 0;
  let qualityReviewInserted = false;
  if (lowConfidence || framingIssues || poorLighting) {
    try {
      await insertScanQualityReview(token, userId, {
        scanId,
        confidenceLabel: visualData.confidence || 'medium',
        recommendation: lowConfidence || framingIssues ? 'rescan_recommended' : 'review',
        notes: {
          photo_quality_issue_count: Array.isArray(visualData.photoQualityIssues) ? visualData.photoQualityIssues.length : 0,
          photo_quality_issues: visualData.photoQualityIssues || [],
          source: 'guided_body_scan_complete',
        },
        reviewSource: 'system',
        qualityBucket: lowConfidence ? 'low' : 'medium',
        reasons: {
          low_confidence: lowConfidence,
          poor_lighting: poorLighting,
          framing: framingIssues,
        },
        recommendedAction: lowConfidence || framingIssues ? 'rescan_required' : 'warn',
      } as Parameters<typeof insertScanQualityReview>[2]);
      qualityReviewInserted = true;
    } catch (e) {
      console.warn('[body-scan/complete] insertScanQualityReview', e);
    }
  }

  try {
    await insertProductEvent(token, userId, 'scan_completed', {
      scan_id: scanId,
      capture_session_id: captureSessionId || null,
    });
  } catch (e) {
    console.warn('[body-scan/complete] insertProductEvent', e);
  }

  return NextResponse.json({
    ok: true,
    scanId,
    assetId: resolvedAssetId,
    storagePath,
    bodyFatPct: visualData.bodyFatPct,
    leanMass: visualData.leanMass,
    physiqueScore: visualData.physiqueScore,
    symmetryScore: visualData.symmetryScore,
    confidence: visualData.confidence,
    /** Full sanitized Claude + scoring payload for web UI (`setResult`). */
    visualData,
    engineOutput,
    dailyTargets,
    qualityReviewInserted,
    lowConfidence,
    poorLighting,
    framingIssues,
  });
}
