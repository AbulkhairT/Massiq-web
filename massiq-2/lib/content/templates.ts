/* ─── MassIQ Content Templates — Zero-LLM Plan Assembly ─────────────────
   Replaces 6 Claude calls (generateInitialPlan, generateMissions,
   generateDailyTip, generatePatterns) with deterministic template functions.

   Design rules:
   - All text is specific and numerical (never generic)
   - Numbers are interpolated from engine output
   - 7-day tip rotation keyed by goal + day-of-week
   - Mission tiers keyed by difficulty relative to current targets
─────────────────────────────────────────────────────────────────────────── */

import type { EngineOutput } from '../engine/types'

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface PlanContent {
  phase:              { name: string; label: string; objective: string; durationWeeks: number }
  dailyTargets:       Record<string, number>
  whyThisWorks:       string
  weeklyMissions:     string[]
  trainingFocus:      { primary: string; secondary: string; frequency: string; reasoning: string }
  nutritionKeyChange: string
  dailyTips:          string[]
  nextScanDate:       string
  transformationTimeline: { startBF: number; targetBF: number; weeksToGoal: number }
}

export interface Mission {
  id:          string
  tier:        'Bronze' | 'Silver' | 'Gold' | 'Platinum'
  emoji:       string
  title:       string
  description: string
  xp:          number
}

export interface Insight {
  icon:    string
  pattern: string
  action:  string
}

/* ─── Phase objectives ────────────────────────────────────────────────────── */

function phaseObjective(
  goal: string,
  calories: number,
  protein: number,
  startBF: number,
  targetBF: number,
  weeks: number,
): string {
  const bfDelta = Math.abs(startBF - targetBF).toFixed(1)
  switch (goal) {
    case 'Cut':
      return `Achieve a sustained ${calories} kcal daily target with ${protein}g protein to preserve lean mass while losing ${bfDelta}% body fat over ${weeks} weeks.`
    case 'Bulk':
      return `Build lean mass through a ${calories} kcal controlled surplus with ${protein}g protein to maximise muscle protein synthesis over ${weeks} weeks.`
    case 'Recomp':
      return `Recompose at ${calories} kcal maintenance with ${protein}g protein to simultaneously reduce body fat from ${startBF}% toward ${targetBF}% while retaining lean mass.`
    default:
      return `Maintain body composition at ${calories} kcal with ${protein}g protein, supporting long-term health and performance over the next ${weeks} weeks.`
  }
}

/* ─── Why this works explanations ─────────────────────────────────────────── */

function whyThisWorks(
  goal: string,
  calories: number,
  protein: number,
  tdee: number,
  diagnosisCode: string,
  lbmKg: number,
): string {
  const deficit = tdee - calories
  const protPerLbm = (protein / lbmKg).toFixed(1)

  const phaseReason: Record<string, string> = {
    Cut:     `A ${deficit > 0 ? deficit : 0} kcal daily deficit (${calories} kcal vs your ${tdee} kcal TDEE) targets 0.5–0.8% of bodyweight lost per week — the sweet spot for fat loss without muscle breakdown.`,
    Bulk:    `A ${Math.abs(deficit)} kcal controlled surplus above your ${tdee} kcal TDEE provides enough energy for muscle protein synthesis without excess fat accumulation.`,
    Recomp:  `Operating near your ${tdee} kcal maintenance level allows simultaneous fat oxidation and muscle protein synthesis — possible when protein intake is high enough.`,
    Maintain:`Your ${calories} kcal target keeps energy balance near your ${tdee} kcal TDEE, supporting body composition without systemic stress.`,
  }

  const proteinReason = `${protein}g protein (${protPerLbm}g/kg lean mass) is above the ISSN threshold for muscle protein retention during ${goal === 'Bulk' ? 'a caloric surplus' : 'a deficit'}.`

  const diagReason: Record<string, string> = {
    phase_mismatch:           'The current body fat level is outside the optimal range for this phase, so targets have been adjusted to move you into the correct zone first.',
    aggressive_deficit:       'The deficit has been moderated to prevent metabolic adaptation and lean mass loss.',
    insufficient_deficit:     'The deficit has been increased to ensure measurable fat loss progress.',
    protein_insufficiency:    'Protein has been elevated to the minimum effective dose for muscle retention.',
    recovery_deficit:         'Recovery targets have been included — insufficient sleep directly suppresses muscle protein synthesis by 18–24%.',
    stalled_progress:         'A planned caloric refeed cycle (±200 kcal every 2 weeks) prevents leptin suppression, which is the primary driver of stalls.',
    default:                  'All targets are within optimal physiological ranges for your goal.',
  }

  return [
    phaseReason[goal] || phaseReason['Maintain'],
    proteinReason,
    diagReason[diagnosisCode] || diagReason['default'],
  ].join(' ')
}

