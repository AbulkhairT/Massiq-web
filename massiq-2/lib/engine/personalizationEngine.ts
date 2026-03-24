/**
 * MassIQ personalization engine v2 — deterministic rules, structured output,
 * human-readable explanation. No network I/O.
 */

import { computeAdaptation, ADAPTATION_DECISIONS } from './adaptation.js'
import type {
  AdherenceContext,
  MassIQPersonalizationDecision,
  NutritionAdjustments,
  TrainingAdjustments,
  BehaviorFocus,
  PhaseLabel,
  BodyState,
} from './decisionTypes'

export const ENGINE_VERSION = '2.0.0'

const PHASE = {
  CUT: 'Cut' as PhaseLabel,
  BULK: 'Bulk' as PhaseLabel,
  RECOMP: 'Recomp' as PhaseLabel,
  MAINTAIN: 'Maintain' as PhaseLabel,
}

function normPhase(p: string | undefined | null): PhaseLabel {
  const s = String(p || '').toLowerCase()
  if (s === 'cut') return PHASE.CUT
  if (s === 'bulk' || s === 'build') return PHASE.BULK
  if (s === 'recomp') return PHASE.RECOMP
  return PHASE.MAINTAIN
}

/** Map scan text + groups → canonical muscle keys */
function toMuscleKeys(
  weakestGroups: unknown,
  muscleGroups: unknown,
  diagnosis: unknown,
): string[] {
  const out: string[] = []
  const push = (x: string | undefined | null) => {
    if (!x) return
    const t = String(x).toLowerCase()
    if (t.includes('chest') || t.includes('pec')) out.push('chest')
    else if (t.includes('shoulder') || t.includes('delt')) out.push('shoulders')
    else if (t.includes('back') || t.includes('lat') || t.includes('trap')) out.push('back')
    else if (t.includes('bicep') || t.includes('tricep') || t.includes('arm')) out.push('arms')
    else if (t.includes('quad') || t.includes('leg') && !t.includes('calf')) out.push('quads')
    else if (t.includes('glute') || t.includes('hip')) out.push('glutes')
    else if (t.includes('calf') || t.includes('calves')) out.push('calves')
    else if (t.includes('ham') || t.includes('leg')) out.push('legs')
    else if (t.includes('core') || t.includes('ab')) out.push('core')
  }
  if (Array.isArray(weakestGroups)) weakestGroups.slice(0, 8).forEach((g) => push(typeof g === 'string' ? g : (g as { name?: string })?.name))
  if (Array.isArray(muscleGroups)) muscleGroups.slice(0, 8).forEach((g) => push(typeof g === 'string' ? g : (g as { name?: string })?.name))
  if (diagnosis) push(String(diagnosis))
  return [...new Set(out)]
}

function leanMassTrend(
  prev: { leanMass?: number } | null,
  curr: number | undefined,
): 'gaining' | 'losing' | 'stable' | 'unknown' {
  if (prev == null || curr == null) return 'unknown'
  const d = Number(curr) - Number(prev.leanMass)
  if (d > 0.4) return 'gaining'
  if (d < -0.4) return 'losing'
  return 'stable'
}

function buildWeeklySetTargets(high: string[], medium: string[]): Record<string, number> {
  const o: Record<string, number> = {}
  high.forEach((m) => {
    o[m] = (o[m] || 0) + 6
  })
  medium.forEach((m) => {
    o[m] = (o[m] || 0) + 3
  })
  return o
}

function buildFrequencyTargets(high: string[]): Record<string, number> {
  const o: Record<string, number> = {}
  high.forEach((m) => {
    o[m] = 2
  })
  return o
}

