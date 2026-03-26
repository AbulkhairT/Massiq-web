/**
 * Derive AdherenceContext from Supabase `food_logs` rows + local scan cadence.
 * Heuristic only — used by personalizationEngine (deterministic).
 */

import type { AdherenceContext } from './decisionTypes'

export type FoodLogRow = {
  calories?: number | null
  protein_g?: number | null
  created_at?: string | null
}

function parseTime(iso: string | null | undefined): number {
  if (!iso) return NaN
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : NaN
}

/**
 * @param rows — newest first (from REST order=created_at.desc)
 * @param scanHistory — optional local/DB scan entries with `date` for consistency score
 */
export function buildAdherenceContextFromFoodLogs(
  rows: FoodLogRow[],
  options: { scanHistory?: Array<{ date?: string }> } = {},
): AdherenceContext {
  const now = Date.now()
  const ms7 = 7 * 86400000
  const ms14 = 14 * 86400000

  const in7 = rows.filter((r) => {
    const t = parseTime(r.created_at ?? null)
    return Number.isFinite(t) && now - t <= ms7
  })
  const in14 = rows.filter((r) => {
    const t = parseTime(r.created_at ?? null)
    return Number.isFinite(t) && now - t <= ms14
  })

  /** ~3 meals/day target → cap expected at 21 */
  const mealCount7 = in7.length
  const skipped_meals_per_week_estimate = Math.min(21, Math.max(0, 21 - mealCount7))

  let weekendCals = 0
  let weekendN = 0
  let weekdayCals = 0
  let weekdayN = 0
  for (const r of in14) {
    const t = parseTime(r.created_at ?? null)
    if (!Number.isFinite(t)) continue
    const dow = new Date(t).getDay()
    const c = Number(r.calories) || 0
    if (dow === 0 || dow === 6) {
      weekendCals += c
      weekendN += 1
    } else {
      weekdayCals += c
      weekdayN += 1
    }
  }
  const wEndAvg = weekendN > 0 ? weekendCals / weekendN : 0
  const wDayAvg = weekdayN > 0 ? weekdayCals / weekdayN : 0
  let weekend_slip_score = 0
  if (wDayAvg > 0 && wEndAvg > wDayAvg * 1.2) {
    weekend_slip_score = Math.min(1, (wEndAvg / wDayAvg - 1) / 0.6)
  }

  let proteinSum = 0
  let calSum = 0
  for (const r of in7) {
    proteinSum += Number(r.protein_g) || 0
    calSum += Number(r.calories) || 0
  }
  const pRatio = calSum > 50 ? proteinSum / calSum : 0
  const late_night_cravings = pRatio > 0 && pRatio < 0.06 && mealCount7 >= 3

  const meal_boredom = mealCount7 >= 10 && in7.length < 8

  const scans = options.scanHistory || []
  const scanDates = scans
    .map((s) => (s.date ? String(s.date).slice(0, 10) : null))
    .filter(Boolean) as string[]
  const uniqueWeeks = new Set(scanDates.map((d) => d.slice(0, 7))).size
  const scan_consistency_score = scanDates.length >= 2 ? Math.min(1, uniqueWeeks / Math.max(1, scanDates.length)) : 0.5

  const hunger_score = skipped_meals_per_week_estimate > 8 ? 0.7 : weekend_slip_score > 0.45 ? 0.55 : 0.25

  return {
    skipped_meals_per_week_estimate,
    weekend_slip_score,
    late_night_cravings,
    meal_boredom,
    scan_consistency_score,
    hunger_score,
  }
}