/* ─── Training focus ──────────────────────────────────────────────────────── */

function buildTrainingFocus(
  goal: string,
  trainDays: number,
  weakestGroups: string[] = [],
): { primary: string; secondary: string; frequency: string; reasoning: string } {
  const primary = weakestGroups.length > 0
    ? weakestGroups[0].charAt(0).toUpperCase() + weakestGroups[0].slice(1)
    : (goal === 'Cut' ? 'Full body compound movements' : 'Progressive overload on major lifts')

  const secondary = weakestGroups.length > 1
    ? weakestGroups[1].charAt(0).toUpperCase() + weakestGroups[1].slice(1)
    : (goal === 'Cut' ? 'Metabolic conditioning' : 'Hypertrophy isolation work')

  const reasoning: Record<string, string> = {
    Cut:     `${trainDays} sessions/week preserves lean mass via mechanical tension while the deficit drives fat loss. High-frequency full body work maintains motor patterns.`,
    Bulk:    `${trainDays} sessions/week provides sufficient volume for hypertrophy (10–20 sets per muscle/week) with enough rest for supercompensation.`,
    Recomp:  `${trainDays} sessions/week balances training stimulus for muscle retention with adequate recovery for body fat reduction.`,
    Maintain:`${trainDays} sessions/week maintains muscle mass and metabolic rate with minimal systemic fatigue.`,
  }

  return {
    primary,
    secondary,
    frequency: `${trainDays}x per week`,
    reasoning: reasoning[goal] || reasoning['Maintain'],
  }
}

/* ─── Nutrition key change ─────────────────────────────────────────────────── */

function nutritionKeyChange(
  goal: string,
  protein: number,
  calories: number,
  diagnosisCode: string,
): string {
  if (diagnosisCode === 'protein_insufficiency') {
    return `Increase daily protein to ${protein}g — distribute across 4–5 meals (${Math.round(protein / 4)}–${Math.round(protein / 5)}g per meal) to maximise muscle protein synthesis.`
  }
  if (diagnosisCode === 'aggressive_deficit') {
    return `Raise daily intake to ${calories} kcal — a more moderate deficit improves adherence and prevents the metabolic slowdown that stalls progress.`
  }
  if (diagnosisCode === 'insufficient_deficit') {
    return `Reduce daily intake to ${calories} kcal — the current intake is too close to TDEE for measurable fat loss progress.`
  }
  switch (goal) {
    case 'Cut':
      return `Hit ${protein}g protein on your ${calories} kcal target — front-load protein at breakfast and post-workout to minimise catabolism during the deficit.`
    case 'Bulk':
      return `Consume ${calories} kcal with ${protein}g protein daily — focus on carbohydrate timing around training for maximised glycogen and anabolic signalling.`
    case 'Recomp':
      return `Prioritise ${protein}g protein spread across 4 meals — at maintenance calories, protein distribution determines whether you lose fat, gain muscle, or both.`
    default:
      return `Maintain ${protein}g protein at ${calories} kcal daily — consistent intake prevents the gradual muscle loss that occurs with low-protein maintenance phases.`
  }
}

/* ─── Daily tips (7-day rotation by goal) ─────────────────────────────────── */

