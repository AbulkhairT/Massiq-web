/* ─── MassIQ Intelligence Engine — Orchestrator ──────────────────────────
   Single entry point. Accepts raw user data, runs all modules in sequence,
   returns a fully structured EngineOutput.

   Data flow:
   1. validate/normalize input
   2. run physiological calculations (calculator)
   3. run feedback loop if ≥2 scans (feedback)
   4. run diagnosis (diagnosis)
   5. build recommendations (recommendations)
   6. build trajectory (trajectory)
   7. assemble next_actions priority list
   8. validate output constraints
   9. return
────────────────────────────────────────────────────────────────────────── */

import type {
  EngineInput, EngineOutput,
  CurrentState, NextAction, MacroTargets,
} from './types'

import { runCalculations, buildMacroTargets, defaultTargetBF, trainingDays } from './calculator'
import { runDiagnosis }       from './diagnosis'
import { buildRecommendations } from './recommendations'
import { calcTimeline }       from './trajectory'
import { analyzeScanProgress } from './feedback'
import { normalizeInput, validateOutput } from './validate'

/* ─────────────────────────────────────────────────────────────────────── */
/* Main engine function                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

export function runEngine(rawInput: Partial<EngineInput> & { profile: any }): EngineOutput {

  /* ── 1. Normalize input ──────────────────────────────────────────────── */
  const input = normalizeInput(rawInput)
  const { profile, currentScan, previousScans = [], recentLogs = [] } = input

  /* ── 2. Physiological calculations ──────────────────────────────────── */
  const physio = runCalculations(profile, currentScan)

  /* ── 3. Feedback loop (multi-scan) ──────────────────────────────────── */
  let feedback = undefined
  if (previousScans.length >= 1 && currentScan) {
    const prevScan = previousScans[previousScans.length - 1]
    feedback = analyzeScanProgress(prevScan, currentScan, physio, profile.goal)
  }

  /* ── 4. Diagnosis ────────────────────────────────────────────────────── */
  const td = trainingDays(profile.goal)
  const diagnosis = runDiagnosis(
    physio,
    { goal: profile.goal, gender: profile.gender },
    { sleepHours: 8, trainingDaysPerWeek: td.resistance },
    feedback,
  )

  /* ── 5. Recommendations ──────────────────────────────────────────────── */
  const recommendations = buildRecommendations(
    physio,
    diagnosis,
    { goal: profile.goal, gender: profile.gender },
    feedback,
  )

  /* ── 6. Trajectory ───────────────────────────────────────────────────── */
  const startBF  = currentScan?.bodyFat ?? physio.bfPct
  const targetBF = defaultTargetBF(startBF, profile.goal, profile.gender)

  const trajectory = calcTimeline(
    startBF,
    targetBF,
    profile.weightLbs,
    Math.abs(physio.deficit),
    profile.goal,
  )

  /* ── 7. Current state summary ────────────────────────────────────────── */
  const weeksInPlan = previousScans.length > 0 && currentScan
    ? Math.round(
        (new Date(currentScan.date).getTime() - new Date(previousScans[0].date).getTime())
        / (7 * 86400000)
      )
    : 0

  const currentState: CurrentState = {
    body_fat_pct: physio.bfPct,
    lean_mass_lbs: physio.lbmLbs,
    weight_lbs: profile.weightLbs,
    tdee: physio.tdee,
    phase: profile.goal,
    weeks_in_plan: weeksInPlan,
    scan_date: currentScan?.date ?? null,
  }

  /* ── 8. Macro targets (plan-ready) ──────────────────────────────────── */
  // Use recommendation output as the authoritative macro targets
  const macroTargets: MacroTargets = {
    calories:            recommendations.nutrition.calories,
    protein:             recommendations.nutrition.protein,
    carbs:               recommendations.nutrition.carbs,
    fat:                 recommendations.nutrition.fat,
    steps:               recommendations.recovery.steps,
    sleepHours:          recommendations.recovery.sleep_hours,
    waterLiters:         recommendations.recovery.water_liters,
    trainingDaysPerWeek: recommendations.training.days_per_week,
    cardioDays:          recommendations.training.cardio_days,
  }

  /* ── 9. Next actions priority list ──────────────────────────────────── */
  const nextActions = buildNextActions(diagnosis, recommendations, physio, feedback)

  /* ── 10. Assemble and validate ───────────────────────────────────────── */
  const rawOutput: EngineOutput = {
    current_state:   currentState,
    physio,
    diagnosis,
    recommendations,
    trajectory,
    feedback,
    next_actions:    nextActions,
    macro_targets:   macroTargets,
    start_bf:        startBF,
    target_bf:       targetBF,
  }

  const { output } = validateOutput(rawOutput)
  return output
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Next actions builder                                                       */
/* Produces an ordered list of the most important things to do right now.   */
/* ─────────────────────────────────────────────────────────────────────── */

