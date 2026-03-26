type AnyObj = Record<string, any>

function toInt(v: any, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

function midpoint(low: number | null, high: number | null, fallback = 0): number {
  if (low == null && high == null) return fallback
  if (low == null) return high as number
  if (high == null) return low
  return Math.round((low + high) / 2)
}

export function extractFoodSignals(payload: AnyObj): AnyObj {
  const identified = Array.isArray(payload?.food_items)
    ? payload.food_items.map((x: any) => (typeof x?.name === 'string' ? x.name : 'unknown')).slice(0, 8)
    : []
  const calories = Number(payload?.calories)
  const protein = Number(payload?.protein_g ?? payload?.protein)
  const carbs = Number(payload?.carbs_g ?? payload?.carbs)
  const fat = Number(payload?.fat_g ?? payload?.fat)

  const confidenceScore = Number(payload?.confidence_score ?? payload?.confidenceScore ?? 0.62)
  const ambiguityFlags = []
  if (!Number.isFinite(calories)) ambiguityFlags.push('missing_calories')
  if (!Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) ambiguityFlags.push('missing_macros')
  if (String(payload?.notes || '').toLowerCase().includes('sauce')) ambiguityFlags.push('sauce_uncertainty')
  if (String(payload?.notes || '').toLowerCase().includes('oil')) ambiguityFlags.push('oil_uncertainty')

  const widen = ambiguityFlags.length > 0 ? 0.18 : 0.1
  const calLow = Number.isFinite(calories) ? Math.max(0, Math.round(calories * (1 - widen))) : null
  const calHigh = Number.isFinite(calories) ? Math.max(0, Math.round(calories * (1 + widen))) : null
  const pLow = Number.isFinite(protein) ? Math.max(0, Math.round(protein * (1 - widen))) : null
  const pHigh = Number.isFinite(protein) ? Math.max(0, Math.round(protein * (1 + widen))) : null
  const cLow = Number.isFinite(carbs) ? Math.max(0, Math.round(carbs * (1 - widen))) : null
  const cHigh = Number.isFinite(carbs) ? Math.max(0, Math.round(carbs * (1 + widen))) : null
  const fLow = Number.isFinite(fat) ? Math.max(0, Math.round(fat * (1 - widen))) : null
  const fHigh = Number.isFinite(fat) ? Math.max(0, Math.round(fat * (1 + widen))) : null

  const confidence = Math.max(0, Math.min(1, Number.isFinite(confidenceScore) ? confidenceScore : 0.62))
  const confidenceLabel = confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low'

  const out = {
    identified_items: identified,
    canonical_matches: identified,
    portion_estimates: Array.isArray(payload?.portion_estimates) ? payload.portion_estimates : [],
    estimated_calories_low: calLow,
    estimated_calories_high: calHigh,
    estimated_protein_low: pLow,
    estimated_protein_high: pHigh,
    estimated_carbs_low: cLow,
    estimated_carbs_high: cHigh,
    estimated_fat_low: fLow,
    estimated_fat_high: fHigh,
    ambiguity_flags: ambiguityFlags,
    confidence_label: confidenceLabel,
    confidence_score: Number(confidence.toFixed(3)),
    signal_payload: payload || {},
  }

  console.info('[food-signals] extracted', {
    identified_items: out.identified_items,
    confidence_label: out.confidence_label,
    ambiguity_flags: out.ambiguity_flags,
  })
  return out
}

export function summarizeFoodSignals(foodSignals: AnyObj): AnyObj {
  const summary = {
    calories: midpoint(foodSignals?.estimated_calories_low ?? null, foodSignals?.estimated_calories_high ?? null, 0),
    protein_g: midpoint(foodSignals?.estimated_protein_low ?? null, foodSignals?.estimated_protein_high ?? null, 0),
    carbs_g: midpoint(foodSignals?.estimated_carbs_low ?? null, foodSignals?.estimated_carbs_high ?? null, 0),
    fat_g: midpoint(foodSignals?.estimated_fat_low ?? null, foodSignals?.estimated_fat_high ?? null, 0),
    confidence_label: foodSignals?.confidence_label || 'medium',
    ambiguity_flags: Array.isArray(foodSignals?.ambiguity_flags) ? foodSignals.ambiguity_flags : [],
    canonical_items: Array.isArray(foodSignals?.canonical_matches) ? foodSignals.canonical_matches : [],
  }
  console.info('[food-signals] summarized', {
    calories: summary.calories,
    protein_g: summary.protein_g,
    confidence_label: summary.confidence_label,
  })
  return summary
}

export function buildFoodTrendSummary(rows: AnyObj[]): AnyObj {
  const valid = Array.isArray(rows) ? rows : []
  if (valid.length === 0) return { avgCalories: null, avgProtein: null, adherenceContext: {} }
  const calories = valid.map((r) => toInt(r.calories, 0))
  const proteins = valid.map((r) => toInt(r.protein_g, 0))
  return {
    avgCalories: Math.round(calories.reduce((a, b) => a + b, 0) / Math.max(1, calories.length)),
    avgProtein: Math.round(proteins.reduce((a, b) => a + b, 0) / Math.max(1, proteins.length)),
    adherenceContext: {
      skipped_meals_per_week_estimate: Math.max(0, 21 - valid.length),
    },
  }
}
