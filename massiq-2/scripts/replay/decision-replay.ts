import { runScanDecisionEngine } from '../../lib/engine/scanDecisionEngine'
import { runDecisionEngineOnStableState } from '../../lib/engine/stableState'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type AnyObj = Record<string, any>

const SUPABASE_URL_RAW = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_URL = SUPABASE_URL_RAW.replace(/\/+$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function requiredEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
}

function diagnosticsHeader() {
  let host = 'unknown'
  try { host = new URL(SUPABASE_URL || 'https://invalid.local').host } catch {}
  return {
    supabase_url_present: Boolean(SUPABASE_URL_RAW),
    supabase_url_host: host,
    service_role_present: Boolean(SERVICE_KEY),
    service_role_prefix: SERVICE_KEY ? `${SERVICE_KEY.slice(0, 8)}...` : null,
    service_role_length: SERVICE_KEY ? SERVICE_KEY.length : 0,
  }
}

function fullErrorDetails(err: any) {
  return {
    name: err?.name || null,
    message: err?.message || String(err),
    code: err?.code || err?.cause?.code || null,
    errno: err?.errno || err?.cause?.errno || null,
    syscall: err?.syscall || err?.cause?.syscall || null,
    type: err?.type || err?.cause?.type || null,
    cause_message: err?.cause?.message || null,
    stack: err?.stack || null,
  }
}

async function rest(path: string, opts: RequestInit = {}) {
  requiredEnv()
  let res: Response
  const url = `${SUPABASE_URL}${path}`
  try {
    res = await fetch(url, {
      ...opts,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    })
  } catch (err: any) {
    const e = new Error(`[network:${path}] fetch failed: ${err?.message || String(err)}`)
    ;(e as any).kind = 'network_fetch'
    ;(e as any).target_url = url
    ;(e as any).details = fullErrorDetails(err)
    throw e
  }
  const text = await res.text().catch(() => '')
  let payload: any = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) {
    const msg = typeof payload === 'object' ? payload?.message || payload?.error : String(payload)
    const err = new Error(`[rest:${path}] ${msg || res.status}`)
    ;(err as any).kind = res.status === 401 || res.status === 403 ? 'auth' : 'rest_query'
    ;(err as any).status = res.status
    ;(err as any).raw = payload
    throw err
  }
  return payload
}

function parseArgs(argv: string[]) {
  const out: AnyObj = {
    userId: null,
    dateFrom: null,
    dateTo: null,
    sourceEngineVersion: 'db-recorded',
    replayEngineVersion: 'stable-v1',
    maxCases: 100,
    fixtureSet: null,
    requireNonnullBfGap: false,
    noPersist: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--user-id') out.userId = argv[i + 1]
    if (a === '--date-from') out.dateFrom = argv[i + 1]
    if (a === '--date-to') out.dateTo = argv[i + 1]
    if (a === '--source-engine-version') out.sourceEngineVersion = argv[i + 1]
    if (a === '--replay-engine-version') out.replayEngineVersion = argv[i + 1]
    if (a === '--max-cases') out.maxCases = Number(argv[i + 1] || 100)
    if (a === '--fixture-set') out.fixtureSet = argv[i + 1]
    if (a === '--require-nonnull-bf-gap') out.requireNonnullBfGap = true
    if (a === '--no-persist') out.noPersist = true
  }
  if (!out.userId) throw new Error('Missing --user-id')
  return out
}

async function tableProbe(table: string): Promise<{ exists: boolean; columns: string[]; mode: string; error?: string }> {
  // Probe by selecting from the table directly. This is robust even if information_schema
  // is not exposed through PostgREST.
  try {
    const rows = await rest(`/rest/v1/${table}?select=*&limit=1`)
    const first = Array.isArray(rows) && rows[0] ? rows[0] : null
    return {
      exists: true,
      columns: first && typeof first === 'object' ? Object.keys(first) : [],
      mode: first ? 'row_sample' : 'empty_table',
    }
  } catch (err: any) {
    const status = Number(err?.status || 0)
    if (status === 404) {
      return { exists: false, columns: [], mode: 'not_found', error: err?.message || 'table not found' }
    }
    if (status === 401 || status === 403) {
      return { exists: false, columns: [], mode: 'auth_error', error: err?.message || 'auth error' }
    }
    return { exists: false, columns: [], mode: err?.kind || 'probe_error', error: err?.message || String(err) }
  }
}