function buildNextActions(
  diagnosis:       ReturnType<typeof runDiagnosis>,
  recommendations: ReturnType<typeof buildRecommendations>,
  physio:          ReturnType<typeof runCalculations>,
  feedback?:       ReturnType<typeof analyzeScanProgress>,
): NextAction[] {

  const actions: NextAction[] = []

  // Primary diagnosis action (always priority 1)
  if (!diagnosis.all_clear) {
    actions.push({
      priority: 1,
      label:    'Primary fix',
      value:    diagnosis.primary.recommended_action,
      reason:   diagnosis.primary.primary_issue,
    })
  }

  // Nutrition targets
  actions.push({
    priority: 2,
    label:    'Calorie target',
    value:    `${recommendations.nutrition.calories} kcal/day`,
    reason:   recommendations.nutrition.adjustment_reason,
  })

  actions.push({
    priority: 3,
    label:    'Protein target',
    value:    `${recommendations.nutrition.protein}g/day`,
    reason:   `${physio.lbmKg} kg lean mass × 2.2g = ${recommendations.nutrition.protein}g`,
  })

  // Training
  actions.push({
    priority: 4,
    label:    'Training',
    value:    `${recommendations.training.days_per_week} resistance + ${recommendations.training.cardio_days} cardio days/week`,
    reason:   recommendations.training.reasoning,
  })

  // Recovery
  actions.push({
    priority: 5,
    label:    'Sleep',
    value:    `${recommendations.recovery.sleep_hours} hours/night`,
    reason:   'Sleep is when muscle protein synthesis peaks',
  })

  actions.push({
    priority: 6,
    label:    'Daily steps',
    value:    `${recommendations.recovery.steps.toLocaleString()} steps/day`,
    reason:   'NEAT (non-exercise activity) contributes 10-30% of daily calorie burn',
  })

  // Feedback-specific action
  if (feedback && feedback.status !== 'on_track') {
    actions.push({
      priority: 1,  // demote existing priority 1 action implicitly — this is tied to feedback
      label:    'Adjustment from last scan',
      value:    feedback.recommendation_adjustment.reason,
      reason:   `Progress status: ${feedback.status.replace('_', ' ')}`,
    })
  }

  // Secondary diagnoses (max 2)
  diagnosis.secondary.slice(0, 2).forEach((flag, i) => {
    actions.push({
      priority: 7 + i,
      label:    `Additional issue`,
      value:    flag.recommended_action,
      reason:   flag.primary_issue,
    })
  })

  return actions.sort((a, b) => a.priority - b.priority)
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Prompt context builder for Claude                                          */
/* Converts engine output into a system prompt fragment that constrains     */
/* Claude to produce only narrative content, never overriding numbers.      */
/* ─────────────────────────────────────────────────────────────────────── */

export function buildClaudeContext(output: EngineOutput): string {
  const { current_state, physio, diagnosis, recommendations, trajectory, macro_targets } = output

  return `
PHYSIOLOGICAL CONTEXT (do not change these numbers — they are calculated from medical formulas):
- Weight: ${current_state.weight_lbs} lbs (${physio.weightKg} kg)
- Body Fat: ${current_state.body_fat_pct}%
- Lean Body Mass: ${current_state.lean_mass_lbs} lbs (${physio.lbmKg} kg)
- TDEE: ${physio.tdee} kcal/day (Mifflin-St Jeor × activity factor ${physio.activityMultiplier})
- Phase: ${current_state.phase}

EXACT DAILY TARGETS (these are the authoritative numbers — use them verbatim):
- Calories: ${macro_targets.calories} kcal
- Protein: ${macro_targets.protein}g
- Carbs: ${macro_targets.carbs}g
- Fat: ${macro_targets.fat}g
- Training: ${macro_targets.trainingDaysPerWeek} resistance + ${macro_targets.cardioDays} cardio days/week
- Sleep: ${macro_targets.sleepHours} hours
- Water: ${macro_targets.waterLiters}L
- Steps: ${macro_targets.steps}

PRIMARY DIAGNOSIS: ${diagnosis.primary.code}
"${diagnosis.primary.primary_issue}"
Recommended action: "${diagnosis.primary.recommended_action}"
${diagnosis.secondary.length > 0 ? `Secondary issues: ${diagnosis.secondary.map(s => s.primary_issue).join('; ')}` : ''}

TRAJECTORY:
- Timeline to goal: ${trajectory.timeline_weeks} weeks
- Target body fat: ${trajectory.target_bf}%
- Expected weekly change: ${trajectory.weekly_change} lbs
- Confidence: ${trajectory.confidence}

YOUR ROLE:
Generate only the narrative, mission, and motivational content.
Never change the numbers above. Never generate different macro targets.
Reference the diagnosis and trajectory in your explanations to make them specific and credible.
`.trim()
}

/* Re-export types for convenience */
export type { EngineInput, EngineOutput } from './types'