const DAILY_TIPS: Record<string, string[]> = {
  Cut: [
    'Monday — start the week with a high-protein breakfast to blunt morning cortisol-driven catabolism.',
    'Tuesday — training days need more carbs; shift 30–50g carbs to your pre- and post-workout windows.',
    'Wednesday — weigh yourself first thing after using the bathroom for the most accurate reading.',
    'Thursday — if hunger is high, add volume foods: 200g cucumber, spinach, or broth add almost zero calories.',
    'Friday — prep your protein sources for the weekend now — deficits are easiest to break on Saturdays.',
    'Saturday — one higher-carb day per week supports leptin levels and prevents metabolic adaptation.',
    'Sunday — log your weight, body measurements, and how training felt this week before planning next week.',
  ],
  Bulk: [
    'Monday — eat your largest meal of the day 1–2 hours before your heaviest training session.',
    'Tuesday — add a second protein source to every meal this week to hit your protein ceiling easier.',
    'Wednesday — track your training weights — progressive overload, not just food, drives muscle growth.',
    'Thursday — if digestion is an issue, split your daily intake across 5 meals instead of 3.',
    'Friday — pre-train with fast carbs (banana, rice cakes) to maximise workout intensity and output.',
    'Saturday — prioritise sleep tonight — GH peaks in the first 2 hours of sleep and drives overnight MPS.',
    'Sunday — assess your weekly weight trend; if you gained less than 0.2% bodyweight, add 100–150 kcal.',
  ],
  Recomp: [
    'Monday — training days eat at the higher end of your target; rest days keep it 150–200 kcal lower.',
    'Tuesday — your protein target is non-negotiable today — it drives simultaneous fat loss and muscle gain.',
    'Wednesday — focus on lifting heavier or adding reps this week — progressive overload prevents muscle loss.',
    'Thursday — 7–9 hours sleep is as important as nutrition for recomp — cortisol inhibits fat oxidation.',
    'Friday — skip alcohol this weekend — it directly suppresses fat oxidation for 12–24 hours after intake.',
    'Saturday — check your measurements, not just the scale — recomp shows in the mirror before the scale moves.',
    'Sunday — plan your meals for next week in advance — ad hoc eating makes hitting macros significantly harder.',
  ],
  Maintain: [
    'Monday — maintenance phases are when you improve habits — focus on meal timing and sleep this week.',
    'Tuesday — strength standards during maintenance should hold or improve — track your main lifts.',
    'Wednesday — assess your energy levels midweek; persistent fatigue may mean TDEE has drifted up.',
    'Thursday — maintenance is an opportunity to eat more food without gaining fat — use it to build habits.',
    'Friday — experiment with meal timing this week to find what optimises your training performance.',
    'Saturday — review the past week: was weight stable? If trending up, subtract 100–150 kcal.',
    'Sunday — plan next week with at least 4 structured training sessions and your meals prepared in advance.',
  ],
}

/* ─── Weekly missions (3 specific, numerical) ─────────────────────────────── */

function buildWeeklyMissions(goal: string, macros: { calories: number; protein: number }, trainDays: number, steps: number): string[] {
  const { calories, protein } = macros
  switch (goal) {
    case 'Cut':
      return [
        `Hit ${protein}g protein every day this week — log every meal to stay on track.`,
        `Complete ${trainDays} resistance sessions — prioritise compound lifts to preserve lean mass.`,
        `Stay at or below ${calories} kcal/day and hit ${steps.toLocaleString()} steps on all 7 days.`,
      ]
    case 'Bulk':
      return [
        `Eat ${calories} kcal minimum on ${trainDays} training days — don't undereat on heavy sessions.`,
        `Hit ${protein}g protein every day this week — add a shake on days you fall short.`,
        `Log every training session with weights used — the data drives your next progressive overload.`,
      ]
    case 'Recomp':
      return [
        `Hit ${protein}g protein every single day — this is the number-one driver of recomp results.`,
        `Complete ${trainDays} sessions with progressive overload — add 2.5 kg or 1–2 reps to at least one lift.`,
        `Keep calories at ${calories} kcal on rest days — reducing them further on rest days accelerates recomp.`,
      ]
    default:
      return [
        `Hit ${protein}g protein and ${calories} kcal daily — consistency over perfection.`,
        `Complete ${trainDays} resistance sessions this week at the same or greater volume as last week.`,
        `Aim for ${steps.toLocaleString()} steps and 7–8 hours sleep every night.`,
      ]
  }
}

/* ─── Main plan builder ────────────────────────────────────────────────────── */

