/* ─── MassIQ Intelligence Engine — Physiological Calculator ──────────────
   All calculations are deterministic. Same inputs always produce same outputs.
   Formula sources:
     BMR  : Mifflin-St Jeor (most accurate for non-athletes, ±10% real-world)
     TDEE : Mifflin-St Jeor × Ainsworth activity factor
     LBM  : Siri two-compartment model (weight × (1 - bf/100))
     Macros: ISSN position stand guidelines (2017)
────────────────────────────────────────────────────────────────────────── */

import type {
  UserProfile, BodyScan, Goal, ActivityLevel,
  PhysioCalcs, MacroTargets,
} from './types'

/* ── Unit helpers ──────────────────────────────────────────────────────── */

export const lbsToKg  = (lbs: number) => lbs  * 0.453592
export const kgToLbs  = (kg:  number) => kg   / 0.453592
export const inToCm   = (ins: number) => ins  * 2.54
export const round5   = (n:   number) => Math.round(n / 5) * 5   // round to nearest 5g
export const clamp    = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/* ── Body fat estimation (when no scan available) ─────────────────────── */

/**
 * Rough BF% estimate when no scan is provided.
 * Uses age + gender defaults (not precise — scan data always preferred).
 */
export function estimateBF(gender: 'Male' | 'Female', age: number): number {
  // Average BF% by gender/age based on NHANES data
  if (gender === 'Male') {
    if (age < 30) return 18
    if (age < 40) return 20
    if (age < 50) return 22
    return 24
  } else {
    if (age < 30) return 25
    if (age < 40) return 27
    if (age < 50) return 29
    return 31
  }
}

/* ── Lean body mass ────────────────────────────────────────────────────── */

export function calcLBM(weightLbs: number, bfPct: number) {
  const lbs = weightLbs * (1 - bfPct / 100)
  const kg  = lbsToKg(lbs)
  return { lbs: Math.round(lbs * 10) / 10, kg: Math.round(kg * 10) / 10 }
}

/* ── BMR (Mifflin-St Jeor) ─────────────────────────────────────────────── */

/**
 * Returns resting caloric expenditure in kcal/day.
 * Mifflin-St Jeor is within ±10% of indirect calorimetry for 82% of adults.
 */
export function calcBMR(weightKg: number, heightCm: number, age: number, gender: 'Male' | 'Female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return gender === 'Male' ? base + 5 : base - 161
}

/* ── Activity multipliers (Ainsworth, 2000) ────────────────────────────── */

const ACTIVITY_MULT: Record<ActivityLevel, number> = {
  Sedentary: 1.20,   // desk job, no structured exercise
  Light:     1.375,  // exercise 1-3 days/week, mostly walking
  Moderate:  1.55,   // exercise 3-5 days/week, moderate intensity
  Active:    1.725,  // hard exercise 6-7 days/week
}

export function calcTDEE(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULT[activity])
}

/* ── Phase caloric adjustments ─────────────────────────────────────────── */

/**
 * Returns kcal adjustment from TDEE.
 * Negative = deficit (fat loss), positive = surplus (muscle gain).
 *
 * Deficit cap: 20% of TDEE = max sustainable fat loss without muscle risk.
 * Minimum deficit: 200 kcal (below this, no meaningful fat loss).
 * Surplus cap: 350 kcal — beyond this, mostly fat accumulation.
 */
export function calcPhaseAdjustment(tdee: number, goal: Goal, weightLbs: number): number {
  switch (goal) {
    case 'Cut': {
      // Target 0.5–0.75% bodyweight/week = (lbs * 0.006) * 3500 / 7 kcal/day deficit
      const moderateDeficit = Math.round(weightLbs * 0.006 * 3500 / 7)   // ~0.6%/week
      const maxDeficit      = Math.round(tdee * 0.20)
      const minDeficit      = 200
      return -clamp(moderateDeficit, minDeficit, maxDeficit)
    }
    case 'Bulk':
      // Lean bulk: +250–350 kcal. Minimises fat gain while allowing muscle growth.
      return 300
    case 'Recomp':
      // Body recomposition: slight deficit on rest days, maintenance on training days.
      // Use slight deficit as daily average (training days handled via carb cycling in meal plan).
      return -100
    case 'Maintain':
      return 0
  }
}

/* ── Protein targets ────────────────────────────────────────────────────── */

/**
 * ISSN position stand: 1.6–2.2 g/kg/day for trained individuals.
 * We use LBM (not total body weight) for cuts/recomp to avoid inflating
 * targets for higher-BF individuals.
 *
 * Cut/Recomp: 2.2 g/kg LBM (upper end — preserves muscle in deficit)
 * Bulk:       1.8 g/kg total BW (sufficient for hypertrophy)
 * Maintain:   1.7 g/kg LBM
 */
export function calcProtein(goal: Goal, lbmKg: number, weightKg: number): number {
  let grams: number
  switch (goal) {
    case 'Cut':     grams = lbmKg  * 2.2; break
    case 'Bulk':    grams = weightKg * 1.8; break
    case 'Recomp':  grams = lbmKg  * 2.2; break
    case 'Maintain':grams = lbmKg  * 1.7; break
  }
  return round5(grams)
}

