/* ─── MassIQ Intelligence Engine — Recommendation Engine ─────────────────
   Converts a diagnosis + physio data into concrete, numerically-specific
   recommendations. Every recommendation traces back to a diagnosis code.

   Design principle: recommendations are ADJUSTMENTS from the baseline
   physio calculations, not independent outputs. The engine calculates the
   baseline; the recommendation engine nudges from there based on diagnosis.
────────────────────────────────────────────────────────────────────────── */

import type {
  PhysioCalcs, DiagnosisResult, DiagnosisCode, Goal, Gender,
  NutritionRec, TrainingRec, RecoveryRec, RecommendationResult,
  FeedbackResult,
} from './types'
import { clamp, round5, trainingDays, defaultTargetBF } from './calculator'

/* ─────────────────────────────────────────────────────────────────────── */
/* Nutrition recommendation                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

function buildNutrition(
  physio:    PhysioCalcs,
  primary:   DiagnosisCode,
  goal:      Goal,
  feedback?: FeedbackResult,
): NutritionRec {

  let calories = physio.targetCalories
  let protein  = physio.targetProteinG
  let reason   = `Baseline ${goal} targets from TDEE calculation`

  /* Diagnosis-specific adjustments */
  switch (primary) {

    case 'aggressive_deficit': {
      // Pull deficit back to 15% of TDEE — safer rate
      const saferDeficit = Math.round(physio.tdee * 0.15)
      calories = physio.tdee - saferDeficit
      reason   = `Deficit reduced from ${Math.abs(physio.deficit)} to ${saferDeficit} kcal — rate was exceeding safe fat-loss threshold`
      break
    }

    case 'muscle_loss_risk': {
      // Reduce deficit by 150–200 kcal AND increase protein
      calories = physio.targetCalories + 175
      protein  = round5(physio.lbmKg * 2.4)  // push to upper protein bound
      reason   = `Deficit reduced 175 kcal and protein raised to ${protein}g — active lean mass loss detected`
      break
    }

    case 'protein_insufficiency': {
      // Keep calories, fix protein — add calories from protein at cost of carbs
      protein = round5(physio.lbmKg * 2.2)
      reason  = `Protein corrected to ${protein}g (2.2g/kg lean mass) — was below muscle-preservation floor`
      break
    }

    case 'stalled_progress': {
      // Tighten deficit by 150 kcal
      calories = physio.targetCalories - 150
      reason   = `Deficit increased by 150 kcal — progress stalled at current targets`
      break
    }

    case 'bulk_bf_too_high': {
      // Switch to slight deficit to bring BF down first
      calories = physio.tdee - 250
      reason   = `Shifted to moderate deficit (250 kcal) — BF too high to bulk efficiently`
      break
    }

    case 'phase_mismatch': {
      // Maintenance calories — stop the cut
      calories = physio.tdee
      reason   = `Reset to maintenance — cutting below safe BF floor risks hormonal damage`
      break
    }

    case 'insufficient_deficit': {
      // Increase deficit to productive level
      const targetDeficit = Math.round(physio.tdee * 0.15)
      calories = physio.tdee - targetDeficit
      reason   = `Deficit increased to ${targetDeficit} kcal — previous deficit was below effective threshold`
      break
    }

    case 'on_track':
    default: {
      // No adjustment — keep baseline
      break
    }
  }

  // Apply feedback adjustment on top of diagnosis adjustment (if available)
  if (feedback && primary === 'on_track') {
    calories += feedback.recommendation_adjustment.calorie_delta
    protein  += feedback.recommendation_adjustment.protein_delta
    if (feedback.recommendation_adjustment.calorie_delta !== 0) {
      reason = feedback.recommendation_adjustment.reason
    }
  }

  // Hard physiological caps — never cross these
  const minCalories = Math.round(physio.tdee * 0.70)   // never below 70% TDEE
  const maxCalories = Math.round(physio.tdee * 1.20)   // never above 120% TDEE
  calories = clamp(calories, minCalories, maxCalories)
  protein  = clamp(protein, physio.minProteinG, round5(physio.lbmKg * 2.8))  // cap at 2.8g/kg LBM

  // Recalculate fat/carbs from adjusted calories + protein
  const fat   = round5(clamp(Math.round((calories * 0.25) / 9), Math.round(physio.weightKg * 0.8), 150))
  const carbs = round5(Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4)))

  return {
    calories: Math.round(calories),
    protein,
    fat,
    carbs,
    adjustment_kcal: Math.round(calories - physio.tdee),
    adjustment_reason: reason,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Training recommendation                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

function buildTraining(
  physio:  PhysioCalcs,
  primary: DiagnosisCode,
  goal:    Goal,
): TrainingRec {

  const td = trainingDays(goal)
  let resistanceDays = td.resistance
  let cardioDays     = td.cardio

  // Focus areas by goal
  const focusByGoal: Record<Goal, { primary: string; secondary: string }> = {
    Cut:      { primary: 'Compound lifts (preserve muscle)', secondary: 'Cardio (LISS or HIIT)' },
    Bulk:     { primary: 'Progressive overload (hypertrophy)', secondary: 'Compound movements' },
    Recomp:   { primary: 'Resistance training (full body)', secondary: 'Moderate cardio' },
    Maintain: { primary: 'Full body strength', secondary: 'Cardiovascular health' },
  }

  let focus = focusByGoal[goal]
  let reasoning = `${resistanceDays} resistance + ${cardioDays} cardio per week optimised for ${goal} phase`

  // Diagnosis-specific overrides
  if (primary === 'muscle_loss_risk') {
    cardioDays    = Math.max(1, cardioDays - 1)  // reduce cardio stress
    reasoning     = 'Cardio reduced by 1 day — prioritise muscle retention over extra calorie burn'
    focus.primary = 'Heavy compound lifts (squat, deadlift, bench, row) to signal muscle retention'
  }

  if (primary === 'training_volume_mismatch') {
    resistanceDays = td.resistance  // enforce minimum
    reasoning      = `Resistance days increased to ${resistanceDays} — minimum required for ${goal} goals`
  }

  if (primary === 'recovery_deficit') {
    cardioDays = Math.max(1, cardioDays - 1)
    reasoning  = 'Cardio volume reduced — recovery is currently limiting adaptation'
  }

  return {
    days_per_week:   resistanceDays,
    cardio_days:     cardioDays,
    primary_focus:   focus.primary,
    secondary_focus: focus.secondary,
    reasoning,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Recovery recommendation                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

function buildRecovery(physio: PhysioCalcs, primary: DiagnosisCode): RecoveryRec {
  let sleepHours  = 8
  let waterLiters = Math.round(physio.weightKg * 0.033 * 10) / 10
  let steps       = 9000
  let reasoning   = 'Standard recovery targets for physique training'

  if (primary === 'recovery_deficit') {
    sleepHours = 8.5
    reasoning  = 'Sleep increased to 8.5h — growth hormone release is impaired below 7.5h'
  }

  if (primary === 'aggressive_deficit' || primary === 'muscle_loss_risk') {
    sleepHours = 8.5
    steps      = 8000   // reduce NEAT slightly to protect the smaller deficit
    reasoning  = 'Sleep increased, step target moderated — reducing total energy expenditure to protect lean mass'
  }

  if (primary === 'stalled_progress') {
    steps     = 11000   // increase NEAT
    reasoning = 'Step target raised — increasing NEAT is the lowest-risk way to widen deficit'
  }

  return { sleep_hours: sleepHours, water_liters: waterLiters, steps, reasoning }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Master recommendation builder                                             */
/* ─────────────────────────────────────────────────────────────────────── */

export function buildRecommendations(
  physio:   PhysioCalcs,
  diagnosis: DiagnosisResult,
  profile:  { goal: Goal; gender: Gender },
  feedback?: FeedbackResult,
): RecommendationResult {

  const primaryCode = diagnosis.primary.code

  return {
    nutrition:         buildNutrition(physio, primaryCode, profile.goal, feedback),
    training:          buildTraining(physio, primaryCode, profile.goal),
    recovery:          buildRecovery(physio, primaryCode),
    tied_to_diagnosis: primaryCode,
  }
}