export function buildPlanContent(
  profile: { name: string; goal: string; weightLbs: number; gender: string },
  macros: { calories: number; protein: number; carbs: number; fat: number; steps?: number; sleepHours?: number; waterLiters?: number; trainingDaysPerWeek?: number; cardioDays?: number },
  engineOutput?: EngineOutput | null,
): PlanContent {
  const goal = profile.goal || 'Maintain'
  const in4weeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)

  const trainDays   = macros.trainingDaysPerWeek || 4
  const steps       = macros.steps               || 9000
  const sleepHours  = macros.sleepHours          || 8
  const waterLiters = macros.waterLiters         || 3

  const startBF     = engineOutput?.start_bf     ?? 20
  const targetBF    = engineOutput?.target_bf    ?? (goal === 'Cut' ? startBF - 4 : startBF)
  const weeksToGoal = engineOutput?.trajectory?.timeline_weeks ?? 12
  const tdee        = engineOutput?.physio?.tdee  ?? macros.calories + 300
  const lbmKg       = engineOutput?.physio?.lbmKg ?? (profile.weightLbs * 0.453592 * 0.8)
  const diagCode    = (engineOutput?.diagnosis?.primary?.code as string) ?? 'default'

  // Scan-derived weak groups (if available via run context — otherwise empty)
  const weakGroups: string[] = []

  return {
    phase: {
      name:          `${goal} Phase`,
      label:         goal,
      objective:     phaseObjective(goal, macros.calories, macros.protein, startBF, targetBF, weeksToGoal),
      durationWeeks: weeksToGoal,
    },
    dailyTargets: {
      calories:            macros.calories,
      protein:             macros.protein,
      carbs:               macros.carbs,
      fat:                 macros.fat,
      steps,
      sleepHours,
      waterLiters,
      trainingDaysPerWeek: trainDays,
    },
    whyThisWorks: whyThisWorks(goal, macros.calories, macros.protein, tdee, diagCode, lbmKg),
    weeklyMissions: buildWeeklyMissions(goal, macros, trainDays, steps),
    trainingFocus: buildTrainingFocus(goal, trainDays, weakGroups),
    nutritionKeyChange: nutritionKeyChange(goal, macros.protein, macros.calories, diagCode),
    dailyTips: DAILY_TIPS[goal] || DAILY_TIPS['Maintain'],
    nextScanDate: in4weeks,
    transformationTimeline: { startBF, targetBF, weeksToGoal },
  }
}

/* ─── Mission builder (8 progressive missions) ─────────────────────────────── */

