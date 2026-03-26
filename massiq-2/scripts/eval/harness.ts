import bodyFixtures from './fixtures/body-stability.json'
import foodFixtures from './fixtures/food-reasonableness.json'
import decisionFixtures from './fixtures/decision-consistency.json'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import {
  extractBodySignals,
  stabilizeBodyState,
  buildStableComparison,
  buildDecisionEngineInput,
  runDecisionEngineOnStableState,
} from '../../lib/engine/stableState'
import { extractFoodSignals, summarizeFoodSignals } from '../../lib/engine/foodSignals'

type CaseResult = { id: string; ok: boolean; details: string[] }
type SectionResult = { name: string; rows: CaseResult[]; passCount: number; total: number }

function mid(low: number | null, high: number | null): number | null {
  if (low == null || high == null) return null
  return (Number(low) + Number(high)) / 2
}

function rankLabel(v: string): number {
  if (v === 'low') return 1
  if (v === 'medium') return 2
  if (v === 'high') return 3
  return 0
}

function testBodyStability(): CaseResult[] {
  const out: CaseResult[] = []
  for (const fx of bodyFixtures as any[]) {
    const details: string[] = []
    const raw = extractBodySignals(fx.currentScanResult)
    const stable = stabilizeBodyState({
      previousState: fx.previousState,
      previousSignals: [],
      currentSignals: raw,
      scanId: 'test-scan',
      previousScanId: 'prev-scan',
    })
    const cmp = buildStableComparison({ previousState: fx.previousState, currentState: stable })
    const prevMid = mid(fx.previousState.stable_body_fat_low, fx.previousState.stable_body_fat_high)
    const stableMid = mid(stable.stable_body_fat_low, stable.stable_body_fat_high)
    const shift = prevMid != null && stableMid != null ? Math.abs(stableMid - prevMid) : 0
    let ok = true

    if (typeof fx.expected.max_midpoint_shift === 'number' && shift > fx.expected.max_midpoint_shift) {
      ok = false
      details.push(`midpoint shift too large (${shift.toFixed(2)} > ${fx.expected.max_midpoint_shift})`)
    }
    if (typeof fx.expected.min_midpoint_shift === 'number' && shift < fx.expected.min_midpoint_shift) {
      ok = false
      details.push(`midpoint shift too small (${shift.toFixed(2)} < ${fx.expected.min_midpoint_shift})`)
    }
    if (fx.expected.expected_primary_limiting_factor && stable.primary_limiting_factor !== fx.expected.expected_primary_limiting_factor) {
      ok = false
      details.push(`limiting factor mismatch (${stable.primary_limiting_factor} != ${fx.expected.expected_primary_limiting_factor})`)
    }
    if (typeof fx.expected.allow_meaningful_change === 'boolean' && cmp.meaningfulChange !== fx.expected.allow_meaningful_change) {
      ok = false
      details.push(`meaningful-change flag mismatch (${cmp.meaningfulChange} != ${fx.expected.allow_meaningful_change})`)
    }
    if (fx.expected.expected_robustness_label && raw?.robustness_label !== fx.expected.expected_robustness_label) {
      ok = false
      details.push(`robustness label mismatch (${raw?.robustness_label} != ${fx.expected.expected_robustness_label})`)
    }
    if (fx.expected.phase_should_remain && fx.decisionContext) {
      const input = buildDecisionEngineInput({
        profile: fx.decisionContext.profile,
        currentPlan: fx.decisionContext.currentPlan,
        stabilizedBodyState: stable,
        latestSignals: raw,
        recentFoodSummary: fx.decisionContext.recentFoodSummary || {},
        previousScan: fx.decisionContext.previousScan || null,
      })
      const decision = runDecisionEngineOnStableState(input)
      const phase = decision?.phase_decision?.recommended_phase
      if (phase !== fx.expected.phase_should_remain) {
        ok = false
        details.push(`phase drift under noisy variation (${phase} != ${fx.expected.phase_should_remain})`)
      }
    }
    if (details.length === 0) details.push('stable-state behavior within expected bounds')
    out.push({ id: fx.id, ok, details })
  }
  return out
}