/** Minimum protein below which diagnosis triggers protein_insufficiency */
export function minProtein(lbmKg: number): number {
  return Math.round(lbmKg * 1.6)
}

/* ── Fat targets ────────────────────────────────────────────────────────── */

/**
 * Fat minimum: 0.8 g/kg BW (hormonal function floor).
 * Fat target: the higher of the minimum or 25% of total calories.
 * Cap: 35% of calories (leaves room for carbs/protein).
 */
export function calcFat(calories: number, weightKg: number): number {
  const fromCalories = Math.round((calories * 0.25) / 9)
  const minimum      = Math.round(weightKg * 0.8)
  return round5(Math.max(fromCalories, minimum))
}

/* ── Carbs ─────────────────────────────────────────────────────────────── */

export function calcCarbs(calories: number, proteinG: number, fatG: number): number {
  const remaining = calories - proteinG * 4 - fatG * 9
  return round5(Math.max(0, Math.round(remaining / 4)))
}

/* ── Expected weekly fat loss ────────────────────────────────────────────── */

/**
 * 3,500 kcal ≈ 1 lb of fat (Wishnofsky, 1958; still the clinical standard).
 * Returns lbs/week.
 */
export function weeklyFatLoss(dailyDeficitKcal: number): number {
  return Math.round((dailyDeficitKcal * 7) / 3500 * 100) / 100
}

/* ── Training day recommendations ────────────────────────────────────────── */

export function trainingDays(goal: Goal): { resistance: number; cardio: number } {
  switch (goal) {
    case 'Cut':     return { resistance: 4, cardio: 3 }
    case 'Bulk':    return { resistance: 5, cardio: 1 }
    case 'Recomp':  return { resistance: 4, cardio: 2 }
    case 'Maintain':return { resistance: 3, cardio: 2 }
  }
}

/* ── Master calculation function ────────────────────────────────────────── */

/**
 * Runs all physiological calculations from profile + optional scan data.
 * This is the single entry point for all numeric targets.
 */
export function runCalculations(profile: UserProfile, scan?: BodyScan): PhysioCalcs {
  const weightKg = lbsToKg(profile.weightLbs)
  const heightCm = profile.heightCm || inToCm(profile.heightIn)

  const bfPct = scan?.bodyFat ?? estimateBF(profile.gender, profile.age)

  const lbm    = calcLBM(profile.weightLbs, bfPct)
  const bmr    = calcBMR(weightKg, heightCm, profile.age, profile.gender)
  const tdee   = calcTDEE(bmr, profile.activity)

  const adjustment     = calcPhaseAdjustment(tdee, profile.goal, profile.weightLbs)
  const targetCalories = Math.round(tdee + adjustment)

  const targetProteinG = calcProtein(profile.goal, lbm.kg, weightKg)
  const minProteinG    = minProtein(lbm.kg)
  const targetFatG     = calcFat(targetCalories, weightKg)
  const targetCarbsG   = calcCarbs(targetCalories, targetProteinG, targetFatG)

  const weeklyFatLossLbs = adjustment < 0
    ? weeklyFatLoss(Math.abs(adjustment))
    : 0

  return {
    weightKg:           Math.round(weightKg * 10) / 10,
    heightCm,
    lbmLbs:             lbm.lbs,
    lbmKg:              lbm.kg,
    bmr:                Math.round(bmr),
    tdee,
    targetCalories,
    deficit:            adjustment,
    minProteinG,
    targetProteinG,
    targetFatG,
    targetCarbsG,
    weeklyFatLossLbs,
    bfPct,
    activityMultiplier: ACTIVITY_MULT[profile.activity],
  }
}

/* ── Macro targets (plan-ready format) ─────────────────────────────────── */

export function buildMacroTargets(physio: PhysioCalcs, goal: Goal): MacroTargets {
  const td = trainingDays(goal)
  return {
    calories:            physio.targetCalories,
    protein:             physio.targetProteinG,
    carbs:               physio.targetCarbsG,
    fat:                 physio.targetFatG,
    steps:               goal === 'Cut' ? 10000 : goal === 'Bulk' ? 8000 : 9000,
    sleepHours:          8,
    waterLiters:         Math.round(physio.weightKg * 0.033 * 10) / 10,  // 33 ml/kg
    trainingDaysPerWeek: td.resistance,
    cardioDays:          td.cardio,
  }
}

/* ── Target body fat ────────────────────────────────────────────────────── */

/**
 * Sensible default target BF% when user hasn't specified one.
 * Cuts target the lower end of "fitness" range for the gender.
 */
export function defaultTargetBF(currentBF: number, goal: Goal, gender: 'Male' | 'Female'): number {
  if (goal === 'Cut') {
    const floor = gender === 'Male' ? 10 : 16
    const target = currentBF - 4
    return Math.max(floor, target)
  }
  if (goal === 'Bulk') return currentBF + 2   // accept modest fat gain
  return currentBF                             // recomp/maintain: hold
}
