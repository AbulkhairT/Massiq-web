/* ─── MassIQ Intelligence Engine — Trajectory Engine ─────────────────────
   Deterministic timeline prediction for body composition goals.

   Fat loss model:
   - Uses weekly fat loss rate derived from caloric deficit
   - Applies a 10% metabolic adaptation buffer (TDEE decreases as weight drops)
   - Timeline recalculates after each scan for accuracy

   The model does NOT assume linear fat loss — it applies a deceleration
   factor to account for metabolic adaptation (Rosenbaum & Leibel, 2010).
────────────────────────────────────────────────────────────────────────── */

import type {
  PhysioCalcs, Goal, Confidence,
  TrajectoryResult, MilestoneWeek,
} from './types'
import { calcLBM } from './calculator'

/* ─────────────────────────────────────────────────────────────────────── */
/* Core timeline calculation                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Calculate weeks to reach target body fat percentage.
 *
 * @param currentBF   - current body fat percentage (e.g. 17.2)
 * @param targetBF    - goal body fat percentage (e.g. 12)
 * @param weightLbs   - current body weight in lbs
 * @param weeklyDeficit - daily caloric deficit in kcal (positive number)
 * @param goal        - the phase (only 'Cut' produces a meaningful timeline)
 */
export function calcTimeline(
  currentBF:     number,
  targetBF:      number,
  weightLbs:     number,
  weeklyDeficit: number,   // daily deficit kcal
  goal:          Goal,
): TrajectoryResult {

  if (goal === 'Bulk') {
    return bulkTrajectory(currentBF, targetBF, weightLbs, weeklyDeficit)
  }

  if (goal === 'Maintain' || goal === 'Recomp') {
    return recompTrajectory(currentBF, targetBF, weightLbs)
  }

  return cutTrajectory(currentBF, targetBF, weightLbs, weeklyDeficit)
}

/* ── Cut trajectory ──────────────────────────────────────────────────── */

function cutTrajectory(
  currentBF:    number,
  targetBF:     number,
  weightLbs:    number,
  dailyDeficit: number,
): TrajectoryResult {

  if (targetBF >= currentBF) {
    return {
      timeline_weeks: 0,
      weekly_change:  0,
      target_bf:      targetBF,
      confidence:     'high',
      assumptions:    ['Already at or below target body fat'],
      milestone_weeks: [],
    }
  }

  // Fat mass to lose in lbs
  const fatNow    = weightLbs * (currentBF / 100)
  const lbmNow    = weightLbs - fatNow

  // Target weight: we want target BF% with same lean mass
  // LBM stays constant in ideal scenario; target_weight = LBM / (1 - targetBF/100)
  const targetWeight = lbmNow / (1 - targetBF / 100)
  const fatToLose    = weightLbs - targetWeight

  if (fatToLose <= 0) {
    return {
      timeline_weeks: 0,
      weekly_change:  0,
      target_bf:      targetBF,
      confidence:     'high',
      assumptions:    ['Target already achieved'],
      milestone_weeks: [],
    }
  }

  // Weekly fat loss from deficit (3,500 kcal = 1 lb fat, Wishnofsky)
  const rawWeeklyLoss = (dailyDeficit * 7) / 3500

  // Metabolic adaptation factor: TDEE decreases ~5% per 10 lbs lost
  // Apply a 12% buffer to account for adaptation and non-compliance variance
  const adaptationBuffer = 0.88
  const effectiveWeeklyLoss = rawWeeklyLoss * adaptationBuffer

  if (effectiveWeeklyLoss <= 0) {
    return {
      timeline_weeks: 52,
      weekly_change:  0,
      target_bf:      targetBF,
      confidence:     'low',
      assumptions:    ['No meaningful deficit — no fat loss expected'],
      milestone_weeks: [],
    }
  }

  const baseWeeks = fatToLose / effectiveWeeklyLoss
  const timeline  = Math.ceil(baseWeeks)

  // Confidence based on the amount of data and deficit size
  let confidence: Confidence
  if (dailyDeficit >= 250 && dailyDeficit <= 600 && fatToLose < 20) {
    confidence = 'high'
  } else if (dailyDeficit >= 150 && fatToLose < 35) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  const milestones = buildCutMilestones(currentBF, targetBF, weightLbs, lbmNow, effectiveWeeklyLoss, timeline)

  return {
    timeline_weeks:  timeline,
    weekly_change:   Math.round(effectiveWeeklyLoss * 100) / 100,
    target_bf:       targetBF,
    confidence,
    assumptions: [
      `Deficit maintained at ${Math.round(dailyDeficit)} kcal/day`,
      `Lean mass preserved through adequate protein and resistance training`,
      `12% buffer applied for metabolic adaptation`,
      `Timeline based on ${Math.round(fatToLose * 10) / 10} lbs of fat to lose`,
    ],
    milestone_weeks: milestones,
  }
}

