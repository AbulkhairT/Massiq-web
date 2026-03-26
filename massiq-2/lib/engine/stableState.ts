import { runScanDecisionEngine } from './scanDecisionEngine'

type AnyObj = Record<string, any>

function toNum(v: any, fallback: number | null = null): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clampScore(v: any): number | null {
  const n = toNum(v, null)
  if (n == null) return null
  return Math.max(0, Math.min(10, Math.round(n)))
}

function labelConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) return 'high'
  if (score >= 0.55) return 'medium'
  return 'low'
}

function scoreQualityBucket(v: any): number {
  const s = String(v || '').toLowerCase()
  if (s === 'good' || s === 'high') return 0.85
  if (s === 'acceptable' || s === 'medium') return 0.65
  if (s === 'poor' || s === 'low') return 0.35
  return 0.6
}

function labelRobustness(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) return 'high'
  if (score >= 0.58) return 'medium'
  return 'low'
}

export function extractBodySignals(scanResult: AnyObj): AnyObj {
  const low = toNum(scanResult?.bodyFatRange?.low ?? scanResult?.body_fat_low, null)
  const high = toNum(scanResult?.bodyFatRange?.high ?? scanResult?.body_fat_high, null)
  const midpoint = toNum(scanResult?.bodyFatRange?.midpoint, null)
  const bfLow = low ?? (midpoint != null ? midpoint - 0.75 : null)
  const bfHigh = high ?? (midpoint != null ? midpoint + 0.75 : null)

  const quality = scanResult?.photoQuality || {}
  const qualityScore = String(quality?.overall || '').toLowerCase() === 'high' ? 8 : String(quality?.overall || '').toLowerCase() === 'low' ? 4 : 6
  const confidenceRaw = String(scanResult?.confidence || scanResult?.bodyFatConfidence || 'medium').toLowerCase()
  const confidenceScore = confidenceRaw === 'high' ? 0.85 : confidenceRaw === 'low' ? 0.45 : 0.68
  const reliabilityFlags: string[] = []
  const lightingBucket = scoreQualityBucket(quality?.lighting)
  const poseBucket = scoreQualityBucket(quality?.pose)
  const angleBucket = scoreQualityBucket(scanResult?.angleConsistency || quality?.angle || 'medium')
  const backgroundBucket = scoreQualityBucket(scanResult?.backgroundConsistency || quality?.background || 'medium')
  const imageQualityBucket = scoreQualityBucket(scanResult?.imageQuality || quality?.overall || 'medium')
  const bodyCompletenessBucket = scoreQualityBucket(scanResult?.visibleBodyCompleteness || 'medium')
  const confidenceConsistencyBucket = scoreQualityBucket(scanResult?.confidenceConsistencyWithPrior || 'medium')
  if (lightingBucket < 0.5) reliabilityFlags.push('lighting_inconsistent')
  if (poseBucket < 0.5) reliabilityFlags.push('pose_inconsistent')
  if (angleBucket < 0.5) reliabilityFlags.push('angle_inconsistent')
  if (backgroundBucket < 0.5) reliabilityFlags.push('background_shift')
  if (imageQualityBucket < 0.5) reliabilityFlags.push('image_quality_low')
  if (bodyCompletenessBucket < 0.5) reliabilityFlags.push('body_completeness_low')
  if (confidenceConsistencyBucket < 0.5) reliabilityFlags.push('confidence_inconsistent_vs_prior')
  const robustnessScore = Number((
    lightingBucket * 0.18 +
    poseBucket * 0.18 +
    angleBucket * 0.14 +
    backgroundBucket * 0.1 +
    imageQualityBucket * 0.15 +
    bodyCompletenessBucket * 0.15 +
    confidenceConsistencyBucket * 0.1
  ).toFixed(3))

  return {
    body_fat_low: bfLow,
    body_fat_high: bfHigh,
    ab_definition_score: clampScore(scanResult?.muscleGroups?.core === 'well-developed' ? 8 : scanResult?.muscleGroups?.core === 'solid' ? 7 : scanResult?.muscleGroups?.core === 'moderate' ? 6 : scanResult?.muscleGroups?.core === 'early' ? 4 : 3),
    waist_definition_score: clampScore(scanResult?.waistDefinitionScore ?? 6),
    chest_score: clampScore(scanResult?.muscleGroups?.chest === 'well-developed' ? 8 : scanResult?.muscleGroups?.chest === 'solid' ? 7 : scanResult?.muscleGroups?.chest === 'moderate' ? 6 : scanResult?.muscleGroups?.chest === 'early' ? 4 : 3),
    upper_chest_score: clampScore(scanResult?.upperChestScore ?? 5),
    shoulders_score: clampScore(scanResult?.muscleGroups?.shoulders === 'well-developed' ? 8 : scanResult?.muscleGroups?.shoulders === 'solid' ? 7 : scanResult?.muscleGroups?.shoulders === 'moderate' ? 6 : scanResult?.muscleGroups?.shoulders === 'early' ? 4 : 3),
    arms_score: clampScore(scanResult?.muscleGroups?.arms === 'well-developed' ? 8 : scanResult?.muscleGroups?.arms === 'solid' ? 7 : scanResult?.muscleGroups?.arms === 'moderate' ? 6 : scanResult?.muscleGroups?.arms === 'early' ? 4 : 3),
    back_v_taper_score: clampScore(scanResult?.backVTaperScore ?? 6),
    symmetry_score: clampScore(scanResult?.symmetryScore != null ? Number(scanResult.symmetryScore) / 10 : 6),
    lighting_quality_score: clampScore(quality?.lighting === 'good' ? 8 : quality?.lighting === 'poor' ? 3 : qualityScore),
    pose_quality_score: clampScore(quality?.pose === 'good' ? 8 : quality?.pose === 'poor' ? 3 : qualityScore),
    framing_quality_score: clampScore(quality?.framing === 'good' ? 8 : quality?.framing === 'poor' ? 3 : qualityScore),
    mirror_distortion_risk_score: clampScore(scanResult?.mirrorDistortionRiskScore ?? 4),
    flex_bias_score: clampScore(scanResult?.flexBiasScore ?? 5),
    limiting_factors: Array.isArray(scanResult?.weakestGroups) ? scanResult.weakestGroups.slice(0, 5) : [],
    confidence_label: labelConfidence(confidenceScore),
    confidence_score: confidenceScore,
    robustness_score: robustnessScore,
    robustness_label: labelRobustness(robustnessScore),
    reliability_flags: reliabilityFlags,
    signal_payload: scanResult || {},
  }
}