function testFoodReasonableness(): CaseResult[] {
  const out: CaseResult[] = []
  for (const fx of foodFixtures as any[]) {
    const details: string[] = []
    const signals = extractFoodSignals(fx.payload)
    const summary = summarizeFoodSignals(signals)
    let ok = true

    if (typeof fx.expected.calories_midpoint_tolerance === 'number') {
      const d = Math.abs(Number(summary.calories || 0) - Number(fx.payload.calories || 0))
      if (d > fx.expected.calories_midpoint_tolerance) {
        ok = false
        details.push(`calorie midpoint outside tolerance (${d} > ${fx.expected.calories_midpoint_tolerance})`)
      }
    }
    if (typeof fx.expected.protein_midpoint_tolerance === 'number') {
      const d = Math.abs(Number(summary.protein_g || 0) - Number(fx.payload.protein_g || 0))
      if (d > fx.expected.protein_midpoint_tolerance) {
        ok = false
        details.push(`protein midpoint outside tolerance (${d} > ${fx.expected.protein_midpoint_tolerance})`)
      }
    }
    if (fx.expected.must_have_ambiguity_flags && (!Array.isArray(signals.ambiguity_flags) || signals.ambiguity_flags.length === 0)) {
      ok = false
      details.push('expected ambiguity flags but none present')
    }
    if (fx.expected.min_confidence && rankLabel(signals.confidence_label) < rankLabel(fx.expected.min_confidence)) {
      ok = false
      details.push(`confidence too low (${signals.confidence_label} < ${fx.expected.min_confidence})`)
    }
    if (fx.expected.max_confidence && rankLabel(signals.confidence_label) > rankLabel(fx.expected.max_confidence)) {
      ok = false
      details.push(`confidence too high (${signals.confidence_label} > ${fx.expected.max_confidence})`)
    }
    if (details.length === 0) details.push('food extraction/summarization looks reasonable')
    out.push({ id: fx.id, ok, details })
  }
  return out
}

function testDecisionConsistency(): CaseResult[] {
  const out: CaseResult[] = []
  for (const fx of decisionFixtures as any[]) {
    const details: string[] = []
    const raw = extractBodySignals(fx.currentScanResult)
    const stable = stabilizeBodyState({
      previousState: fx.previousState,
      previousSignals: [],
      currentSignals: raw,
      scanId: 'test-scan',
      previousScanId: 'prev-scan',
    })
    const cmp = buildStableComparison({ previousState: fx.previousState, currentState: stable })
    const decisionInput = buildDecisionEngineInput({
      profile: fx.profile,
      currentPlan: fx.currentPlan,
      stabilizedBodyState: stable,
      latestSignals: raw,
      recentFoodSummary: fx.recentFoodSummary || {},
      previousScan: fx.previousScan,
    })
    const decision = runDecisionEngineOnStableState(decisionInput)
    const phase = decision?.phase_decision?.recommended_phase
    let ok = true

    if (fx.expected.phase_should_remain && phase !== fx.expected.phase_should_remain) {
      ok = false
      details.push(`phase changed unexpectedly (${phase} != ${fx.expected.phase_should_remain})`)
    }
    if (Array.isArray(fx.expected.phase_should_be_one_of) && !fx.expected.phase_should_be_one_of.includes(phase)) {
      ok = false
      details.push(`phase not in expected set (${phase})`)
    }
    if (fx.expected.must_not_trigger_meaningful_change === true && cmp.meaningfulChange) {
      ok = false
      details.push('unexpected meaningful-change trigger')
    }
    if (fx.expected.must_trigger_meaningful_change === true && !cmp.meaningfulChange) {
      ok = false
      details.push('expected meaningful-change trigger')
    }
    if (fx.expected.limiting_factor_should_persist && stable.primary_limiting_factor !== fx.expected.limiting_factor_should_persist) {
      ok = false
      details.push(`limiting factor drifted (${stable.primary_limiting_factor} != ${fx.expected.limiting_factor_should_persist})`)
    }
    if (details.length === 0) details.push('decision engine remained consistent with stable-state evidence')
    out.push({ id: fx.id, ok, details })
  }
  return out
}