function pick(obj: AnyObj, allowed: string[]) {
  // First run can legitimately see empty replay tables.
  // In that case, row-sample probing returns zero discovered columns.
  // Do not strip payload fields; let PostgREST/table constraints validate real columns.
  if (!Array.isArray(allowed) || allowed.length === 0) return { ...(obj || {}) }
  const out: AnyObj = {}
  const allow = new Set(allowed)
  for (const [k, v] of Object.entries(obj || {})) if (allow.has(k)) out[k] = v
  return out
}

async function insertRow(table: string, row: AnyObj, allowedCols: string[]) {
  const safe = pick(row, allowedCols)
  const rows = await rest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(safe),
  })
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

async function updateRows(table: string, filter: string, row: AnyObj, allowedCols: string[]) {
  const safe = pick(row, allowedCols)
  const rows = await rest(`/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(safe),
  })
  return rows
}

function toNum(v: any, fallback: number | null = null) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function buildHistoricalInput({
  profile,
  scan,
  prevScan,
  plan,
  stateHistory,
  runInputSnapshot,
}: AnyObj) {
  const snap = runInputSnapshot && typeof runInputSnapshot === 'object' ? runInputSnapshot : {}
  if (Object.keys(snap).length > 0) return snap
  const bf = toNum(scan?.body_fat ?? scan?.bodyFat ?? scan?.bodyFatPct, null)
  const leanMass = toNum(scan?.lean_mass ?? scan?.leanMass, null)
  const state = stateHistory?.state_snapshot || {}
  const targetBodyFat = toNum(plan?.target_bf ?? plan?.targetBF, toNum(profile?.target_bf ?? profile?.targetBF, null))
  const rawBodyFat = bf
  const stableBodyFatMidpoint = state?.stable_body_fat_low != null && state?.stable_body_fat_high != null
    ? (Number(state.stable_body_fat_low) + Number(state.stable_body_fat_high)) / 2
    : rawBodyFat
  const stableBfGap = stableBodyFatMidpoint != null && targetBodyFat != null
    ? Number((stableBodyFatMidpoint - targetBodyFat).toFixed(3))
    : null
  const rawBfGap = rawBodyFat != null && targetBodyFat != null
    ? Number((rawBodyFat - targetBodyFat).toFixed(3))
    : null

  return {
    profile: profile || {},
    latestScan: {
      date: String(scan?.created_at || new Date().toISOString()).slice(0, 10),
      bodyFat: bf,
      bodyFatPct: bf,
      leanMass: leanMass != null ? leanMass * 2.20462 : null,
      symmetryScore: scan?.symmetry_score ?? scan?.symmetryScore ?? null,
      confidence: scan?.scan_confidence || 'medium',
      weakestGroups: Array.isArray(scan?.muscle_assessment?.weakest_groups) ? scan.muscle_assessment.weakest_groups : [],
    },
    previousScan: prevScan
      ? {
          date: String(prevScan?.created_at || '').slice(0, 10),
          bodyFat: toNum(prevScan?.body_fat, null),
          leanMass: toNum(prevScan?.lean_mass, null) != null ? (toNum(prevScan?.lean_mass, 0) || 0) * 2.20462 : null,
          symmetryScore: prevScan?.symmetry_score ?? null,
          confidence: prevScan?.scan_confidence || 'medium',
        }
      : null,
    currentPlan: plan || null,
    scanResult: {
      limitingFactor: state?.primary_limiting_factor || scan?.muscle_assessment?.limiting_factor || null,
      weakestGroups: Array.isArray(scan?.muscle_assessment?.weakest_groups) ? scan.muscle_assessment.weakest_groups : [],
      diagnosis: state?.stabilization_notes || scan?.scan_notes || null,
    },
    adherenceContext: {
      stable_state_confidence: state?.state_confidence_score ?? null,
    },
    stableEvidence: {
      prior_phase: plan?.phase || profile?.goal || null,
      stable_confidence: state?.state_confidence_score ?? null,
      stable_bf_midpoint: stableBodyFatMidpoint,
      raw_bf_midpoint: rawBodyFat,
      target_bf: targetBodyFat,
      stable_bf_gap: stableBfGap,
      raw_bf_gap: rawBfGap,
      limiting_factor: state?.primary_limiting_factor || null,
      limiting_factor_persistence: Boolean(state?.primary_limiting_factor),
      meaningful_change: Boolean(state?.state_payload?.meaningful_body_fat_change),
      evidence_history: [],
      nutrition_adherence: {},
    },
  }
}

function runEngineVersion(version: string, input: AnyObj) {
  if (version === 'legacy-v1') return runScanDecisionEngine(input as any)
  return runDecisionEngineOnStableState(input as any)
}

function getPath(obj: AnyObj, path: string) {
  return path.split('.').reduce((acc: any, p) => (acc == null ? null : acc[p]), obj)
}

function compareOutputs(source: AnyObj, replay: AnyObj) {
  const fields = [
    'phase_decision.recommended_phase',
    'phase_decision.confidence',
    'nutrition_adjustments.calories_delta',
    'nutrition_adjustments.protein_delta_g',
    'nutrition_adjustments.carbs_delta_g',
    'nutrition_adjustments.fat_delta_g',
    'body_state.bf_vs_target',
    'training_adjustments.priority_muscles_high',
  ]
  const changes: AnyObj[] = []
  for (const f of fields) {
    const a = getPath(source, f)
    const b = getPath(replay, f)
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: f, source: a, replay: b })
  }
  const changed = changes.length > 0
  return { changed, changes }
}

function classifyCase({
  source,
  replay,
  diff,
  input,
}: AnyObj): { classification: 'unchanged' | 'improvement' | 'regression' | 'changed'; reason: string } {
  if (!diff.changed) return { classification: 'unchanged', reason: 'no_key_field_change' }
  const sourcePhase = getPath(source, 'phase_decision.recommended_phase')
  const replayPhase = getPath(replay, 'phase_decision.recommended_phase')
  const priorPhase = getPath(input, 'stableEvidence.prior_phase')
  const stableGap = toNum(getPath(input, 'stableEvidence.stable_bf_gap'), null)
  const meaningful = Boolean(getPath(input, 'stableEvidence.meaningful_change'))
  const highConf = (toNum(getPath(input, 'stableEvidence.stable_confidence'), 0) || 0) >= 0.8
  const adverseSignals =
    highConf &&
    meaningful &&
    stableGap != null &&
    stableGap >= 3.8

  const sourceBfVsTarget = getPath(source, 'body_state.bf_vs_target')
  const replayBfVsTarget = getPath(replay, 'body_state.bf_vs_target')
  const sourceCalsDelta = toNum(getPath(source, 'nutrition_adjustments.calories_delta'), 0) || 0
  const replayCalsDelta = toNum(getPath(replay, 'nutrition_adjustments.calories_delta'), 0) || 0
  const sourceProteinDelta = toNum(getPath(source, 'nutrition_adjustments.protein_delta_g'), 0) || 0
  const replayProteinDelta = toNum(getPath(replay, 'nutrition_adjustments.protein_delta_g'), 0) || 0
  const sourcePriorityMuscles = Array.isArray(getPath(source, 'training_adjustments.priority_muscles_high'))
    ? getPath(source, 'training_adjustments.priority_muscles_high')
    : []
  const replayPriorityMuscles = Array.isArray(getPath(replay, 'training_adjustments.priority_muscles_high'))
    ? getPath(replay, 'training_adjustments.priority_muscles_high')
    : []

  const sourceIsCut = String(sourcePhase || '').toLowerCase() === 'cut'
  const replayIsMaintain = String(replayPhase || '').toLowerCase() === 'maintain'
  const sourceAboveToReplayNear = String(sourceBfVsTarget || '').toLowerCase() === 'above' && String(replayBfVsTarget || '').toLowerCase() === 'near'
  const minorNutritionNoiseReduced =
    Math.abs(sourceCalsDelta) <= 180 &&
    Math.abs(replayCalsDelta) < Math.abs(sourceCalsDelta) &&
    Math.abs(replayProteinDelta) <= Math.abs(sourceProteinDelta)
  const unsupportedPriorityRemoved =
    replayPriorityMuscles.length < sourcePriorityMuscles.length &&
    (stableGap == null || stableGap <= 3.6) &&
    !adverseSignals

  if (priorPhase === 'Bulk' && highConf && meaningful && stableGap != null && stableGap >= 2.8) {
    if (sourcePhase === 'Bulk' && (replayPhase === 'Recomp' || replayPhase === 'Cut')) {
      return { classification: 'improvement', reason: 'de_risked_bulk_under_strong_adverse_evidence' }
    }
    if ((sourcePhase === 'Recomp' || sourcePhase === 'Cut') && replayPhase === 'Bulk') {
      return { classification: 'regression', reason: 'removed_de_risking_under_strong_adverse_evidence' }
    }
  }

  // Conservative improvement labeling:
  // we only mark improvement when de-aggressing without adverse evidence.
  if (!adverseSignals) {
    if (sourceIsCut && replayIsMaintain && stableGap != null && stableGap <= 4.0) {
      return { classification: 'improvement', reason: 'removed_unnecessary_cut_for_small_gap' }
    }
    if (sourceAboveToReplayNear && stableGap != null && stableGap <= 4.0) {
      return { classification: 'improvement', reason: 'bf_status_refined_above_to_near_with_stable_evidence' }
    }
    if (minorNutritionNoiseReduced && unsupportedPriorityRemoved) {
      return { classification: 'improvement', reason: 'reduced_nutrition_noise_and_removed_unsupported_priorities' }
    }
    if (minorNutritionNoiseReduced) {
      return { classification: 'improvement', reason: 'reduced_minor_nutrition_adjustment_noise' }
    }
    if (unsupportedPriorityRemoved) {
      return { classification: 'improvement', reason: 'removed_unsupported_training_priority_noise' }
    }
  } else {
    if (sourceIsCut && replayIsMaintain) {
      return { classification: 'regression', reason: 'de_aggressed_despite_strong_adverse_signals' }
    }
  }
  return { classification: 'changed', reason: 'key_outputs_changed_without_clear_quality_signal' }
}

async function auditReplayReadiness() {
  const targets = ['decision_replay_runs', 'decision_replay_cases', 'golden_user_histories', 'user_body_state_history']
  const out: AnyObj = {}
  for (const t of targets) {
    out[t] = await tableProbe(t)
  }
  return out
}

async function connectivityPreflight() {
  const result: AnyObj = { ok: false, checks: [] }
  // Probe 1: REST endpoint that matches known-working curl request
  const restProbePath = '/rest/v1/scans?select=id&limit=1'
  const restProbeUrl = `${SUPABASE_URL}${restProbePath}`
  try {
    const res = await fetch(restProbeUrl, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    const body = await res.text().catch(() => '')
    result.checks.push({
      check: 'rest_scans_probe',
      url: restProbeUrl,
      ok: res.ok,
      status: res.status,
      body_preview: body.slice(0, 300),
    })
    if (!res.ok) {
      result.error_kind = res.status === 401 || res.status === 403 ? 'auth' : 'rest_query'
      result.error = `REST scans probe returned ${res.status}`
      return result
    }
  } catch (err: any) {
    result.checks.push({
      check: 'rest_scans_probe',
      url: restProbeUrl,
      ok: false,
      error: fullErrorDetails(err),
    })
    result.error_kind = 'network_fetch'
    result.error = err?.message || String(err)
    return result
  }

  // Probe 2: auth endpoint (diagnostic only; does NOT fail preflight if REST works)
  const authProbeUrl = `${SUPABASE_URL}/auth/v1/settings`
  try {
    const res = await fetch(authProbeUrl, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    const body = await res.text().catch(() => '')
    result.checks.push({
      check: 'auth_settings_probe',
      url: authProbeUrl,
      ok: res.ok,
      status: res.status,
      body_preview: body.slice(0, 200),
      note: 'diagnostic_only',
    })
  } catch (err: any) {
    result.checks.push({
      check: 'auth_settings_probe',
      url: authProbeUrl,
      ok: false,
      error: fullErrorDetails(err),
      note: 'diagnostic_only',
    })
  }

  result.ok = true
  return result
}

async function fetchReplaySequence(userId: string, dateFrom?: string | null, dateTo?: string | null, maxCases = 100) {
  const rangeFilters: string[] = []
  if (dateFrom) rangeFilters.push(`created_at=gte.${dateFrom}`)
  if (dateTo) rangeFilters.push(`created_at=lte.${dateTo}`)
  const rf = rangeFilters.length ? `&${rangeFilters.join('&')}` : ''
  const scans = await rest(`/rest/v1/scans?user_id=eq.${userId}&select=*&order=created_at.asc&limit=${maxCases}${rf}`)
  const plans = await rest(`/rest/v1/plans?user_id=eq.${userId}&select=*&order=created_at.asc`)
  const runs = await rest(`/rest/v1/decision_engine_runs?user_id=eq.${userId}&select=*&order=created_at.asc`)
  const stateHistory = await rest(`/rest/v1/user_body_state_history?user_id=eq.${userId}&select=*&order=created_at.asc`)
  const profileRows = await rest(`/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`)
  const profile = Array.isArray(profileRows) && profileRows[0] ? profileRows[0] : {}

  const cases: AnyObj[] = []
  const scanRows = Array.isArray(scans) ? scans : []
  for (let i = 0; i < scanRows.length; i += 1) {
    const scan = scanRows[i]
    const prevScan = i > 0 ? scanRows[i - 1] : null
    const ts = new Date(scan.created_at).getTime()
    const plan = (Array.isArray(plans) ? plans : []).filter((p: AnyObj) => new Date(p.created_at).getTime() <= ts).slice(-1)[0] || null
    const run = (Array.isArray(runs) ? runs : []).filter((r: AnyObj) => r.scan_id === scan.id).slice(-1)[0] || null
    const hist = (Array.isArray(stateHistory) ? stateHistory : []).filter((h: AnyObj) => new Date(h.created_at).getTime() <= ts).slice(-1)[0] || null
    cases.push({
      caseKey: `${userId}:${scan.id}`,
      userId,
      scan,
      prevScan,
      plan,
      stateHistory: hist,
      sourceRun: run,
      profile,
      timestamp: scan.created_at,
    })
  }
  return cases
}

async function fetchFixtureReplaySequence(userId: string, fixtureSet: string, maxCases = 100) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const fixturePath = path.join(__dirname, 'fixtures', `${fixtureSet}.json`)
  const raw = await readFile(fixturePath, 'utf8')
  const fixture = JSON.parse(raw)
  const sequences = Array.isArray(fixture?.sequences) ? fixture.sequences : []
  const out: AnyObj[] = []
  for (const seq of sequences) {
    const points = Array.isArray(seq?.points) ? seq.points : []
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]
      const scanId = `${seq.sequence_id}-scan-${i + 1}`
      const createdAt = new Date(Date.UTC(2026, 0, 1 + Number(p.day || i * 14))).toISOString()
      const prev = i > 0 ? points[i - 1] : null
      const plan = {
        id: `${seq.sequence_id}-plan`,
        phase: seq.plan_phase || seq.profile?.goal || 'Maintain',
        target_bf: seq.target_bf,
      }
      const stateHistory = {
        id: `${seq.sequence_id}-state-${i + 1}`,
        state_snapshot: {
          stable_body_fat_low: Number(p.bf) - 0.5,
          stable_body_fat_high: Number(p.bf) + 0.5,
          state_confidence_score: p.confidence === 'high' ? 0.85 : p.confidence === 'low' ? 0.45 : 0.68,
          primary_limiting_factor: Array.isArray(p.weakest_groups) && p.weakest_groups[0] ? p.weakest_groups[0] : null,
          state_payload: {
            meaningful_body_fat_change: Boolean(p.meaningful_change),
          },
        },
      }
      out.push({
        caseKey: `${userId}:${scanId}`,
        userId,
        scan: {
          id: scanId,
          created_at: createdAt,
          body_fat: Number(p.bf),
          lean_mass: Number(p.lean_mass_lbs) * 0.453592,
          scan_confidence: p.confidence || 'medium',
          symmetry_score: Number(p.symmetry_score ?? 74),
          muscle_assessment: {
            weakest_groups: Array.isArray(p.weakest_groups) ? p.weakest_groups : [],
            limiting_factor: Array.isArray(p.weakest_groups) && p.weakest_groups[0] ? p.weakest_groups[0] : null,
          },
        },
        prevScan: prev
          ? {
              id: `${seq.sequence_id}-scan-${i}`,
              created_at: new Date(Date.UTC(2026, 0, 1 + Number(prev.day || (i - 1) * 14))).toISOString(),
              body_fat: Number(prev.bf),
              lean_mass: Number(prev.lean_mass_lbs) * 0.453592,
              scan_confidence: prev.confidence || 'medium',
              symmetry_score: Number(prev.symmetry_score ?? 74),
            }
          : null,
        plan,
        stateHistory,
        sourceRun: null,
        profile: seq.profile || {},
        timestamp: createdAt,
        scenarioType: String(seq.sequence_id || '').split('-').slice(0, -1).join('-') || 'unknown',
        sourceOutputOverride: p.source_output_override || null,
      })
      if (out.length >= maxCases) return out
    }
  }
  return out
}

function shortDiff(changes: AnyObj[]) {
  return changes.slice(0, 4).map((c) => `${c.field}: ${JSON.stringify(c.source)} -> ${JSON.stringify(c.replay)}`).join(' | ')
}

function normalizeScenarioType(raw: string) {
  if (raw.startsWith('gradual-fat-loss')) return 'gradual fat loss'
  if (raw.startsWith('plateau')) return 'plateau'
  if (raw.startsWith('fat-gain')) return 'fat gain'
  if (raw.startsWith('lean-loss-in-cut')) return 'lean mass loss during cut'
  if (raw.startsWith('noisy-scan')) return 'noisy scans'
  if (raw.startsWith('oscillating-bf')) return 'oscillating BF'
  return raw || 'unknown'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const diagnostics = diagnosticsHeader()
  const persistEnabled = !args.noPersist && Boolean(SUPABASE_URL && SERVICE_KEY)
  console.log('Replay diagnostics:', { ...diagnostics, persist_enabled: persistEnabled, fixture_set: args.fixtureSet || null })
  let runCols: string[] = []
  let caseCols: string[] = []
  let runId: string | null = null

  if (persistEnabled) {
    const preflight = await connectivityPreflight()
    console.log('Connectivity preflight:', preflight)
    if (!preflight.ok) {
      throw new Error(`Preflight failed [${preflight.error_kind || 'unknown'}]: ${preflight.error || 'unknown error'}`)
    }

    const readiness = await auditReplayReadiness()
    console.log('Replay schema readiness:')
    for (const [t, v] of Object.entries(readiness)) {
      const r = v as AnyObj
      const statusLabel = r.exists ? 'ok' : 'missing_or_unreachable'
      console.log(`- ${t}: ${statusLabel} (${r.columns.length} cols, mode=${r.mode}${r.error ? `, error=${r.error}` : ''})`)
    }

    const runProbe = await tableProbe('decision_replay_runs')
    const caseProbe = await tableProbe('decision_replay_cases')
    runCols = runProbe.columns
    caseCols = caseProbe.columns
    // empty_table is a valid first-run state; fail only for true missing/unreachable cases.
    if (!runProbe.exists || !caseProbe.exists) {
      throw new Error(
        `Replay tables missing or inaccessible. runs(mode=${runProbe.mode}, err=${runProbe.error || 'none'}), cases(mode=${caseProbe.mode}, err=${caseProbe.error || 'none'})`
      )
    }

    const runRow = await insertRow('decision_replay_runs', {
      user_id: args.userId,
      source_engine_version: args.sourceEngineVersion,
      replay_engine_version: args.replayEngineVersion,
      replay_mode: args.fixtureSet ? `fixture:${args.fixtureSet}` : 'cli_replay',
      input_range_start: args.dateFrom,
      input_range_end: args.dateTo,
      total_cases: 0,
      changed_cases: 0,
      improved_cases: 0,
      regressed_cases: 0,
      summary: {},
    }, runCols)
    runId = runRow?.id
    if (!runId) throw new Error('Could not create decision_replay_runs row')
  } else {
    console.log('Persistence disabled: running replay in local-only mode')
  }

  const cases = args.fixtureSet
    ? await fetchFixtureReplaySequence(args.userId, args.fixtureSet, args.maxCases)
    : await fetchReplaySequence(args.userId, args.dateFrom, args.dateTo, args.maxCases)
  let changed = 0
  let improved = 0
  let regressed = 0
  let unchanged = 0
  let gapViolations = 0
  const scenarioStats: Record<string, { total: number; changed: number; improved: number; regressed: number; unchanged: number }> = {}

  console.log(`\nReplaying ${cases.length} case(s) for user ${args.userId}`)
  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i]
    const historicalInput = buildHistoricalInput({
      profile: c.profile,
      scan: c.scan,
      prevScan: c.prevScan,
      plan: c.plan,
      stateHistory: c.stateHistory,
      runInputSnapshot: c.sourceRun?.input_snapshot || c.sourceRun?.input_summary || null,
    })
    console.info('[replay:case-evidence]', {
      case_key: c.caseKey,
      stable_bf_gap: getPath(historicalInput, 'stableEvidence.stable_bf_gap'),
      raw_bf_gap: getPath(historicalInput, 'stableEvidence.raw_bf_gap'),
      target_bf: getPath(historicalInput, 'stableEvidence.target_bf'),
    })
    const stableBfGap = toNum(getPath(historicalInput, 'stableEvidence.stable_bf_gap'), null)
    const rawBfGap = toNum(getPath(historicalInput, 'stableEvidence.raw_bf_gap'), null)
    const targetBf = toNum(getPath(historicalInput, 'stableEvidence.target_bf'), null)
    const bodyFat = toNum(getPath(historicalInput, 'latestScan.bodyFatPct'), null)
    if (args.requireNonnullBfGap && bodyFat != null && targetBf != null && (stableBfGap == null || rawBfGap == null)) {
      gapViolations += 1
      console.error('[replay:gap-validation] violation', { case_key: c.caseKey, body_fat: bodyFat, target_bf: targetBf, stable_bf_gap: stableBfGap, raw_bf_gap: rawBfGap })
    }
    const sourceOutput = c.sourceOutputOverride || c.sourceRun?.output_snapshot || c.sourceRun?.output_json || runEngineVersion('legacy-v1', historicalInput)
    const replayOutput = runEngineVersion(args.replayEngineVersion, historicalInput)
    const diff = compareOutputs(sourceOutput, replayOutput)
    const cls = classifyCase({ source: sourceOutput, replay: replayOutput, diff, input: historicalInput })

    if (diff.changed) changed += 1
    if (cls.classification === 'improvement') improved += 1
    else if (cls.classification === 'regression') regressed += 1
    else if (cls.classification === 'unchanged') unchanged += 1
    const scenario = normalizeScenarioType(String(c.scenarioType || 'historical'))
    if (!scenarioStats[scenario]) {
      scenarioStats[scenario] = { total: 0, changed: 0, improved: 0, regressed: 0, unchanged: 0 }
    }
    scenarioStats[scenario].total += 1
    if (diff.changed) scenarioStats[scenario].changed += 1
    if (cls.classification === 'improvement') scenarioStats[scenario].improved += 1
    else if (cls.classification === 'regression') scenarioStats[scenario].regressed += 1
    else if (cls.classification === 'unchanged') scenarioStats[scenario].unchanged += 1

    if (persistEnabled && runId) {
      await insertRow('decision_replay_cases', {
        replay_run_id: runId,
        user_id: args.userId,
        source_decision_run_id: c.sourceRun?.id || null,
        scan_id: c.scan?.id || null,
        plan_id: c.plan?.id || null,
        body_state_history_id: c.stateHistory?.id || null,
        case_index: i,
        source_engine_version: c.sourceRun?.engine_version || args.sourceEngineVersion,
        replay_engine_version: args.replayEngineVersion,
        source_input_snapshot: historicalInput,
        replay_input_snapshot: historicalInput,
        source_output_snapshot: sourceOutput,
        replay_output_snapshot: replayOutput,
        source_phase: getPath(sourceOutput, 'phase_decision.recommended_phase') || null,
        replay_phase: getPath(replayOutput, 'phase_decision.recommended_phase') || null,
        source_recommendation: getPath(sourceOutput, 'human_explanation') || getPath(sourceOutput, 'phase_decision.reason') || null,
        replay_recommendation: getPath(replayOutput, 'human_explanation') || getPath(replayOutput, 'phase_decision.reason') || null,
        changed: diff.changed,
        regression_flag: cls.classification === 'regression',
        improvement_flag: cls.classification === 'improvement',
        diff_summary: {
          classification: cls.classification,
          reason: cls.reason,
          changes: diff.changes,
          scenario_type: scenario,
          stable_bf_gap: stableBfGap,
          raw_bf_gap: rawBfGap,
        },
      }, caseCols)
    }

    if (diff.changed) {
      console.log(`- CHANGED ${c.caseKey} [${cls.classification}] reason=${cls.reason} ${shortDiff(diff.changes)}`)
    }
  }

  if (persistEnabled && runId) {
    await updateRows('decision_replay_runs', `id=eq.${runId}`, {
      total_cases: cases.length,
      changed_cases: changed,
      improved_cases: improved,
      regressed_cases: regressed,
      summary: {
        changed_rate: cases.length ? Number((changed / cases.length).toFixed(4)) : 0,
        improvement_rate: cases.length ? Number((improved / cases.length).toFixed(4)) : 0,
        regression_rate: cases.length ? Number((regressed / cases.length).toFixed(4)) : 0,
        unchanged_cases: unchanged,
        source_engine_version: args.sourceEngineVersion,
        replay_engine_version: args.replayEngineVersion,
        scenario_stats: scenarioStats,
        gap_violations: gapViolations,
      },
    }, runCols)
  }

  console.log('\nReplay summary:')
  console.log(`- total cases: ${cases.length}`)
  console.log(`- changed cases: ${changed}`)
  console.log(`- improved cases: ${improved}`)
  console.log(`- regressed cases: ${regressed}`)
  console.log(`- unchanged cases: ${unchanged}`)
  console.log(`- bf-gap violations: ${gapViolations}`)
  console.log('- scenario summary:')
  for (const [k, v] of Object.entries(scenarioStats)) {
    console.log(`  - ${k}: total=${v.total}, changed=${v.changed}, improved=${v.improved}, regressed=${v.regressed}, unchanged=${v.unchanged}`)
  }
  console.log(`- run id: ${runId || 'local-only'}`)
  if (args.requireNonnullBfGap && gapViolations > 0) {
    throw new Error(`Non-null bf-gap requirement failed with ${gapViolations} violation(s)`)
  }
}

main().catch(async (err) => {
  console.error('Replay failed:', err?.message || err)
  if ((err as any)?.target_url || (err as any)?.details || (err as any)?.raw) {
    console.error('Replay failure diagnostics:', {
      target_url: (err as any)?.target_url || null,
      kind: (err as any)?.kind || null,
      status: (err as any)?.status || null,
      details: (err as any)?.details || null,
      raw: (err as any)?.raw || null,
    })
  } else {
    console.error('Replay failure diagnostics:', fullErrorDetails(err))
  }
  process.exit(1)
})