function buildHumanExplanation(d: MassIQPersonalizationDecision): string {
  const p = d.phase_decision
  const n = d.nutrition_adjustments
  const t = d.training_adjustments
  const b = d.body_state

  const parts: string[] = []
  parts.push(`${p.reason}`)

  if (b.bf_vs_target === 'near' || b.bf_vs_target === 'at_or_below') {
    parts.push('Body composition is close to your target, so we are prioritizing muscle retention and sustainable intake.')
  }
  if (b.lean_mass_trend === 'losing' && p.recommended_phase === PHASE.CUT) {
    parts.push('Lean mass is trending down — we are easing deficit aggressiveness and increasing protein.')
  }
  if (n.simplify_meals) {
    parts.push('Meals are simplified for easier adherence (repeat favorites, fewer unique recipes).')
  }
  if (n.carb_training_emphasis) {
    parts.push('Carbohydrates are emphasized around training days to support performance and recovery.')
  }
  if (n.vegetarian_protein_optimize) {
    parts.push('Protein sources are optimized for your plant-based preferences (variety + complete amino acid coverage).')
  }
  if (t.priority_muscles_high.length) {
    parts.push(
      `${t.priority_muscles_high.join(', ')} ${
        t.priority_muscles_high.length > 1 ? 'are' : 'is'
      } your highest-priority lagging area${t.priority_muscles_high.length > 1 ? 's' : ''}; training increases frequency and weekly set volume there.`,
    )
  }
  if (t.unilateral) {
    parts.push('Unilateral work is included to address asymmetry.')
  }
  if (d.behavior.habit_interventions.length) {
    parts.push(d.behavior.habit_interventions.slice(0, 2).join(' '))
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export interface PersonalizationInput {
  profile: Record<string, unknown>
  latestScan: Record<string, unknown>
  previousScan: Record<string, unknown> | null
  currentPlan: Record<string, unknown> | null
  scanResult: Record<string, unknown>
  adherenceContext?: AdherenceContext | null
}

/**
 * Main entry — same export name as legacy `scanDecisionEngine` for drop-in.
 */
export function runScanDecisionEngine(input: PersonalizationInput): MassIQPersonalizationDecision {
  const profile = input.profile || {}
  const latest = input.latestScan || {}
  const prev = input.previousScan || null
  const plan = input.currentPlan || null
  const scanRes = input.scanResult || {}
  const adh = input.adherenceContext || {}

  const currentBF = Number(latest.bodyFat ?? latest.bodyFatPct ?? scanRes.bodyFatPct ?? 0)
  const targetBF = Number(plan?.targetBF ?? profile.targetBF ?? currentBF)
  const goal = normPhase(String(profile.goal || plan?.phase || 'Maintain'))
  const prevPhase = normPhase(String(plan?.phase || profile.goal || 'Maintain'))
  const bfGap = currentBF - targetBF

  const female = String(profile.gender || '').toLowerCase() === 'female'
  const leanThreshold = female ? 22 : 12
  const nearTarget = Number.isFinite(bfGap) && bfGap <= 2.5 && bfGap >= -1

  const newScan = {
    date: String(latest.date || new Date().toISOString().slice(0, 10)),
    bodyFat: currentBF,
    bodyFatPct: currentBF,
    leanMass: latest.leanMass ?? scanRes.leanMass,
    physiqueScore: latest.physiqueScore ?? scanRes.physiqueScore,
    symmetryScore: latest.symmetryScore ?? scanRes.symmetryScore,
    confidence: String(latest.confidence || scanRes.confidence || 'medium'),
  }

  const prevAdapt = prev
    ? {
        date: prev.date,
        bodyFat: prev.bodyFat ?? prev.bodyFatPct,
        leanMass: prev.leanMass,
        physiqueScore: prev.physiqueScore,
        symmetryScore: prev.symmetryScore,
      }
    : null

  const adaptation = computeAdaptation(newScan, prevAdapt, plan) as MassIQPersonalizationDecision['adaptation_legacy']

  let recommendedPhase: PhaseLabel = goal
  let phaseReason = 'Aligned with your profile goal and latest scan trajectory.'
  let phaseConfidence: 'high' | 'medium' | 'low' = 'medium'

  // ── Phase rules (deterministic) ───────────────────────────────────────────
  if (Number.isFinite(bfGap) && bfGap > 4 && goal !== PHASE.CUT) {
    recommendedPhase = PHASE.CUT
    phaseReason = 'Body fat is materially above target — prioritize a dedicated fat-loss phase.'
    phaseConfidence = 'high'
  } else if (
    goal === PHASE.CUT
    && nearTarget
    && adaptation.comparison
    && Number((adaptation.comparison as { lm_delta_lbs?: number }).lm_delta_lbs ?? 0) < -1.2
  ) {
    recommendedPhase = PHASE.RECOMP
    phaseReason =
      'Body fat is near target but lean mass is slipping — we are shifting toward recomp to protect muscle.'
    phaseConfidence = 'high'
  } else if (goal === PHASE.CUT && Number.isFinite(bfGap) && bfGap < -1) {
    recommendedPhase = PHASE.RECOMP
    phaseReason = 'You are lean enough relative to target — transition to recomp or maintenance.'
    phaseConfidence = 'medium'
  } else if (goal === PHASE.BULK && Number.isFinite(currentBF) && currentBF > targetBF + 5) {
    recommendedPhase = PHASE.RECOMP
    phaseReason = 'Fat gain is outpacing muscle — we are tempering the bulk toward recomp.'
    phaseConfidence = 'high'
  } else if (
    goal !== PHASE.CUT
    && currentBF <= leanThreshold
    && toMuscleKeys(scanRes.weakestGroups, scanRes.muscleGroups, scanRes.diagnosis).length > 0
  ) {
    if (recommendedPhase === PHASE.MAINTAIN) {
      recommendedPhase = PHASE.RECOMP
      phaseReason = 'Lean enough; muscle development is the main limiter — recomp or lean bulk emphasis.'
      phaseConfidence = 'medium'
    }
  }

  // Stalled progress / plateau
  if (prev && adaptation.comparison) {
    const cmp = adaptation.comparison as { days_elapsed?: number; bf_delta?: number; pace_vs_expected?: string }
    const days = cmp.days_elapsed ?? 0
    const bfDelta = Number(cmp.bf_delta ?? 0)
    if (days >= 21 && Math.abs(bfDelta) < 0.3 && goal === PHASE.CUT) {
      phaseReason = 'Limited measurable progress over several weeks — adjusting strategy (intake and training emphasis).'
      phaseConfidence = 'medium'
    }
  }

  // Low scan confidence
  if (String(newScan.confidence).toLowerCase() === 'low') {
    phaseConfidence = 'low'
  }

  const muscles = toMuscleKeys(scanRes.weakestGroups, scanRes.muscleGroups, scanRes.diagnosis)
  const high = muscles.slice(0, 2)
  const medium = muscles.slice(2, 4)
  const priorityList = [...high, ...medium]

  let volumeDelta = 0
  if (high.some((m) => m === 'chest' || m === 'back' || m === 'shoulders')) volumeDelta += 1
  if (
    adaptation.decision === ADAPTATION_DECISIONS.AGGRESSIVE_DEFICIT
    || adaptation.decision === ADAPTATION_DECISIONS.IMPROVE_RECOVERY
  ) {
    volumeDelta -= 1
  }

  const symDelta = prev
    ? Number(newScan.symmetryScore ?? 0) - Number(prev.symmetryScore ?? 0)
    : 0
  const balanceNote = scanRes.balanceNote ? String(scanRes.balanceNote).toLowerCase() : ''
  const unilateral =
    Math.abs(symDelta) >= 3 || balanceNote.includes('asym') || balanceNote.includes('imbalance')

  const lmTrend = leanMassTrend(prevAdapt as { leanMass?: number } | null, Number(newScan.leanMass))

  let bfVsTarget: BodyState['bf_vs_target'] = 'unknown'
  if (Number.isFinite(bfGap)) {
    if (bfGap > 4) bfVsTarget = 'far_above'
    else if (bfGap > 1.5) bfVsTarget = 'above'
    else if (bfGap > -1) bfVsTarget = 'near'
    else bfVsTarget = 'at_or_below'
  }

  const body_state: MassIQPersonalizationDecision['body_state'] = {
    body_fat_pct: Number.isFinite(currentBF) ? currentBF : null,
    target_body_fat_pct: Number.isFinite(targetBF) ? targetBF : null,
    lean_mass_trend: lmTrend,
    bf_vs_target: bfVsTarget,
    symmetry_flag: unilateral ? 'asymmetry' : 'balanced',
    upper_lower_balance: null,
  }

  const calDelta = adaptation.adjustment?.calories_delta ?? 0
  const protDelta = adaptation.adjustment?.protein_delta_g ?? 0
  const fatDelta = adaptation.adjustment?.fat_delta_g ?? 0

  let carbTraining =
    recommendedPhase === PHASE.BULK
    || recommendedPhase === PHASE.RECOMP
    || (recommendedPhase === PHASE.CUT && nearTarget)
  if (adaptation.decision === ADAPTATION_DECISIONS.AGGRESSIVE_DEFICIT) carbTraining = false

  let carbDelta = carbTraining ? 15 : 0
  if (high.includes('quads') || high.includes('legs')) carbDelta += 5

  let deficitAgg: 'mild' | 'moderate' | 'aggressive' = 'moderate'
  if (recommendedPhase === PHASE.CUT && bfGap > 4) deficitAgg = 'aggressive'
  if (adaptation.decision === ADAPTATION_DECISIONS.AGGRESSIVE_DEFICIT || lmTrend === 'losing') {
    deficitAgg = 'mild'
  }

  let simplify =
    adaptation.decision === ADAPTATION_DECISIONS.FLAG_PLATEAU
    || adaptation.decision === ADAPTATION_DECISIONS.LOW_CONF_RESCAN

  const skipped = adh.skipped_meals_per_week_estimate ?? 0
  const weekend = adh.weekend_slip_score ?? 0
  if (skipped >= 4 || weekend > 0.55) simplify = true

  if (adh.late_night_cravings || adh.meal_boredom) simplify = true

  const dietPrefs = Array.isArray(profile.dietPrefs) ? (profile.dietPrefs as string[]) : []
  const isVeg = dietPrefs.some((d) => /vegan/i.test(d) || /vegetarian/i.test(d))
  let vegProtBoost = 0
  if (isVeg) vegProtBoost = 10

  const nutrition_adjustments: NutritionAdjustments = {
    calories_delta: calDelta,
    protein_delta_g: protDelta + vegProtBoost,
    carbs_delta_g: carbDelta,
    fat_delta_g: fatDelta,
    deficit_aggressiveness: deficitAgg,
    carb_timing: carbTraining ? 'around_training' : 'even',
    protein_distribution: high.length ? 'peri_workout_heavy' : 'even',
    satiety_focus: simplify || Boolean(adh.hunger_score && adh.hunger_score > 0.6),
    simplify_meals: simplify,
    carb_training_emphasis: carbTraining,
    vegetarian_protein_optimize: isVeg,
    directives: [],
  }
  if (simplify) nutrition_adjustments.directives.push('repeat_favorites', 'fewer_unique_recipes')
  if (carbTraining) nutrition_adjustments.directives.push('extra_carbs_on_training_days')
  if (isVeg) nutrition_adjustments.directives.push('plant_protein_diversity', 'leucine_rich_meals')

  const recoveryNotes: string[] = []
  if (lmTrend === 'losing' && recommendedPhase === PHASE.CUT) {
    recoveryNotes.push('Prioritize sleep + limit extra volume until lean mass stabilizes.')
  }
  if (adaptation.decision === ADAPTATION_DECISIONS.IMPROVE_RECOVERY) {
    recoveryNotes.push('Reduce junk volume; add rest or light days as needed.')
  }

  const training_adjustments: TrainingAdjustments = {
    priority_muscles: priorityList,
    priority_muscles_high: high,
    priority_muscles_medium: medium,
    weekly_set_targets: buildWeeklySetTargets(high, medium),
    frequency_targets: buildFrequencyTargets(high),
    exercise_emphasis: high.map((m) => `${m}: volume + frequency`),
    recovery_notes: recoveryNotes.join(' '),
    volume_delta_sets: volumeDelta,
    cardio_delta: recommendedPhase === PHASE.CUT ? 1 : 0,
    unilateral,
    move_priority_muscles_early_in_week: high.includes('chest') || high.includes('shoulders'),
    reduce_junk_volume: adaptation.decision === ADAPTATION_DECISIONS.AGGRESSIVE_DEFICIT,
  }

  const adherence_risks: string[] = []
  if (skipped >= 4) adherence_risks.push('skipped_meals')
  if (weekend > 0.5) adherence_risks.push('weekend_slip')
  if (adh.scan_consistency_score != null && adh.scan_consistency_score < 0.4) {
    adherence_risks.push('inconsistent_check_ins')
  }

  const habit_interventions: string[] = []
  if (simplify) habit_interventions.push('Repeat the same breakfast and lunch 3–4 days to reduce decision fatigue.')
  if (adh.late_night_cravings) habit_interventions.push('Add a protein-forward evening snack to curb late calories.')
  if (adh.meal_boredom) habit_interventions.push('Rotate 2 dinner templates weekly instead of 7 unique meals.')

  const behavior: BehaviorFocus = {
    adherence_risks,
    habit_interventions,
    tags: [
      ...(adaptation.decision === ADAPTATION_DECISIONS.LOW_CONF_RESCAN ? ['better_lighting_rescan'] : []),
      ...(unilateral ? ['unilateral_accessory_work'] : []),
    ],
  }

  let weeksToBf: number | null = null
  if (Number.isFinite(bfGap) && bfGap > 0.5 && recommendedPhase === PHASE.CUT) {
    weeksToBf = Math.max(4, Math.round(bfGap / 0.35))
  }

  const projection = {
    next_checkpoint_weeks: 4,
    weeks_to_target_bf: weeksToBf,
    summary: adaptation.rationale || '',
  }

  const phase_decision = {
    recommended_phase: recommendedPhase,
    confidence: phaseConfidence,
    reason: phaseReason,
    rationale: phaseReason,
    previous_phase: prevPhase,
  }

  const raw: MassIQPersonalizationDecision = {
    engine_version: ENGINE_VERSION,
    phase_decision,
    body_state,
    nutrition_adjustments,
    training_adjustments,
    behavior,
    projection,
    human_explanation: '',
    adaptation_legacy: adaptation,
    behavior_focus: behavior.tags,
  }

  raw.human_explanation = buildHumanExplanation(raw)

  console.info('[decision:engine]', {
    version: ENGINE_VERSION,
    phase: recommendedPhase,
    adaptation: adaptation.decision,
  })
  console.info('[decision:phase]', phase_decision)
  console.info('[decision:nutrition]', {
    deficit: nutrition_adjustments.deficit_aggressiveness,
    simplify: nutrition_adjustments.simplify_meals,
    carb_train: nutrition_adjustments.carb_training_emphasis,
  })
  console.info('[decision:training]', {
    priority_high: high,
    volume_delta: volumeDelta,
    unilateral,
  })
  console.info('[decision:behavior]', { risks: adherence_risks.length, habits: habit_interventions.length })

  return raw
}
