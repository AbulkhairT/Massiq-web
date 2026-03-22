/**
 * Dynamic scan adaptation engine.
 *
 * Compares a freshly-confirmed scan against the previous confirmed scan
 * and the active plan, then produces a structured decision + optional
 * macro adjustment recommendation.
 *
 * This module is pure JS — no I/O, no side effects.
 * Results are stored in the scan's scan_context.adaptation field in Supabase.
 */

export const ADAPTATION_DECISIONS = Object.freeze({
  KEEP_PLAN:          'keep_plan',
  REDUCE_CALORIES:    'reduce_calories',
  INCREASE_PROTEIN:   'increase_protein',
  IMPROVE_RECOVERY:   'improve_recovery',
  FLAG_PLATEAU:       'flag_plateau',
  DUPLICATE_REUSED:   'duplicate_reused',
  LOW_CONF_RESCAN:    'low_confidence_rescan',
  AGGRESSIVE_DEFICIT: 'aggressive_deficit',
  BULK_TOO_FAST:      'bulk_pace_too_fast',
});

function daysBetween(a, b) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

/**
 * Compute an adaptation decision from scan deltas.
 *
 * @param {object}      newScan   { date, bodyFat, leanMass, physiqueScore, symmetryScore, confidence }
 * @param {object|null} prevScan  { date, bodyFat, leanMass, physiqueScore, symmetryScore }
 * @param {object|null} plan      { phase, dailyTargets, engineTrajectory }
 *
 * @returns {{ decision, rationale, adjustment?, comparison? }}
 */
export function computeAdaptation(newScan, prevScan, plan) {
  // ── Baseline scan: nothing to compare yet ─────────────────────────────────
  if (!prevScan) {
    return {
      decision:  ADAPTATION_DECISIONS.KEEP_PLAN,
      rationale: 'Baseline established. Continue current plan for at least 4 weeks before evaluating adjustments.',
    };
  }

  // ── Low-confidence: can't trust the numbers ────────────────────────────────
  if (newScan.confidence === 'low') {
    return {
      decision:  ADAPTATION_DECISIONS.LOW_CONF_RESCAN,
      rationale: 'Scan confidence is low — results may be inaccurate. Retake in better lighting before applying plan changes.',
    };
  }

  const days       = daysBetween(prevScan.date, newScan.date);
  const weeks      = Math.max(0.1, days / 7);
  const bfDelta    = Number(newScan.bodyFat)     - Number(prevScan.bodyFat);
  const lmDelta    = Number(newScan.leanMass)    - Number(prevScan.leanMass);
  const scoreDelta = (newScan.physiqueScore  || 0) - (prevScan.physiqueScore  || 0);
  const symDelta   = (newScan.symmetryScore  || 0) - (prevScan.symmetryScore  || 0);
  const weeklyBF   = bfDelta / weeks;

  const phase = plan?.phase || 'Maintain';
  const expectedWeeklyBF = plan?.engineTrajectory?.weekly_change
    ?? (phase === 'Cut' ? -0.4 : phase === 'Bulk' ? 0.2 : 0);
  const expectedBFDelta = expectedWeeklyBF * weeks;

  // ── Pace assessment ────────────────────────────────────────────────────────
  let pace;
  if (weeks < 2) {
    pace = 'unknown';
  } else if (phase === 'Cut') {
    if (weeklyBF < -0.8)     pace = 'ahead';
    else if (weeklyBF < -0.2) pace = 'on_track';
    else                      pace = 'behind';
  } else if (phase === 'Bulk') {
    if (weeklyBF > 0.5)       pace = 'ahead';
    else if (weeklyBF > 0.05) pace = 'on_track';
    else                      pace = 'behind';
  } else {
    pace = Math.abs(weeklyBF) < 0.2 ? 'on_track' : 'behind';
  }

  const comparison = {
    days_elapsed:      Math.round(days),
    bf_delta:          Math.round(bfDelta       * 10) / 10,
    lm_delta_lbs:      Math.round(lmDelta       * 10) / 10,
    score_delta:       scoreDelta,
    symmetry_delta:    symDelta,
    expected_bf_delta: Math.round(expectedBFDelta * 10) / 10,
    pace_vs_expected:  pace,
  };

  // ── Decision tree ─────────────────────────────────────────────────────────
  if (phase === 'Cut') {
    // Aggressive deficit: losing lean mass
    if (weeklyBF < -1.0 && lmDelta < -2) {
      return {
        decision:   ADAPTATION_DECISIONS.AGGRESSIVE_DEFICIT,
        rationale:  `Deficit is too aggressive — lost ${Math.abs(lmDelta).toFixed(1)} lbs lean mass in ${Math.round(days)} days. Reduce deficit and increase protein.`,
        adjustment: { calories_delta: 150, protein_delta_g: 25 },
        comparison,
      };
    }
    // Pace too fast (but muscle OK)
    if (weeklyBF < -1.2) {
      return {
        decision:   ADAPTATION_DECISIONS.REDUCE_CALORIES,
        rationale:  `Fat loss at ${Math.abs(weeklyBF).toFixed(2)}%/week is unsustainable long-term. Add ~150 kcal to protect muscle.`,
        adjustment: { calories_delta: 150 },
        comparison,
      };
    }
    // Lean mass declining even at moderate pace
    if (lmDelta < -1.5) {
      return {
        decision:   ADAPTATION_DECISIONS.INCREASE_PROTEIN,
        rationale:  `Lean mass declined ${Math.abs(lmDelta).toFixed(1)} lbs. Increase protein by 20–25 g/day to protect muscle during cut.`,
        adjustment: { protein_delta_g: 20 },
        comparison,
      };
    }
    // Plateau: no progress after ≥2 weeks
    if (pace === 'behind' && days >= 14) {
      return {
        decision:  ADAPTATION_DECISIONS.FLAG_PLATEAU,
        rationale: `Fat loss stalled over ${Math.round(days)} days. Consider a structured refeed day or a small caloric reduction.`,
        comparison,
      };
    }
  } else if (phase === 'Bulk') {
    // Gaining fat too fast
    if (weeklyBF > 0.6) {
      return {
        decision:   ADAPTATION_DECISIONS.BULK_TOO_FAST,
        rationale:  `Body fat rising at ${weeklyBF.toFixed(2)}%/week — surplus is too large. Trim ~200 kcal to slow fat accumulation.`,
        adjustment: { calories_delta: -200 },
        comparison,
      };
    }
    // Not gaining muscle despite being in bulk ≥4 weeks
    if (lmDelta < 0.5 && weeks >= 4) {
      return {
        decision:   ADAPTATION_DECISIONS.INCREASE_PROTEIN,
        rationale:  `Lean mass gain is below expected after ${Math.round(days)} days. Confirm protein meets 2–2.5 g/kg of lean mass daily.`,
        adjustment: { protein_delta_g: 20 },
        comparison,
      };
    }
  }

  // ── Default: plan is working ───────────────────────────────────────────────
  return {
    decision:  ADAPTATION_DECISIONS.KEEP_PLAN,
    rationale: `Progress is on track. Continue the ${phase} phase through the next scan checkpoint.`,
    comparison,
  };
}