export function buildMissions(
  goal: string,
  macros: { calories: number; protein: number },
  trainDays: number,
): Mission[] {
  const { calories, protein } = macros

  const sets: Record<string, Mission[]> = {
    Cut: [
      { id: 'c_b1', tier: 'Bronze',   emoji: '🥗', title: 'Protein Starter',    description: `Hit ${protein}g protein in one day`,              xp: 100  },
      { id: 'c_b2', tier: 'Bronze',   emoji: '🚶', title: 'Step Streak',         description: 'Hit your step target 3 days in a row',            xp: 100  },
      { id: 'c_s1', tier: 'Silver',   emoji: '🔥', title: 'Deficit Week',        description: `Stay under ${calories} kcal for 5 straight days`, xp: 250  },
      { id: 'c_s2', tier: 'Silver',   emoji: '💪', title: 'Lift Through Cut',    description: `Complete ${trainDays} resistance sessions this week`, xp: 250 },
      { id: 'c_g1', tier: 'Gold',     emoji: '⚡', title: 'Full Week Perfect',   description: `${protein}g protein AND under ${calories} kcal 7 days straight`, xp: 500 },
      { id: 'c_g2', tier: 'Gold',     emoji: '📉', title: 'First BF Drop',       description: 'Lose 0.5% body fat at next scan',                  xp: 500  },
      { id: 'c_p1', tier: 'Platinum', emoji: '🏆', title: 'Lean Mass Defender',  description: 'Lose fat with zero lean mass loss at next scan',   xp: 1000 },
      { id: 'c_p2', tier: 'Platinum', emoji: '🎯', title: 'Target Reached',      description: 'Hit your goal body fat percentage',               xp: 1000 },
    ],
    Bulk: [
      { id: 'b_b1', tier: 'Bronze',   emoji: '🍗', title: 'Protein Base',        description: `Hit ${protein}g protein in one day`,              xp: 100  },
      { id: 'b_b2', tier: 'Bronze',   emoji: '💪', title: 'First Session',       description: 'Complete your first resistance session this week', xp: 100  },
      { id: 'b_s1', tier: 'Silver',   emoji: '📈', title: 'Surplus Maintained',  description: `Hit ${calories} kcal minimum 5 days in a row`,    xp: 250  },
      { id: 'b_s2', tier: 'Silver',   emoji: '🏋️', title: 'Volume Week',         description: `${trainDays} sessions logged with weights recorded`, xp: 250  },
      { id: 'b_g1', tier: 'Gold',     emoji: '⚡', title: 'Progressive Overload', description: 'Add weight or reps to 3 lifts in one week',       xp: 500  },
      { id: 'b_g2', tier: 'Gold',     emoji: '📊', title: 'First Gain',          description: 'Show measurable lean mass increase at next scan', xp: 500  },
      { id: 'b_p1', tier: 'Platinum', emoji: '🏆', title: 'Clean Bulk',          description: 'Gain lean mass with <0.5% body fat increase at scan', xp: 1000 },
      { id: 'b_p2', tier: 'Platinum', emoji: '🎯', title: 'Mass Target Hit',     description: 'Reach your target lean mass milestone',           xp: 1000 },
    ],
    Recomp: [
      { id: 'r_b1', tier: 'Bronze',   emoji: '🥩', title: 'Protein Priority',    description: `Hit ${protein}g protein in one day`,              xp: 100  },
      { id: 'r_b2', tier: 'Bronze',   emoji: '😴', title: 'Sleep First',         description: 'Get 8 hours sleep 3 nights in a row',             xp: 100  },
      { id: 'r_s1', tier: 'Silver',   emoji: '⚖️', title: 'Macro Balance',       description: `Hit ${protein}g protein AND ${calories} kcal 5 days`, xp: 250 },
      { id: 'r_s2', tier: 'Silver',   emoji: '💪', title: 'Lift + Recover',      description: `${trainDays} sessions with no missed workouts`,    xp: 250  },
      { id: 'r_g1', tier: 'Gold',     emoji: '📉', title: 'BF Down',             description: 'Reduce body fat by 0.5% at next scan',            xp: 500  },
      { id: 'r_g2', tier: 'Gold',     emoji: '📈', title: 'Lean Up',             description: 'Maintain or increase lean mass at next scan',     xp: 500  },
      { id: 'r_p1', tier: 'Platinum', emoji: '🏆', title: 'Recomp Confirmed',    description: 'Gain lean mass AND lose fat in the same scan period', xp: 1000 },
      { id: 'r_p2', tier: 'Platinum', emoji: '🎯', title: 'Composition Target',  description: 'Reach your target body fat with lean mass intact', xp: 1000 },
    ],
    Maintain: [
      { id: 'm_b1', tier: 'Bronze',   emoji: '🍽️', title: 'Daily Logger',        description: 'Log every meal for one full day',                  xp: 100  },
      { id: 'm_b2', tier: 'Bronze',   emoji: '💪', title: 'Show Up',             description: 'Complete 2 resistance sessions this week',         xp: 100  },
      { id: 'm_s1', tier: 'Silver',   emoji: '⚖️', title: 'Weight Stable',       description: 'Keep weight within ±0.5 kg for 7 days',           xp: 250  },
      { id: 'm_s2', tier: 'Silver',   emoji: '🏃', title: 'Activity Week',       description: `${trainDays} sessions AND daily step target`,      xp: 250  },
      { id: 'm_g1', tier: 'Gold',     emoji: '🔒', title: 'Four-Week Hold',      description: 'Maintain body weight across a full 4-week period', xp: 500  },
      { id: 'm_g2', tier: 'Gold',     emoji: '💯', title: 'Perfect Protein',     description: `${protein}g protein every day for 14 days`,        xp: 500  },
      { id: 'm_p1', tier: 'Platinum', emoji: '🏆', title: 'Scan Unchanged',      description: 'Show identical body composition at next scan',     xp: 1000 },
      { id: 'm_p2', tier: 'Platinum', emoji: '🎯', title: 'Long Game',           description: 'Maintain scan results across 3 consecutive scans', xp: 1000 },
    ],
  }

  return sets[goal] || sets['Maintain']
}

