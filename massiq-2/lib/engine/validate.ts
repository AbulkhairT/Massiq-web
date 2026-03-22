/* ─── MassIQ Intelligence Engine — Validation Layer ──────────────────────
   Input normalization and output constraint checking.
   All engine inputs pass through here before processing.
   All engine outputs pass through here before delivery.
────────────────────────────────────────────────────────────────────────── */

import type { EngineInput, EngineOutput, PhysioCalcs, UserProfile } from './types'

/* ─────────────────────────────────────────────────────────────────────── */
/* Input normalization                                                        */
/* Fills in missing fields with safe defaults so the engine never errors.   */
/* ─────────────────────────────────────────────────────────────────────── */

export function normalizeInput(raw: Partial<EngineInput> & { profile: Partial<UserProfile> }): EngineInput {
  const p = raw.profile

  // Height: accept either cm or in, compute missing one
  const heightCm = p.heightCm || (p.heightIn ? p.heightIn * 2.54 : 175)
  const heightIn = p.heightIn || heightCm / 2.54

  const profile: UserProfile = {
    name:       p.name       || 'User',
    age:        clampInt(p.age, 16, 80, 28),
    gender:     p.gender     || 'Male',
    weightLbs:  clampNum(p.weightLbs, 90, 450, 180),
    heightCm:   clampNum(heightCm, 140, 220, 175),
    heightIn:   clampNum(heightIn, 55, 87, 69),
    goal:       p.goal       || 'Cut',
    activity:   p.activity   || 'Moderate',
    dietPrefs:  Array.isArray(p.dietPrefs) ? p.dietPrefs : [],
    cuisines:   Array.isArray(p.cuisines)  ? p.cuisines  : [],
    avoid:      Array.isArray(p.avoid)     ? p.avoid     : [],
  }

  // Normalize scan history — ensure bodyFat is in realistic range
  const previousScans = (raw.previousScans || [])
    .filter(s => s && s.date && s.bodyFat >= 3 && s.bodyFat <= 55)
    .sort((a, b) => a.date.localeCompare(b.date))

  let currentScan = raw.currentScan
  if (currentScan && (currentScan.bodyFat < 3 || currentScan.bodyFat > 55)) {
    currentScan = undefined  // reject clearly invalid BF% readings
  }

  return {
    profile,
    currentScan,
    previousScans,
    recentLogs: raw.recentLogs || [],
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Output constraint validation                                               */
/* Checks that the engine's output doesn't violate physiological limits.     */
/* Returns the output (possibly corrected) and a list of violations.         */
/* ─────────────────────────────────────────────────────────────────────── */

export interface ValidationResult {
  valid:      boolean
  violations: string[]
  output:     EngineOutput
}

export function validateOutput(output: EngineOutput): ValidationResult {
  const violations: string[] = []
  const rec = output.recommendations.nutrition

  /* ── Caloric floor / ceiling ─────────────────────────────────────────── */
  const minCalories = Math.round(output.physio.tdee * 0.65)
  const maxCalories = Math.round(output.physio.tdee * 1.25)

  if (rec.calories < minCalories) {
    violations.push(`Calories ${rec.calories} below floor ${minCalories} (65% TDEE) — corrected`)
    output.recommendations.nutrition.calories = minCalories
  }
  if (rec.calories > maxCalories) {
    violations.push(`Calories ${rec.calories} above ceiling ${maxCalories} (125% TDEE) — corrected`)
    output.recommendations.nutrition.calories = maxCalories
  }

  /* ── Protein floor ───────────────────────────────────────────────────── */
  if (rec.protein < output.physio.minProteinG) {
    violations.push(`Protein ${rec.protein}g below minimum ${output.physio.minProteinG}g — corrected`)
    output.recommendations.nutrition.protein = output.physio.minProteinG
  }

  /* ── Fat floor ───────────────────────────────────────────────────────── */
  const fatFloor = Math.round(output.physio.weightKg * 0.8)
  if (rec.fat < fatFloor) {
    violations.push(`Fat ${rec.fat}g below minimum ${fatFloor}g — corrected`)
    output.recommendations.nutrition.fat = fatFloor
  }

  /* ── Trajectory sanity ───────────────────────────────────────────────── */
  if (output.trajectory.timeline_weeks < 0) {
    violations.push('Negative timeline — reset to 0')
    output.trajectory.timeline_weeks = 0
  }
  if (output.trajectory.timeline_weeks > 104) {
    violations.push('Timeline > 2 years — capped at 104 weeks')
    output.trajectory.timeline_weeks = 104
  }

  /* ── Body fat bounds ─────────────────────────────────────────────────── */
  if (output.current_state.body_fat_pct < 3 || output.current_state.body_fat_pct > 55) {
    violations.push(`Body fat ${output.current_state.body_fat_pct}% is physiologically impossible`)
  }

  /* ── macro_targets sync ─────────────────────────────────────────────── */
  // Sync macro_targets with recommendations (recs may have been adjusted)
  output.macro_targets.calories = output.recommendations.nutrition.calories
  output.macro_targets.protein  = output.recommendations.nutrition.protein
  output.macro_targets.carbs    = output.recommendations.nutrition.carbs
  output.macro_targets.fat      = output.recommendations.nutrition.fat

  return {
    valid:  violations.length === 0,
    violations,
    output,
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ─────────────────────────────────────────────────────────────────────── */

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (isNaN(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)))
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (isNaN(n) || n === 0) return fallback
  return Math.min(max, Math.max(min, n))
}
