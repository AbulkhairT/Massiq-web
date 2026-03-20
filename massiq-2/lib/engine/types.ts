/* ─── MassIQ Intelligence Engine — Types ──────────────────────────────────
   Single source of truth for all data shapes flowing through the engine.
   These mirror the runtime shapes in MassIQ.jsx exactly.
────────────────────────────────────────────────────────────────────────── */

export type Gender        = 'Male' | 'Female'
export type Goal          = 'Cut' | 'Bulk' | 'Recomp' | 'Maintain'
export type ActivityLevel = 'Sedentary' | 'Light' | 'Moderate' | 'Active'
export type Confidence    = 'high' | 'medium' | 'low'
export type Severity      = 'critical' | 'warning' | 'info'
export type ProgressStatus = 'on_track' | 'ahead' | 'behind' | 'stalled' | 'muscle_loss'

/* ── Input shapes ──────────────────────────────────────────────────────── */

export interface UserProfile {
  name:       string
  age:        number
  gender:     Gender
  weightLbs:  number
  heightCm:   number
  heightIn:   number
  goal:       Goal
  activity:   ActivityLevel
  dietPrefs:  string[]
  cuisines:   string[]
  avoid:      string[]
}

/** One body scan entry stored in scanHistory */
export interface BodyScan {
  date:      string   // ISO YYYY-MM-DD
  bodyFat:   number   // percentage, e.g. 17.2
  weight?:   number   // lbs (use profile.weightLbs as fallback)
  leanMass?: number   // lbs (calculated if not provided)
}

/** Optional daily log for feedback enrichment */
export interface DailyLog {
  date:     string
  calories: number
  protein:  number
  carbs:    number
  fat:      number
  steps?:   number
  sleep?:   number
  water?:   number
}

export interface EngineInput {
  profile:        UserProfile
  currentScan?:   BodyScan          // latest scan (may be absent for new users)
  previousScans?: BodyScan[]        // all prior scans in chronological order
  recentLogs?:    DailyLog[]        // last 7–14 days of logged data
}

/* ── Calculated physiological data ────────────────────────────────────── */

export interface PhysioCalcs {
  weightKg:           number
  heightCm:           number
  lbmLbs:             number   // lean body mass in lbs
  lbmKg:              number   // lean body mass in kg
  bmr:                number   // basal metabolic rate (kcal/day)
  tdee:               number   // total daily energy expenditure (kcal/day)
  targetCalories:     number   // TDEE ± phase adjustment
  deficit:            number   // negative = deficit, positive = surplus
  minProteinG:        number   // minimum effective protein (g/day)
  targetProteinG:     number   // recommended protein (g/day)
  targetFatG:         number   // recommended fat (g/day)
  targetCarbsG:       number   // remaining carbs (g/day)
  weeklyFatLossLbs:   number   // expected fat loss per week at this deficit
  bfPct:              number   // body fat percentage (from scan or estimated)
  activityMultiplier: number
}

/* ── Macro targets (what the plan shows users) ─────────────────────────── */

export interface MacroTargets {
  calories:            number
  protein:             number
  carbs:               number
  fat:                 number
  steps:               number
  sleepHours:          number
  waterLiters:         number
  trainingDaysPerWeek: number
  cardioDays:          number
}

/* ── Diagnosis ─────────────────────────────────────────────────────────── */

export type DiagnosisCode =
  | 'on_track'
  | 'aggressive_deficit'
  | 'insufficient_deficit'
  | 'muscle_loss_risk'
  | 'protein_insufficiency'
  | 'phase_mismatch'
  | 'recovery_deficit'
  | 'training_volume_mismatch'
  | 'caloric_misalignment'
  | 'stalled_progress'
  | 'bulk_bf_too_high'

export interface DiagnosisFlag {
  code:               DiagnosisCode
  severity:           Severity
  primary_issue:      string
  confidence:         Confidence
  supporting_signals: string[]
  recommended_action: string
}

export interface DiagnosisResult {
  primary:     DiagnosisFlag
  secondary:   DiagnosisFlag[]
  all_clear:   boolean          // true only if no critical/warning flags
}

/* ── Recommendations ───────────────────────────────────────────────────── */

export interface NutritionRec {
  calories:          number
  protein:           number
  carbs:             number
  fat:               number
  adjustment_kcal:   number   // delta from TDEE (negative = deficit)
  adjustment_reason: string
}

export interface TrainingRec {
  days_per_week:    number
  cardio_days:      number
  primary_focus:    string
  secondary_focus:  string
  reasoning:        string
}

export interface RecoveryRec {
  sleep_hours:  number
  water_liters: number
  steps:        number
  reasoning:    string
}

export interface RecommendationResult {
  nutrition:         NutritionRec
  training:          TrainingRec
  recovery:          RecoveryRec
  tied_to_diagnosis: DiagnosisCode
}

/* ── Trajectory ────────────────────────────────────────────────────────── */

export interface TrajectoryResult {
  timeline_weeks:   number
  weekly_change:    number   // expected lbs of fat loss or gain per week
  target_bf:        number   // goal body fat %
  confidence:       Confidence
  assumptions:      string[]
  milestone_weeks:  MilestoneWeek[]
}

export interface MilestoneWeek {
  week:        number
  expected_bf: number
  expected_wt: number   // expected weight in lbs
}

/* ── Feedback (multi-scan comparison) ─────────────────────────────────── */

export interface FeedbackResult {
  days_elapsed:        number
  actual_bf_change:    number   // percentage points (negative = fat loss)
  actual_lm_change:    number   // lbs (positive = muscle gain)
  actual_wt_change:    number   // lbs (negative = weight loss)
  expected_bf_change:  number   // what engine predicted
  variance_pct:        number   // (actual - expected) / |expected| * 100
  status:              ProgressStatus
  fat_loss_rate:       number   // actual lbs/week
  muscle_loss_detected: boolean
  recommendation_adjustment: {
    calorie_delta:  number   // how much to add/subtract from target calories
    protein_delta:  number   // how much to add/subtract from target protein
    reason:         string
  }
  diagnosis?: string
  risk_flags?: string[]
  message?: string
  confidence?: Confidence
  adjustment?: {
    calories: number
    protein: number
  }
  decision?: {
    state: ProgressStatus
    limiting_factor: string
    action: string
    reason: string
    expected_outcome: string
  }
}

/* ── Current state summary ─────────────────────────────────────────────── */

export interface CurrentState {
  body_fat_pct:    number
  lean_mass_lbs:   number
  weight_lbs:      number
  tdee:            number
  phase:           Goal
  weeks_in_plan:   number
  scan_date:       string | null
}

/* ── Next actions ──────────────────────────────────────────────────────── */

export interface NextAction {
  priority: number           // 1 = highest
  label:    string
  value:    string           // e.g. "215g protein daily"
  reason:   string
}

/* ── Full engine output ────────────────────────────────────────────────── */

export interface EngineOutput {
  current_state:   CurrentState
  physio:          PhysioCalcs
  diagnosis:       DiagnosisResult
  recommendations: RecommendationResult
  trajectory:      TrajectoryResult
  feedback?:       FeedbackResult          // present only if ≥2 scans
  next_actions:    NextAction[]
  macro_targets:   MacroTargets            // ready to plug into the plan
  start_bf:        number
  target_bf:       number
}