function smooth(prev: number | null, next: number | null, w: number): number | null {
  if (next == null && prev == null) return null
  if (prev == null) return next
  if (next == null) return prev
  return Number((prev * (1 - w) + next * w).toFixed(3))
}

export function stabilizeBodyState({
  previousState,
  previousSignals,
  currentSignals,
  scanId,
  previousScanId,
}: {
  previousState: AnyObj | null
  previousSignals: AnyObj[]
  currentSignals: AnyObj
  scanId?: string | null
  previousScanId?: string | null
}): AnyObj {
  const qualityPenalty =
    (toNum(currentSignals?.lighting_quality_score, 6)! < 4 ? 0.12 : 0) +
    (toNum(currentSignals?.pose_quality_score, 6)! < 4 ? 0.12 : 0) +
    (toNum(currentSignals?.mirror_distortion_risk_score, 4)! > 7 ? 0.15 : 0)

  const rawConf = toNum(currentSignals?.confidence_score, 0.6) || 0.6
  const robustnessScore = toNum(currentSignals?.robustness_score, 0.62) || 0.62
  const robustnessLabel = labelRobustness(robustnessScore)
  const robustnessPenalty = robustnessScore >= 0.8 ? 0 : robustnessScore >= 0.58 ? 0.08 : 0.2
  const effectiveConfidence = Math.max(0, Math.min(1, rawConf - qualityPenalty - robustnessPenalty))

  const prevLow = toNum(previousState?.stable_body_fat_low, null)
  const prevHigh = toNum(previousState?.stable_body_fat_high, null)
  const curLow = toNum(currentSignals?.body_fat_low, null)
  const curHigh = toNum(currentSignals?.body_fat_high, null)
  const midPrev = prevLow != null && prevHigh != null ? (prevLow + prevHigh) / 2 : null
  const midCur = curLow != null && curHigh != null ? (curLow + curHigh) / 2 : null
  const bfShift = midPrev != null && midCur != null ? Math.abs(midCur - midPrev) : 0
  const changeThreshold = robustnessScore < 0.58 ? 1.9 : robustnessScore < 0.8 ? 1.45 : 1.25
  const meaningfulBodyFatChange = bfShift > changeThreshold && effectiveConfidence > 0.72
  const w = meaningfulBodyFatChange ? 0.62 : 0.2

  const limiting = Array.isArray(currentSignals?.limiting_factors) ? currentSignals.limiting_factors : []
  const previousPrimary = previousState?.primary_limiting_factor || null
  const primaryLimitingFactor =
    limiting[0] ||
    previousPrimary ||
    (Array.isArray(previousSignals) && previousSignals[0]?.limiting_factors?.[0]) ||
    null

  const state = {
    based_on_scan_id: scanId || null,
    previous_scan_id: previousScanId || previousState?.based_on_scan_id || null,
    stable_body_fat_low: smooth(prevLow, curLow, w),
    stable_body_fat_high: smooth(prevHigh, curHigh, w),
    stable_lean_mass_kg: smooth(toNum(previousState?.stable_lean_mass_kg, null), toNum(currentSignals?.signal_payload?.leanMass, null) != null ? (toNum(currentSignals?.signal_payload?.leanMass, null)! * 0.453592) : null, w),
    stable_ab_definition_score: smooth(toNum(previousState?.stable_ab_definition_score, null), toNum(currentSignals?.ab_definition_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    stable_waist_definition_score: smooth(toNum(previousState?.stable_waist_definition_score, null), toNum(currentSignals?.waist_definition_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    stable_chest_score: smooth(toNum(previousState?.stable_chest_score, null), toNum(currentSignals?.chest_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    stable_upper_chest_score: smooth(toNum(previousState?.stable_upper_chest_score, null), toNum(currentSignals?.upper_chest_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    stable_shoulders_score: smooth(toNum(previousState?.stable_shoulders_score, null), toNum(currentSignals?.shoulders_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    stable_arms_score: smooth(toNum(previousState?.stable_arms_score, null), toNum(currentSignals?.arms_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    stable_symmetry_score: smooth(toNum(previousState?.stable_symmetry_score, null), toNum(currentSignals?.symmetry_score, null), Math.max(0.2, effectiveConfidence * 0.7)),
    primary_limiting_factor: primaryLimitingFactor,
    secondary_limiting_factors: limiting.slice(1, 3),
    state_confidence_score: Number(effectiveConfidence.toFixed(3)),
    state_confidence_label: labelConfidence(effectiveConfidence),
    last_meaningful_change_at: meaningfulBodyFatChange ? new Date().toISOString() : previousState?.last_meaningful_change_at || null,
    stabilization_notes: meaningfulBodyFatChange ? 'meaningful_change' : 'noise_suppressed_or_soft_update',
    state_payload: {
      effective_confidence: effectiveConfidence,
      quality_penalty: qualityPenalty,
      robustness_score: robustnessScore,
      robustness_label: robustnessLabel,
      reliability_flags: Array.isArray(currentSignals?.reliability_flags) ? currentSignals.reliability_flags : [],
      robustness_penalty: robustnessPenalty,
      body_fat_shift: bfShift,
      body_fat_change_threshold: changeThreshold,
      meaningful_body_fat_change: meaningfulBodyFatChange,
    },
    updated_at: new Date().toISOString(),
  }

  console.info('[stable-state] confidence', {
    raw_confidence: rawConf,
    effective_confidence: effectiveConfidence,
    quality_penalty: qualityPenalty,
    robustness_score: robustnessScore,
    robustness_label: robustnessLabel,
    robustness_penalty: robustnessPenalty,
    reliability_flags: currentSignals?.reliability_flags || [],
  })
  console.info('[stable-state] change-eval', { body_fat_shift: bfShift, meaningful_body_fat_change: meaningfulBodyFatChange, notes: state.stabilization_notes })
  return state
}

export function buildStableComparison({
  previousState,
  currentState,
}: {
  previousState: AnyObj | null
  currentState: AnyObj
}): AnyObj {
  const prevMid =
    toNum(previousState?.stable_body_fat_low, null) != null && toNum(previousState?.stable_body_fat_high, null) != null
      ? ((toNum(previousState?.stable_body_fat_low, 0) || 0) + (toNum(previousState?.stable_body_fat_high, 0) || 0)) / 2
      : null
  const curMid =
    toNum(currentState?.stable_body_fat_low, null) != null && toNum(currentState?.stable_body_fat_high, null) != null
      ? ((toNum(currentState?.stable_body_fat_low, 0) || 0) + (toNum(currentState?.stable_body_fat_high, 0) || 0)) / 2
      : null
  const bfDelta = prevMid != null && curMid != null ? Number((curMid - prevMid).toFixed(2)) : null
  const leanDelta =
    toNum(previousState?.stable_lean_mass_kg, null) != null && toNum(currentState?.stable_lean_mass_kg, null) != null
      ? Number(((toNum(currentState?.stable_lean_mass_kg, 0) || 0) - (toNum(previousState?.stable_lean_mass_kg, 0) || 0)).toFixed(3))
      : null
  const meaningful = Math.abs(bfDelta || 0) > 0.8 || Math.abs(leanDelta || 0) > 0.45
  const summary = meaningful ? 'Meaningful stable-state change detected.' : 'No meaningful stable-state change (likely scan noise or minor variation).'
  return {
    bodyFatDelta: bfDelta,
    leanMassDeltaKg: leanDelta,
    comparisonConfidence: currentState?.state_confidence_label || 'medium',
    meaningfulChange: meaningful,
    summary,
    improvedAreas: (bfDelta != null && bfDelta < -0.4 ? ['body_fat'] : []).concat(leanDelta != null && leanDelta > 0.15 ? ['lean_mass'] : []),
    worsenedAreas: (bfDelta != null && bfDelta > 0.4 ? ['body_fat'] : []).concat(leanDelta != null && leanDelta < -0.15 ? ['lean_mass'] : []),
  }
}

export function buildDecisionEngineInput({
  profile,
  currentPlan,
  stabilizedBodyState,
  latestSignals,
  recentFoodSummary,
  previousScan,
}: AnyObj): AnyObj {
  const bodyFatMid =
    toNum(stabilizedBodyState?.stable_body_fat_low, null) != null && toNum(stabilizedBodyState?.stable_body_fat_high, null) != null
      ? (((toNum(stabilizedBodyState?.stable_body_fat_low, 0) || 0) + (toNum(stabilizedBodyState?.stable_body_fat_high, 0) || 0)) / 2)
      : null
  const leanMassLbs = toNum(stabilizedBodyState?.stable_lean_mass_kg, null) != null ? (toNum(stabilizedBodyState?.stable_lean_mass_kg, 0) || 0) * 2.20462 : null
  const stableConfidence = toNum(stabilizedBodyState?.state_confidence_score, 0.6) || 0.6
  const planPhase = String(currentPlan?.phase || profile?.goal || 'Maintain')
  const targetBF = toNum(currentPlan?.targetBF ?? profile?.targetBF, bodyFatMid)
  const bfGap = bodyFatMid != null && targetBF != null ? Number((bodyFatMid - targetBF).toFixed(3)) : null
  const rawMid = toNum(latestSignals?.body_fat_low, null) != null && toNum(latestSignals?.body_fat_high, null) != null
    ? (((toNum(latestSignals?.body_fat_low, 0) || 0) + (toNum(latestSignals?.body_fat_high, 0) || 0)) / 2)
    : null
  const rawGap = rawMid != null && targetBF != null ? Number((rawMid - targetBF).toFixed(3)) : null
  return {
    profile,
    latestScan: {
      date: new Date().toISOString().slice(0, 10),
      bodyFat: bodyFatMid,
      bodyFatPct: bodyFatMid,
      leanMass: leanMassLbs,
      symmetryScore: toNum(stabilizedBodyState?.stable_symmetry_score, null),
      confidence: stabilizedBodyState?.state_confidence_label || 'medium',
      weakestGroups: Array.isArray(latestSignals?.limiting_factors) ? latestSignals.limiting_factors : [],
    },
    previousScan: previousScan || null,
    currentPlan: currentPlan || null,
    scanResult: {
      limitingFactor: stabilizedBodyState?.primary_limiting_factor || null,
      weakestGroups: Array.isArray(latestSignals?.limiting_factors) ? latestSignals.limiting_factors : [],
      diagnosis: stabilizedBodyState?.stabilization_notes || null,
      foodTrend: recentFoodSummary || null,
    },
    adherenceContext: {
      ...(recentFoodSummary?.adherenceContext || {}),
      stable_state_confidence: stabilizedBodyState?.state_confidence_score ?? null,
    },
    stableEvidence: {
      prior_phase: planPhase,
      stable_confidence: stableConfidence,
      stable_bf_midpoint: bodyFatMid,
      raw_bf_midpoint: rawMid,
      target_bf: targetBF,
      stable_bf_gap: bfGap,
      raw_bf_gap: rawGap,
      limiting_factor: stabilizedBodyState?.primary_limiting_factor || null,
      limiting_factor_persistence: Boolean(stabilizedBodyState?.primary_limiting_factor),
      meaningful_change: Boolean(stabilizedBodyState?.state_payload?.meaningful_body_fat_change),
      robustness_score: toNum(stabilizedBodyState?.state_payload?.robustness_score, toNum(latestSignals?.robustness_score, 0.62)),
      robustness_label: stabilizedBodyState?.state_payload?.robustness_label || latestSignals?.robustness_label || null,
      reliability_flags: Array.isArray(stabilizedBodyState?.state_payload?.reliability_flags)
        ? stabilizedBodyState.state_payload.reliability_flags
        : (Array.isArray(latestSignals?.reliability_flags) ? latestSignals.reliability_flags : []),
      evidence_history: Array.isArray(recentFoodSummary?.evidence_history) ? recentFoodSummary.evidence_history : [],
      nutrition_adherence: recentFoodSummary?.adherenceContext || {},
    },
  }
}

function toPhase(p: any): 'Cut' | 'Bulk' | 'Recomp' | 'Maintain' {
  const s = String(p || '').toLowerCase()
  if (s === 'cut') return 'Cut'
  if (s === 'bulk') return 'Bulk'
  if (s === 'recomp') return 'Recomp'
  return 'Maintain'
}

function countUnfavorableModerateTrends(history: AnyObj[]): number {
  return (history || []).filter((x) => {
    const delta = toNum(x?.bf_gap_delta ?? x?.bf_delta ?? x?.bfGapDelta, 0) || 0
    const conf = toNum(x?.confidence ?? x?.effective_confidence, 0) || 0
    return delta >= 0.6 && conf >= 0.6
  }).length
}

function applyPhaseOverrideForAdverseEvidence(decision: AnyObj, input: AnyObj): AnyObj {
  const evidence = input?.stableEvidence || {}
  const priorPhase = toPhase(evidence?.prior_phase)
  const stableConfidence = toNum(evidence?.stable_confidence, 0.6) || 0.6
  const stableGap = toNum(evidence?.stable_bf_gap, null)
  const rawGap = toNum(evidence?.raw_bf_gap, null)
  const meaningfulChange = Boolean(evidence?.meaningful_change)
  const robustnessScore = toNum(evidence?.robustness_score, 0.62) || 0.62
  const limitingPersistent = Boolean(evidence?.limiting_factor_persistence)
  const unfavorableCount = countUnfavorableModerateTrends(evidence?.evidence_history || [])
  const skippedMeals = toNum(evidence?.nutrition_adherence?.skipped_meals_per_week_estimate, 0) || 0
  const weekendSlip = toNum(evidence?.nutrition_adherence?.weekend_slip_score, 0) || 0

  let overridePhase: 'Cut' | 'Bulk' | 'Recomp' | 'Maintain' | null = null
  let overrideRule: string | null = null

  const confidenceWeightedBfIncrease = (Math.max(0, stableGap || 0) * stableConfidence)
  const robustnessAllowsOverride = robustnessScore >= 0.58
  const strongHighConfidenceAdverse =
    robustnessAllowsOverride &&
    meaningfulChange &&
    stableConfidence >= 0.8 &&
    (((stableGap != null && stableGap >= 2.8) && (rawGap != null && rawGap >= 4.5)) || confidenceWeightedBfIncrease >= 2.6)
  const repeatedUnfavorableTrend =
    robustnessAllowsOverride &&
    unfavorableCount >= 2 &&
    stableConfidence >= 0.62 &&
    stableGap != null &&
    stableGap >= 2.0
  const deteriorationRelativeToGoal =
    robustnessAllowsOverride &&
    priorPhase === 'Bulk' &&
    stableGap != null &&
    stableGap >= 2.6 &&
    (meaningfulChange || unfavorableCount >= 2)
  const adherenceRiskEscalation =
    robustnessAllowsOverride &&
    (skippedMeals >= 9 || weekendSlip >= 0.58) &&
    stableGap != null &&
    stableGap >= 2.4

  if (priorPhase === 'Bulk') {
    if (strongHighConfidenceAdverse) {
      overridePhase = (stableGap != null && stableGap >= 4.2) ? 'Cut' : 'Recomp'
      overrideRule = 'bulk_high_confidence_material_adverse_change'
    } else if (repeatedUnfavorableTrend || deteriorationRelativeToGoal || (adherenceRiskEscalation && limitingPersistent)) {
      overridePhase = 'Recomp'
      overrideRule = repeatedUnfavorableTrend
        ? 'bulk_repeated_unfavorable_trend'
        : adherenceRiskEscalation
          ? 'bulk_adherence_risk_with_deterioration'
          : 'bulk_deterioration_relative_to_goal'
    }
  }

  const currentPhase = toPhase(decision?.phase_decision?.recommended_phase)
  const changed = Boolean(overridePhase && overridePhase !== currentPhase)
  if (changed) {
    decision.phase_decision = {
      ...decision.phase_decision,
      previous_phase: currentPhase,
      recommended_phase: overridePhase,
      reason: `Phase override (${overrideRule}): strong adverse composition evidence exceeded inertia thresholds.`,
      rationale: `Phase override (${overrideRule}): strong adverse composition evidence exceeded inertia thresholds.`,
      confidence: stableConfidence >= 0.8 ? 'high' : 'medium',
    }
    decision.stable_state_override = {
      applied: true,
      rule: overrideRule,
      prior_phase: currentPhase,
      new_phase: overridePhase,
      confidence_weighted_bf_increase: Number(confidenceWeightedBfIncrease.toFixed(3)),
      repeated_unfavorable_trend_count: unfavorableCount,
      stable_bf_gap: stableGap,
      raw_bf_gap: rawGap,
      effective_confidence: stableConfidence,
      robustness_score: robustnessScore,
      limiting_factor_persistence: limitingPersistent,
      meaningful_change: meaningfulChange,
    }
  } else {
    decision.stable_state_override = {
      applied: false,
      reason: 'inertia_preserved',
      prior_phase: currentPhase,
      effective_confidence: stableConfidence,
      robustness_score: robustnessScore,
      confidence_weighted_bf_increase: Number(confidenceWeightedBfIncrease.toFixed(3)),
      repeated_unfavorable_trend_count: unfavorableCount,
      stable_bf_gap: stableGap,
      raw_bf_gap: rawGap,
      meaningful_change: meaningfulChange,
    }
  }

  console.info('[stable-decision:phase-evidence]', {
    prior_phase: priorPhase,
    stable_bf_gap: stableGap,
    raw_bf_gap: rawGap,
    effective_confidence: stableConfidence,
    robustness_score: robustnessScore,
    confidence_weighted_bf_increase: Number(confidenceWeightedBfIncrease.toFixed(3)),
    repeated_unfavorable_trend_count: unfavorableCount,
    limiting_factor_persistence: limitingPersistent,
    meaningful_change: meaningfulChange,
    override_applied: decision?.stable_state_override?.applied,
    override_rule: decision?.stable_state_override?.rule || decision?.stable_state_override?.reason,
  })
  return decision
}

export function runDecisionEngineOnStableState(input: AnyObj): AnyObj {
  const base = runScanDecisionEngine(input as any)
  const out = applyPhaseOverrideForAdverseEvidence(base, input)
  console.info('[stable-decision] phase', {
    recommended_phase: out?.phase_decision?.recommended_phase,
    confidence: out?.phase_decision?.confidence,
    primary_limiting_factor: input?.scanResult?.limitingFactor || null,
    prior_phase: input?.stableEvidence?.prior_phase || null,
    override_applied: out?.stable_state_override?.applied || false,
    override_rule: out?.stable_state_override?.rule || out?.stable_state_override?.reason || null,
  })
  return out
}
