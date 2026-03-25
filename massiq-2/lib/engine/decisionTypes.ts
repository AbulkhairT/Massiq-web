/**
 * MassIQ personalization — strict decision schema (deterministic engine output).
 * LLM may add narrative elsewhere; this object is the source of truth for generators.
 */

export type PhaseLabel = 'Cut' | 'Bulk' | 'Recomp' | 'Maintain'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type DeficitAggressiveness = 'mild' | 'moderate' | 'aggressive'

export type CarbTiming = 'around_training' | 'even' | 'front_loaded'

export type ProteinDistribution = 'even' | 'peri_workout_heavy'

/** Optional client / analytics adherence signals (food logs, self-report). */
export interface AdherenceContext {
  skipped_meals_per_week_estimate?: number
  weekend_slip_score?: number
  late_night_cravings?: boolean
  meal_boredom?: boolean
  scan_consistency_score?: number
  hunger_score?: number
  energy_score?: number
}

export interface PhaseDecision {
  recommended_phase: PhaseLabel | string
  confidence: ConfidenceLevel
  reason: string
  /** Alias of `reason` for legacy readers */
  rationale?: string
  previous_phase?: string | null
}

export interface BodyState {
  body_fat_pct: number | null
  target_body_fat_pct: number | null
  lean_mass_trend: 'gaining' | 'losing' | 'stable' | 'unknown'
  bf_vs_target: 'far_above' | 'above' | 'near' | 'at_or_below' | 'unknown'
  symmetry_flag: 'asymmetry' | 'balanced' | 'unknown'
  upper_lower_balance?: 'upper_lagging' | 'lower_lagging' | 'balanced' | null
}

/** Nutrition block — includes legacy keys consumed by MassIQ + meal generator. */
export interface NutritionAdjustments {
  daily_calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  calories_delta: number
  protein_delta_g: number
  carbs_delta_g: number
  fat_delta_g: number
  deficit_aggressiveness: DeficitAggressiveness
  carb_timing: CarbTiming
  protein_distribution: ProteinDistribution
  satiety_focus: boolean
  /** Legacy: drives MealPlanDirectives.simplifyRepeat */
  simplify_meals: boolean
  /** Legacy: extra carbs on training days */
  carb_training_emphasis: boolean
  vegetarian_protein_optimize: boolean
  directives: string[]
}

export interface TrainingAdjustments {
  priority_muscles: string[]
  priority_muscles_high: string[]
  priority_muscles_medium: string[]
  weekly_set_targets: Record<string, number>
  frequency_targets: Record<string, number>
  exercise_emphasis: string[]
  recovery_notes: string
  volume_delta_sets: number
  cardio_delta: number
  unilateral: boolean
  move_priority_muscles_early_in_week: boolean
  reduce_junk_volume: boolean
}

export interface BehaviorFocus {
  adherence_risks: string[]
  habit_interventions: string[]
  /** Flat list for logs / simple UI */
  tags: string[]
}

export interface Projection {
  next_checkpoint_weeks: number
  weeks_to_target_bf: number | null
  summary: string
}

/** Mirrors `computeAdaptation` return shape (adaptation.js). */
export interface AdaptationLegacy {
  decision: string
  rationale: string
  adjustment?: { calories_delta?: number; protein_delta_g?: number; fat_delta_g?: number }
  comparison?: Record<string, unknown> | null
}

export interface MassIQPersonalizationDecision {
  engine_version: string
  phase_decision: PhaseDecision
  body_state: BodyState
  nutrition_adjustments: NutritionAdjustments
  training_adjustments: TrainingAdjustments
  behavior: BehaviorFocus
  projection: Projection
  human_explanation: string
  adaptation_legacy: AdaptationLegacy
  /** @deprecated use `behavior.tags` */
  behavior_focus?: string[]
}
