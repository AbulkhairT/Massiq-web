/* ─── MassIQ Intelligence Engine — Feedback Loop ─────────────────────────
   Computes progress from two body scans and generates corrective adjustments.

   The feedback loop is the core of MassIQ's intelligence — without it the
   system is just a calculator. With it, the system adapts to how the user's
   body is ACTUALLY responding.

   Inputs:  previous scan + current scan + the plan targets
   Outputs: deviation from expected + concrete adjustment deltas
────────────────────────────────────────────────────────────────────────── */

import type {
  BodyScan, PhysioCalcs, Goal,
  FeedbackResult, ProgressStatus,
} from './types'
import { calcLBM, lbsToKg, weeklyFatLoss } from './calculator'

/* ─────────────────────────────────────────────────────────────────────── */
/* Scan comparison                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

export function analyzeScanProgress(
  previousScan: BodyScan,
  currentScan:  BodyScan,
  physio:       PhysioCalcs,   // engine calcs at time of previous scan
  goal:         Goal,
): FeedbackResult {

  /* ── Parse scan data ─────────────────────────────────────────────────── */

  const prevWeight = previousScan.weight ?? physio.weightKg / 0.453592
  const currWeight = currentScan.weight  ?? prevWeight

  const prevLBM = previousScan.leanMass ?? calcLBM(prevWeight, previousScan.bodyFat).lbs
  const currLBM = currentScan.leanMass  ?? calcLBM(currWeight, currentScan.bodyFat).lbs

  /* ── Time elapsed ─────────────────────────────────────────────────────── */

  const prevDate   = new Date(previousScan.date)
  const currDate   = new Date(currentScan.date)
  const msElapsed  = currDate.getTime() - prevDate.getTime()
  const daysElapsed = Math.max(1, Math.round(msElapsed / 86400000))
  const weeksElapsed = daysElapsed / 7

  /* ── Actual changes ───────────────────────────────────────────────────── */

  const actualBFChange  = currentScan.bodyFat - previousScan.bodyFat   // negative = fat loss
  const actualLMChange  = currLBM - prevLBM                             // positive = muscle gain
  const actualWTChange  = currWeight - prevWeight                       // negative = weight loss

  // Actual fat mass change (lbs)
  const prevFatLbs = prevWeight * (previousScan.bodyFat / 100)
  const currFatLbs = currWeight * (currentScan.bodyFat  / 100)
  const fatLostLbs = prevFatLbs - currFatLbs                            // positive = fat lost

  const actualFatLossRate = fatLostLbs / weeksElapsed                   // lbs/week

  /* ── Expected changes ─────────────────────────────────────────────────── */

  const dailyDeficit = Math.abs(physio.deficit)
  const expectedWeeklyLoss = weeklyFatLoss(dailyDeficit)
  const expectedFatLost    = expectedWeeklyLoss * weeksElapsed

  // Expected BF change: how much % drop we expected
  const expectedFatPctDrop = (expectedFatLost / prevWeight) * 100
  const expectedBFChange   = -expectedFatPctDrop                        // negative = expected drop

  /* ── Variance ─────────────────────────────────────────────────────────── */

  // Variance = how much actual diverges from expected, as a percentage
  // Positive variance = losing more than expected (ahead)
  // Negative variance = losing less than expected (behind)
  const expectedAbs = Math.abs(expectedBFChange)
  const variance = expectedAbs > 0
    ? ((Math.abs(actualBFChange) - expectedAbs) / expectedAbs) * 100
    : 0

  /* ── Muscle loss detection ────────────────────────────────────────────── */

  // Flag muscle loss if LBM decreased by more than 0.5% of previous LBM
  // Small decreases (<0.5%) may be measurement noise
  const muscleLossThresholdLbs = prevLBM * 0.005
  const muscleLossDetected = actualLMChange < -muscleLossThresholdLbs

  /* ── Progress status classification ──────────────────────────────────── */

  let status: ProgressStatus
  if (muscleLossDetected) {
    status = 'muscle_loss'
  } else if (goal === 'Cut') {
    if (variance >= 15) {
      status = 'ahead'
    } else if (variance >= -30) {
      status = 'on_track'
    } else if (variance >= -70) {
      status = 'behind'
    } else {
      status = 'stalled'
    }
  } else if (goal === 'Bulk') {
    // For bulk, check if gaining at expected rate
    const expectedGain = weeklyFatLoss(Math.abs(physio.deficit)) * weeksElapsed
    const gainVariance = actualWTChange > 0 ? ((actualWTChange - expectedGain) / expectedGain) * 100 : -100
    status = gainVariance >= -30 ? 'on_track' : 'behind'
  } else {
    status = 'on_track'
  }

  /* ── Recommendation adjustment ────────────────────────────────────────── */

  let calorieDelta = 0
  let proteinDelta = 0
  let adjustReason = 'No adjustment required — progress is on track'

  if (status === 'muscle_loss') {
    calorieDelta  = 200    // add 200 kcal to reduce muscle catabolism
    proteinDelta  = 25     // add 25g protein
    adjustReason  = `Lean mass decreased ${Math.abs(actualLMChange).toFixed(1)} lbs — adding 200 kcal and 25g protein to protect muscle`
  } else if (status === 'ahead' && goal === 'Cut') {
    // Losing too fast — risk of muscle loss upcoming
    calorieDelta = 150
    adjustReason = `Fat loss ${Math.abs(actualBFChange).toFixed(1)}% BF (${variance.toFixed(0)}% ahead of target) — adding 150 kcal to maintain sustainable rate`
  } else if (status === 'behind' && goal === 'Cut') {
    calorieDelta = -150
    adjustReason = `Fat loss ${Math.abs(actualBFChange).toFixed(1)}% BF (${Math.abs(variance).toFixed(0)}% below target) — removing 150 kcal to restore deficit`
  } else if (status === 'stalled' && goal === 'Cut') {
    calorieDelta = -200
    adjustReason = `Progress stalled — reducing calories by 200 kcal. Consider adding 1 cardio session/week if deficit already feels low`
  } else if (status === 'behind' && goal === 'Bulk') {
    calorieDelta = 100
    adjustReason = `Gaining slower than expected — adding 100 kcal/day to improve anabolic environment`
  }

  return {
    days_elapsed:         daysElapsed,
    actual_bf_change:     Math.round(actualBFChange * 10) / 10,
    actual_lm_change:     Math.round(actualLMChange * 10) / 10,
    actual_wt_change:     Math.round(actualWTChange * 10) / 10,
    expected_bf_change:   Math.round(expectedBFChange * 10) / 10,
    variance_pct:         Math.round(variance),
    status,
    fat_loss_rate:        Math.round(actualFatLossRate * 100) / 100,
    muscle_loss_detected: muscleLossDetected,
    recommendation_adjustment: {
      calorie_delta: calorieDelta,
      protein_delta: proteinDelta,
      reason:        adjustReason,
    },
  }
}