/* ── Bulk trajectory ─────────────────────────────────────────────────── */

function bulkTrajectory(
  currentBF:   number,
  targetBF:    number,
  weightLbs:   number,
  dailySurplus: number,
): TrajectoryResult {

  // At a 300 kcal surplus: ~0.5 lbs/week total mass gain
  // Of which ~50% is muscle, 50% is fat (beginner) to 30% muscle, 70% fat (advanced)
  // Use 40% muscle, 60% fat as general estimate
  const weeklyGain   = (dailySurplus * 7) / 3500
  const weeklyMuscle = weeklyGain * 0.40

  // Target is often not a specific BF — frame as muscle gain over 12 weeks
  const twelveWeekMuscleGain = weeklyMuscle * 12

  return {
    timeline_weeks: 12,    // standard bulk block
    weekly_change:  Math.round(weeklyGain * 100) / 100,
    target_bf:      targetBF,
    confidence:     'medium',
    assumptions: [
      `${Math.round(dailySurplus)} kcal/day surplus`,
      `Expected total gain: ${Math.round(weeklyGain * 12 * 10) / 10} lbs over 12 weeks`,
      `Of which ~${Math.round(twelveWeekMuscleGain * 10) / 10} lbs is lean mass`,
      'Actual muscle gain depends heavily on training quality and sleep',
    ],
    milestone_weeks: [],
  }
}

/* ── Recomp/Maintain trajectory ─────────────────────────────────────── */

function recompTrajectory(
  currentBF: number,
  targetBF:  number,
  weightLbs: number,
): TrajectoryResult {

  // Recomp: slow process — ~0.5–1% BF drop per month under optimal conditions
  const bfGap       = Math.max(0, currentBF - targetBF)
  const monthsNeeded = bfGap / 0.75   // 0.75% BF drop per month (conservative)
  const weeksNeeded  = Math.ceil(monthsNeeded * 4.33)

  return {
    timeline_weeks: weeksNeeded || 12,
    weekly_change:  -0.17,  // ~0.75% / 4.33 weeks per month
    target_bf:      targetBF,
    confidence:     'low',   // recomp timelines are inherently uncertain
    assumptions: [
      'Body recomposition is slower than a dedicated cut',
      'Expected BF reduction: ~0.5–1% per month under optimal conditions',
      'Scale weight may not change — track body fat %, not weight',
      'Results highly dependent on training intensity and protein intake',
    ],
    milestone_weeks: [],
  }
}

/* ── Milestone generator ─────────────────────────────────────────────── */

function buildCutMilestones(
  currentBF:    number,
  targetBF:     number,
  startWeight:  number,
  lbmLbs:       number,
  weeklyLoss:   number,
  totalWeeks:   number,
): MilestoneWeek[] {

  const milestones: MilestoneWeek[] = []
  const checkpoints = [4, 8, 12, 16, 20, 24].filter(w => w <= totalWeeks + 2)

  for (const week of checkpoints) {
    const totalFatLost = weeklyLoss * week
    const newWeight    = Math.max(startWeight - totalFatLost, lbmLbs + 5)  // floor at LBM + 5 lbs
    const newFatLbs    = newWeight - lbmLbs
    const newBF        = Math.max(targetBF - 1, (newFatLbs / newWeight) * 100)

    milestones.push({
      week,
      expected_bf: Math.round(newBF * 10) / 10,
      expected_wt: Math.round(newWeight * 10) / 10,
    })

    if (newBF <= targetBF) break  // stop projecting once target is reached
  }

  return milestones
}