function printSection(title: string, rows: CaseResult[]) {
  console.log(`\n=== ${title} ===`)
  for (const r of rows) {
    const badge = r.ok ? 'PASS' : 'FAIL'
    console.log(`[${badge}] ${r.id}`)
    for (const d of r.details) console.log(`  - ${d}`)
  }
  const passCount = rows.filter((r) => r.ok).length
  console.log(`Result: ${passCount}/${rows.length} passed`)
}

function sectionResult(name: string, rows: CaseResult[]): SectionResult {
  return { name, rows, passCount: rows.filter((r) => r.ok).length, total: rows.length }
}

function weakPointSummary(all: CaseResult[]) {
  const failed = all.filter((x) => !x.ok)
  console.log('\n=== Remaining Weak Points ===')
  if (failed.length === 0) {
    console.log('- No fixture failures in this baseline harness run.')
    console.log('- Residual risk: model extraction quality can still drift if prompt/output schema changes upstream.')
    console.log('- Residual risk: phase transitions are deterministic but still heuristic; edge populations may need additional fixtures.')
    return
  }
  console.log('- Highest risk areas are fixture groups with FAIL results:')
  for (const f of failed) console.log(`  - ${f.id}: ${f.details.join('; ')}`)
}

function parseArgs(argv: string[]) {
  return {
    failOnAnyFail: argv.includes('--fail-on-any-fail'),
  }
}

async function saveAndCompareBaseline(sections: SectionResult[]) {
  const evalDir = path.resolve(process.cwd(), 'scripts/eval/.baseline')
  await mkdir(evalDir, { recursive: true })
  const latestPath = path.join(evalDir, 'latest.json')
  const previousPath = path.join(evalDir, 'previous.json')
  const now = new Date().toISOString()
  const current = {
    generated_at: now,
    sections: sections.map((s) => ({
      name: s.name,
      passCount: s.passCount,
      total: s.total,
      failed: s.rows.filter((r) => !r.ok).map((r) => r.id),
    })),
  }

  let previous: any = null
  if (existsSync(latestPath)) {
    const raw = await readFile(latestPath, 'utf8')
    previous = JSON.parse(raw)
    await writeFile(previousPath, JSON.stringify(previous, null, 2), 'utf8')
  }
  await writeFile(latestPath, JSON.stringify(current, null, 2), 'utf8')

  console.log('\n=== Baseline Tracking ===')
  console.log(`- Saved latest baseline: ${latestPath}`)
  if (!previous) {
    console.log('- No previous baseline found; comparison deferred to next run.')
    return
  }

  const prevByName = new Map<string, any>((previous.sections || []).map((s: any) => [s.name, s]))
  let regressions = 0
  let improvements = 0
  for (const cur of current.sections) {
    const prev = prevByName.get(cur.name)
    if (!prev) continue
    const prevRate = prev.passCount / Math.max(1, prev.total)
    const curRate = cur.passCount / Math.max(1, cur.total)
    if (curRate < prevRate) regressions += 1
    if (curRate > prevRate) improvements += 1
  }
  console.log(`- Comparison vs previous: ${improvements} improved section(s), ${regressions} regressed section(s)`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const body = testBodyStability()
  const food = testFoodReasonableness()
  const decision = testDecisionConsistency()
  printSection('Body Scan Stability', body)
  printSection('Food Scan Reasonableness', food)
  printSection('Decision Engine Consistency', decision)
  const all = [...body, ...food, ...decision]
  weakPointSummary(all)
  await saveAndCompareBaseline([
    sectionResult('Body Scan Stability', body),
    sectionResult('Food Scan Reasonableness', food),
    sectionResult('Decision Engine Consistency', decision),
  ])
  const failedCount = all.filter((x) => !x.ok).length
  if (args.failOnAnyFail && failedCount > 0) {
    console.error(`\nStrict mode failed: ${failedCount} failing case(s).`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Harness execution failed:', err)
  process.exit(1)
})
