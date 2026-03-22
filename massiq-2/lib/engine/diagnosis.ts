/* ─── MassIQ Intelligence Engine — Diagnosis Engine ──────────────────────
   Rule-based diagnostic system. Each rule is a pure function that returns
   a DiagnosisFlag or null. Rules are evaluated independently then ranked
   by severity. The highest-severity flag becomes the primary diagnosis.

   Thresholds are grounded in sports science literature:
   - Helms et al. (2014): protein minimums during caloric restriction
   - Hall et al. (2012): fat loss rate and muscle preservation
   - Trexler et al. (2014): metabolic adaptation thresholds
   - ACSM guidelines: training frequency by goal
────────────────────────────────────────────────────────────────────────── */

import type {
  PhysioCalcs, BodyScan, Goal, Gender,
  DiagnosisFlag, DiagnosisResult, DiagnosisCode,
  FeedbackResult,
} from './types'

/* ── Severity ranking (higher = worse) ────────────────────────────────── */
const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 }

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 1: Aggressive deficit                                               */
/* Triggered when the calculated deficit exceeds safe fat-loss thresholds. */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkAggressiveDeficit(physio: PhysioCalcs, goal: Goal): DiagnosisFlag | null {
  if (goal !== 'Cut' && goal !== 'Recomp') return null

  const deficitKcal      = Math.abs(physio.deficit)
  const deficitPctOfTDEE = deficitKcal / physio.tdee
  const weeklyLossRate   = physio.weeklyFatLossLbs / physio.weightKg * 2.205  // as % of BW

  // >20% deficit or >1% BW/week → aggressive territory
  if (deficitPctOfTDEE > 0.20 || weeklyLossRate > 1.0) {
    return {
      code:               'aggressive_deficit',
      severity:           'critical',
      primary_issue:      `Caloric deficit of ${deficitKcal} kcal (${Math.round(deficitPctOfTDEE * 100)}% of TDEE) exceeds safe fat-loss rate`,
      confidence:         'high',
      supporting_signals: [
        `Current deficit: ${deficitKcal} kcal/day`,
        `TDEE: ${physio.tdee} kcal`,
        `Expected loss: ${physio.weeklyFatLossLbs} lbs/week (> 1% BW threshold)`,
        `Lean mass is at risk above 1% BW/week fat loss`,
      ],
      recommended_action: `Reduce deficit to 15–18% of TDEE (${Math.round(physio.tdee * 0.15)}–${Math.round(physio.tdee * 0.18)} kcal cut)`,
    }
  }

  return null
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 2: Insufficient deficit (for cuts)                                 */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkInsufficientDeficit(physio: PhysioCalcs, goal: Goal): DiagnosisFlag | null {
  if (goal !== 'Cut') return null

  const deficitKcal    = Math.abs(physio.deficit)
  const minEffective   = 200   // kcal — below this, negligible fat loss

  if (deficitKcal < minEffective) {
    return {
      code:               'insufficient_deficit',
      severity:           'warning',
      primary_issue:      `Deficit of ${deficitKcal} kcal is too small to produce meaningful fat loss`,
      confidence:         'high',
      supporting_signals: [
        `Current deficit: ${deficitKcal} kcal/day`,
        `Minimum effective deficit: ${minEffective} kcal/day`,
        `Expected weekly loss at current deficit: ${physio.weeklyFatLossLbs} lbs`,
      ],
      recommended_action: `Increase deficit to at least 300 kcal/day — add 2–3 cardio sessions or reduce daily calories by ${300 - deficitKcal} kcal`,
    }
  }

  return null
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 3: Protein insufficiency                                            */
/* Triggered when protein is below the muscle-preservation floor.          */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkProteinInsufficiency(physio: PhysioCalcs, goal: Goal): DiagnosisFlag | null {
  // 1.6 g/kg LBM = ISSN minimum for muscle retention in a deficit
  const floor = physio.lbmKg * 1.6

  if (physio.targetProteinG < floor) {
    const gap = Math.round(floor - physio.targetProteinG)
    return {
      code:               'protein_insufficiency',
      severity:           'critical',
      primary_issue:      `Protein target (${physio.targetProteinG}g) is below muscle-preservation floor (${Math.round(floor)}g)`,
      confidence:         'high',
      supporting_signals: [
        `Current protein: ${physio.targetProteinG}g/day`,
        `Minimum safe protein: ${Math.round(floor)}g/day (1.6g/kg lean mass)`,
        `Lean body mass: ${physio.lbmKg} kg`,
        `Gap: ${gap}g short of minimum`,
      ],
      recommended_action: `Increase daily protein by ${gap}g — prioritise chicken, fish, Greek yogurt, cottage cheese`,
    }
  }

  return null
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 4: Phase mismatch                                                   */
/* Triggered when the user's goal conflicts with their current body state.  */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkPhaseMismatch(bfPct: number, gender: Gender, goal: Goal): DiagnosisFlag | null {
  // Body fat thresholds for phase suitability
  const limits = gender === 'Male'
    ? { cutFloor: 10, bulkCeiling: 20 }
    : { cutFloor: 17, bulkCeiling: 28 }

  if (goal === 'Cut' && bfPct <= limits.cutFloor) {
    return {
      code:               'phase_mismatch',
      severity:           'warning',
      primary_issue:      `Cutting at ${bfPct}% body fat risks hormonal disruption and lean mass loss`,
      confidence:         'high',
      supporting_signals: [
        `Current BF: ${bfPct}% — approaching essential fat minimum for ${gender}s (${limits.cutFloor}%)`,
        `Cutting below ${limits.cutFloor}% suppresses testosterone and thyroid function`,
        `Risk of strength loss and metabolic adaptation`,
      ],
      recommended_action: `Switch to Maintain or Recomp phase. Resume cutting only after 4–8 weeks at maintenance.`,
    }
  }

  if (goal === 'Bulk' && bfPct >= limits.bulkCeiling) {
    return {
      code:               'bulk_bf_too_high',
      severity:           'warning',
      primary_issue:      `Bulking at ${bfPct}% body fat will primarily add fat, not muscle`,
      confidence:         'high',
      supporting_signals: [
        `Current BF: ${bfPct}% — above the ${limits.bulkCeiling}% threshold where insulin sensitivity declines`,
        `Nutrient partitioning shifts toward fat storage above this BF%`,
        `New muscle gain efficiency is reduced`,
      ],
      recommended_action: `Cut to ${limits.bulkCeiling - 5}% first, then bulk. You'll gain more muscle and less fat at lower BF%.`,
    }
  }

  return null
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 5: Recovery deficit                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkRecoveryDeficit(sleepHoursTarget: number): DiagnosisFlag | null {
  if (sleepHoursTarget >= 7) return null

  return {
    code:               'recovery_deficit',
    severity:           'warning',
    primary_issue:      `Sleep target of ${sleepHoursTarget}h is below the minimum for muscle recovery`,
    confidence:         'medium',
    supporting_signals: [
      `<7 hours sleep increases cortisol by 15–20%, suppressing muscle protein synthesis`,
      `Growth hormone secretion (muscle repair) peaks in the first 3 hours of sleep`,
      `Sleep deprivation shifts body composition toward fat retention`,
    ],
    recommended_action: `Target 7.5–9 hours sleep. Sleep is when muscle is built — it's not optional.`,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 6: Training volume mismatch                                         */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkTrainingVolumeMismatch(trainingDaysPerWeek: number, goal: Goal): DiagnosisFlag | null {
  const minimums: Record<Goal, number> = {
    Cut:      3,   // minimum to maintain muscle in a deficit
    Bulk:     4,   // minimum to stimulate hypertrophy
    Recomp:   4,   // needs sufficient stimulus for recomp to work
    Maintain: 2,   // general health minimum
  }

  const minimum = minimums[goal]
  if (trainingDaysPerWeek >= minimum) return null

  return {
    code:               'training_volume_mismatch',
    severity:           'warning',
    primary_issue:      `${trainingDaysPerWeek} training days/week is insufficient for ${goal} phase goals`,
    confidence:         'medium',
    supporting_signals: [
      `${goal} requires minimum ${minimum} resistance sessions/week`,
      `Current: ${trainingDaysPerWeek} days — ${minimum - trainingDaysPerWeek} short`,
      goal === 'Cut'
        ? 'Too little training in a deficit accelerates muscle loss'
        : 'Insufficient volume to drive meaningful adaptation',
    ],
    recommended_action: `Increase to ${minimum} training days/week. Add ${minimum - trainingDaysPerWeek} session(s) focused on compound lifts.`,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 7: Feedback-based muscle loss detection                             */
/* Requires multi-scan data (from feedback.ts).                             */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkMuscleLossFromFeedback(feedback: FeedbackResult | undefined): DiagnosisFlag | null {
  if (!feedback) return null
  if (!feedback.muscle_loss_detected) return null

  const lmLoss = Math.abs(feedback.actual_lm_change)

  return {
    code:               'muscle_loss_risk',
    severity:           'critical',
    primary_issue:      `Lean mass decreased by ${lmLoss.toFixed(1)} lbs since last scan — active muscle loss in progress`,
    confidence:         feedback.days_elapsed > 21 ? 'high' : 'medium',
    supporting_signals: [
      `Lean mass change: ${feedback.actual_lm_change.toFixed(1)} lbs (${feedback.days_elapsed} days)`,
      `Body fat change: ${feedback.actual_bf_change.toFixed(1)}%`,
      `Fat loss rate: ${feedback.fat_loss_rate.toFixed(2)} lbs/week`,
      feedback.fat_loss_rate > 1.0
        ? 'Rate exceeds 1 lb/week — deficit is likely too aggressive'
        : 'Protein may be insufficient to protect muscle at this deficit',
    ],
    recommended_action: `Reduce deficit by 150–200 kcal and increase protein by 20–30g/day immediately.`,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Rule 8: Stalled progress (feedback)                                      */
/* ─────────────────────────────────────────────────────────────────────── */

export function checkStalledProgress(feedback: FeedbackResult | undefined, goal: Goal): DiagnosisFlag | null {
  if (!feedback || goal !== 'Cut') return null

  // Stalled = lost less than 30% of expected fat in the period
  if (feedback.status !== 'stalled') return null

  return {
    code:               'stalled_progress',
    severity:           'warning',
    primary_issue:      `Progress has stalled — only ${Math.abs(feedback.variance_pct).toFixed(0)}% of expected fat loss achieved`,
    confidence:         feedback.days_elapsed > 21 ? 'high' : 'medium',
    supporting_signals: [
      `Expected BF change: ${feedback.expected_bf_change.toFixed(1)}%`,
      `Actual BF change: ${feedback.actual_bf_change.toFixed(1)}%`,
      `Variance: ${feedback.variance_pct.toFixed(0)}% below target`,
      'Possible causes: metabolic adaptation, underreported intake, insufficient NEAT',
    ],
    recommended_action: `Increase daily calorie deficit by 150 kcal OR add one 30-minute cardio session per week.`,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Master diagnosis runner                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

export function runDiagnosis(
  physio: PhysioCalcs,
  profile: { goal: Goal; gender: Gender },
  targets: { sleepHours: number; trainingDaysPerWeek: number },
  feedback?: FeedbackResult,
): DiagnosisResult {

  const flags: DiagnosisFlag[] = [
    checkAggressiveDeficit(physio, profile.goal),
    checkInsufficientDeficit(physio, profile.goal),
    checkProteinInsufficiency(physio, profile.goal),
    checkPhaseMismatch(physio.bfPct, profile.gender, profile.goal),
    checkRecoveryDeficit(targets.sleepHours),
    checkTrainingVolumeMismatch(targets.trainingDaysPerWeek, profile.goal),
    checkMuscleLossFromFeedback(feedback),
    checkStalledProgress(feedback, profile.goal),
  ].filter((f): f is DiagnosisFlag => f !== null)

  if (flags.length === 0) {
    // All clear — return a positive info flag
    const primary: DiagnosisFlag = {
      code:               'on_track',
      severity:           'info',
      primary_issue:      'All key metrics are within optimal ranges',
      confidence:         'high',
      supporting_signals: [
        `Deficit: ${Math.abs(physio.deficit)} kcal/day (within safe range)`,
        `Protein: ${physio.targetProteinG}g/day (above minimum ${physio.minProteinG}g)`,
        `Phase aligned with body composition`,
      ],
      recommended_action: 'Maintain current approach. Scan again in 4 weeks to confirm trajectory.',
    }
    return { primary, secondary: [], all_clear: true }
  }

  // Sort by severity, then by specificity (feedback-based flags are more specific)
  const sorted = flags.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severityDiff !== 0) return severityDiff
    // Prefer feedback-based flags (more data = more confidence)
    if (b.confidence === 'high' && a.confidence !== 'high') return 1
    return 0
  })

  return {
    primary:   sorted[0],
    secondary: sorted.slice(1),
    all_clear: false,
  }
}
