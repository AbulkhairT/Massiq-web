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
import { calcLBM, lbsToKg } from './calculator'

/* ─────────────────────────────────────────────────────────────────────── */
/* Scan comparison                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

export function analyzeScanProgress(
  previousScan: BodyScan,
  currentScan:  BodyScan,
  physio:       PhysioCalcs,   // engine calcs at time of previous scan
  goal:         Goal,
): FeedbackResult {
  const prevWeight = previousScan.weight ?? (physio.weightKg / 0.453592)
  const currWeight = currentScan.weight  ?? prevWeight
  const prevLBM = previousScan.leanMass ?? calcLBM(prevWeight, previousScan.bodyFat).lbs
  const currLBM = currentScan.leanMass  ?? calcLBM(currWeight, currentScan.bodyFat).lbs

  const prevDate = new Date(previousScan.date)
  const currDate = new Date(currentScan.date)
  const daysElapsed = Math.max(1, Math.round((currDate.getTime() - prevDate.getTime()) / 86400000))
  const weeklyWeightChangeLbs = ((currWeight - prevWeight) / daysElapsed) * 7
  const weeklyWeightChangePct = prevWeight > 0 ? (weeklyWeightChangeLbs / prevWeight) * 100 : 0
  const actualBFChange = currentScan.bodyFat - previousScan.bodyFat
  const actualLMChange = currLBM - prevLBM
  const actualWTChange = currWeight - prevWeight
  const weeklyBFChange = (actualBFChange / daysElapsed) * 7
  const fatLossRate = ((prevWeight * (previousScan.bodyFat / 100)) - (currWeight * (currentScan.bodyFat / 100))) / (daysElapsed / 7)

  const expectedByGoal = goal === 'Cut'
    ? { min: -1.0, max: -0.4 }
    : goal === 'Bulk'
      ? { min: 0.25, max: 0.75 }
      : { min: -0.2, max: 0.2 }

  const baselineCalories = Math.round(physio.targetCalories)
  const weightKg = lbsToKg(currWeight)
  const currentProtein = Math.max(0, Math.round(physio.targetProteinG))
  let nextCalories = baselineCalories
  let nextProtein = currentProtein
  let diagnosis = 'Progress is within expected route band.'
  let message = 'Stay on plan and continue weekly execution.'
  let status: ProgressStatus = 'on_track'
  const riskFlags: string[] = []

  const muscleLossDetected = actualLMChange <= -0.7
  if (muscleLossDetected) riskFlags.push('muscle_loss_risk')
  if (Math.abs(weeklyWeightChangePct) < 0.1) riskFlags.push('stalled_progress')

  const clampDelta = (delta: number) => Math.max(-300, Math.min(300, delta))
  const applyDelta = (delta: number) => {
    nextCalories = Math.max(1200, Math.min(5000, baselineCalories + clampDelta(delta)))
  }

  if (goal === 'Cut') {
    if (weeklyWeightChangePct < -1.0) {
      applyDelta(200)
      diagnosis = 'You are losing weight too fast.'
      message = 'Loss too aggressive — reduce deficit.'
      status = 'ahead'
      nextProtein = Math.max(nextProtein, Math.round(weightKg * 2.2))
    } else if (weeklyWeightChangePct > -0.3) {
      applyDelta(-175)
      diagnosis = 'Fat loss is too slow.'
      message = 'Fat loss too slow — increase deficit.'
      status = 'behind'
    }
  } else if (goal === 'Maintain' || goal === 'Recomp') {
    if (weeklyWeightChangePct > 0.3) {
      applyDelta(-150)
      diagnosis = 'Weight is drifting up in maintenance.'
      message = 'Gaining fat — slight reduction needed.'
      status = 'behind'
      riskFlags.push('fat_gain_risk')
    } else if (weeklyWeightChangePct < -0.3) {
      applyDelta(150)
      diagnosis = 'Weight is dropping in maintenance.'
      message = 'Losing weight — increase intake.'
      status = 'behind'
    }
  } else if (goal === 'Bulk') {
    if (weeklyWeightChangePct > 1.0) {
      applyDelta(-200)
      diagnosis = 'Gain rate is too aggressive.'
      message = 'Gaining too fast — minimize fat gain.'
      status = 'ahead'
      riskFlags.push('fat_gain_risk')
    } else if (weeklyWeightChangePct < 0.2) {
      applyDelta(175)
      diagnosis = 'Gain rate is too slow.'
      message = 'Growth too slow — increase calories.'
      status = 'behind'
    }
  }

  if (muscleLossDetected) {
    nextProtein = Math.max(nextProtein, Math.round(weightKg * 2.2))
    diagnosis = 'Lean mass trend indicates muscle loss risk.'
    message = 'Increase protein or reduce deficit to protect lean mass.'
    status = status === 'on_track' ? 'muscle_loss' : status
  }

  const proteinFloor = Math.round(weightKg * 1.6)
  nextProtein = Math.max(nextProtein, proteinFloor)
  const proteinDelta = nextProtein - currentProtein
  const calorieDelta = nextCalories - baselineCalories
  const variancePct = expectedByGoal.max === expectedByGoal.min
    ? 0
    : Math.round(((weeklyWeightChangePct - expectedByGoal.min) / (expectedByGoal.max - expectedByGoal.min)) * 100)
  const confidence: 'low' | 'medium' | 'high' = daysElapsed >= 21 ? 'high' : daysElapsed >= 10 ? 'medium' : 'low'

  return {
    days_elapsed: daysElapsed,
    actual_bf_change: Number(actualBFChange.toFixed(2)),
    actual_lm_change: Number(actualLMChange.toFixed(2)),
    actual_wt_change: Number(actualWTChange.toFixed(2)),
    expected_bf_change: Number(weeklyBFChange.toFixed(2)),
    variance_pct: Number.isFinite(variancePct) ? variancePct : 0,
    status,
    fat_loss_rate: Number.isFinite(fatLossRate) ? Number(fatLossRate.toFixed(2)) : 0,
    muscle_loss_detected: muscleLossDetected,
    recommendation_adjustment: {
      calorie_delta: calorieDelta,
      protein_delta: proteinDelta,
      reason: `${diagnosis} ${message}`.trim(),
    },
    diagnosis,
    risk_flags: riskFlags,
    message,
    confidence,
    adjustment: {
      calories: nextCalories,
      protein: nextProtein,
    },
  }
}