/* ─── Daily tip getter ─────────────────────────────────────────────────────── */

export function getDailyTip(
  goal: string,
  macros: { calories: number; protein: number },
  eaten: { cal: number; prot: number },
  dayOfWeek: number,
): string {
  const tips = DAILY_TIPS[goal] || DAILY_TIPS['Maintain']
  const base = tips[dayOfWeek % 7]

  // Append a real-time macro status note
  const remainCal  = Math.max(0, macros.calories - eaten.cal)
  const remainProt = Math.max(0, macros.protein  - eaten.prot)

  if (eaten.cal > 0 || eaten.prot > 0) {
    return `${base} You have ${remainCal} kcal and ${remainProt}g protein remaining today.`
  }

  return base
}

/* ─── Pattern insights (deterministic from engine) ─────────────────────────── */

export function buildInsights(
  profile: { goal: string; activity: string },
  macros: { calories: number; protein: number },
  trainDays: number,
  engineOutput?: EngineOutput | null,
): Insight[] {
  const { goal } = profile
  const { calories, protein } = macros
  const diagCode = engineOutput?.diagnosis?.primary?.code as string | undefined
  const tdee     = engineOutput?.physio?.tdee

  const insights: Insight[] = []

  // Insight 1: based on primary diagnosis
  if (diagCode === 'protein_insufficiency') {
    insights.push({
      icon: '🥩',
      pattern: `Your protein target of ${protein}g is critical — under-eating protein during ${goal === 'Bulk' ? 'a surplus' : 'a deficit'} causes muscle loss.`,
      action: `Distribute ${protein}g across ${Math.ceil(protein / 40)} meals/snacks — ${Math.round(protein / Math.ceil(protein / 40))}g each.`,
    })
  } else if (diagCode === 'aggressive_deficit' && tdee) {
    const pct = Math.round((1 - calories / tdee) * 100)
    insights.push({
      icon: '⚠️',
      pattern: `A ${pct}% deficit is above the safe threshold — deficits over 25% trigger significant muscle catabolism within 2–3 weeks.`,
      action: `Increase intake to ${calories} kcal — the engine target accounts for metabolic adaptation over the full ${engineOutput?.trajectory?.timeline_weeks ?? 12}-week period.`,
    })
  } else if (diagCode === 'phase_mismatch') {
    insights.push({
      icon: '🎯',
      pattern: `Your current body fat is outside the optimal range for a ${goal} phase — the engine has adjusted targets to address this first.`,
      action: `Follow the adjusted targets for the first 4 weeks before reassessing your phase direction.`,
    })
  } else {
    insights.push({
      icon: '✅',
      pattern: `Your ${goal} targets are physiologically calibrated — ${calories} kcal supports the right rate of change for your current composition.`,
      action: `Track adherence closely this first week — the engine adjusts targets based on your scan results.`,
    })
  }

  // Insight 2: protein timing
  insights.push({
    icon: '⏱️',
    pattern: `Spreading ${protein}g protein across 4 meals (${Math.round(protein / 4)}g each) maximises muscle protein synthesis vs. having most in 1–2 meals.`,
    action: `Add a ${Math.round(protein / 4)}g protein source (chicken, fish, Greek yoghurt, cottage cheese) to every meal.`,
  })

  // Insight 3: training/recovery
  if (profile.activity === 'Sedentary') {
    insights.push({
      icon: '🚶',
      pattern: `Adding ${trainDays} resistance sessions/week to a sedentary baseline produces the most dramatic recomp results — any training stimulus is significant.`,
      action: `Start with ${trainDays}x full-body sessions at 70% effort for the first 2 weeks to build the habit before adding intensity.`,
    })
  } else {
    insights.push({
      icon: '💪',
      pattern: `${trainDays} resistance sessions/week at your current activity level maintains the training stimulus needed for your ${goal} phase target.`,
      action: `Log every session weight — progressive overload (adding 2.5 kg or 1–2 reps/week) is the primary signal that determines lean mass retention.`,
    })
  }

  return insights
}
