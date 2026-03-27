/**
 * Port of MassIQ physique sanitization — must stay aligned with components/MassIQ.jsx
 */
import { computePhysiqueScore, SCORING_VERSION } from '../engine/scoring';
import { getBF } from './scanBf';
import { getPhysiqueTier, getPhysiqueReinforcement, estimateStagePercentile } from './physiqueLabels';

export function smoothPhysiqueScoreForNoise({
  rawScore,
  previousScore,
  bodyFatPct,
  previousBodyFatPct,
  leanMassLbs,
  previousLeanMassLbs,
  meaningfulChange = false,
}) {
  const next = Number(rawScore);
  const prev = Number(previousScore);
  if (!Number.isFinite(next) || !Number.isFinite(prev)) {
    return { score: Number.isFinite(next) ? next : rawScore, applied: false, reason: 'missing_scores' };
  }
  const bfDelta = Number(bodyFatPct) - Number(previousBodyFatPct);
  const leanMassDeltaLbs = Number(leanMassLbs) - Number(previousLeanMassLbs);
  const leanMassDeltaKg = leanMassDeltaLbs * 0.453592;
  const noiseBand = Math.abs(bfDelta) < 0.5 && Math.abs(leanMassDeltaKg) < 0.3;
  if (meaningfulChange || !noiseBand) {
    return { score: next, applied: false, reason: meaningfulChange ? 'meaningful_change' : 'composition_change' };
  }
  const cappedDelta = Math.max(-2, Math.min(2, next - prev));
  const smoothed = Math.round(prev + cappedDelta);
  return {
    score: smoothed,
    applied: smoothed !== next,
    reason: 'noise_guard',
    bfDelta: Number(bfDelta.toFixed(2)),
    leanMassDeltaKg: Number(leanMassDeltaKg.toFixed(3)),
  };
}

export function sanitizeScanData(scan, profile, options = {}) {
  if (!scan) return scan;
  const previousScan = options?.previousScan || null;
  const meaningfulChange = Boolean(options?.meaningfulChange);
  const bfLow = Number(scan.bodyFatRange?.low || 0);
  const bfHigh = Number(scan.bodyFatRange?.high || 0);
  const bfMid = bfLow && bfHigh ? (bfLow + bfHigh) / 2 : 0;
  const rawBf = bfMid || Number(scan.bodyFatPct || scan.bodyFat || (profile?.gender === 'Female' ? 28 : 20));
  const bodyFatPct = Math.min(55, Math.max(4, rawBf));
  const bodyFatRange = bfLow && bfHigh
    ? { low: Math.max(4, bfLow), high: Math.min(55, bfHigh), midpoint: Number(bodyFatPct.toFixed(1)) }
    : { low: Math.max(4, bodyFatPct - 2), high: Math.min(55, bodyFatPct + 2), midpoint: Number(bodyFatPct.toFixed(1)) };
  const weight = Number(profile?.weightLbs || 180);
  const computedLeanMass = weight * (1 - bodyFatPct / 100);
  const leanMass = Number(Math.min(weight * 0.96, Math.max(weight * 0.35, computedLeanMass)).toFixed(1));
  const confidence = ['low', 'medium', 'high'].includes(scan.bodyFatConfidence || scan.confidence)
    ? (scan.bodyFatConfidence || scan.confidence)
    : 'medium';
  const heightCm = profile?.heightCm || (profile?.heightIn ? Math.round(Number(profile.heightIn) * 2.54) : 170);
  const claudeRawScore = Number(scan.physiqueScore || scan.overallPhysiqueScore || scan.score || 60);
  const claudeRawSymmetry = Number(scan.symmetryScore || 75);
  const scored = computePhysiqueScore({
    bodyFatPct,
    leanMassLbs: leanMass,
    heightCm,
    gender: profile?.gender || 'Male',
    claudeScore: claudeRawScore,
    claudeSymmetry: claudeRawSymmetry,
    confidence,
  });
  const rawPhysiqueScore = scored.physiqueScore;
  const smoothed = smoothPhysiqueScoreForNoise({
    rawScore: rawPhysiqueScore,
    previousScore: previousScan?.physiqueScore,
    bodyFatPct,
    previousBodyFatPct: getBF(previousScan),
    leanMassLbs: leanMass,
    previousLeanMassLbs: previousScan?.leanMass,
    meaningfulChange,
  });
  const finalScore = Number(smoothed.score);
  const tier = getPhysiqueTier(finalScore);
  const percentile = estimateStagePercentile(finalScore, tier);

  return {
    ...scan,
    bodyFatPct: Number(bodyFatPct.toFixed(1)),
    bodyFatRange,
    bodyFatConfidence: confidence,
    bodyFatReasoning: scan.bodyFatReasoning || '',
    leanMass: Number(leanMass.toFixed(1)),
    leanMassTrend: ['gaining', 'losing', 'maintaining', 'unknown'].includes(scan.leanMassTrend) ? scan.leanMassTrend : 'unknown',
    physiqueScore: finalScore,
    symmetryScore: scored.symmetryScore,
    ffmi: scored.ffmi,
    scoringBreakdown: scored.breakdown,
    scoringVersion: SCORING_VERSION,
    physiqueTier: tier,
    physiqueLabel: `${finalScore} - ${tier} Physique`,
    physiqueContext:
      'This score reflects how optimized your physique is (body fat, muscle balance, and definition), not overall health or attractiveness.',
    physiqueReinforcement: getPhysiqueReinforcement(tier),
    stagePercentile: percentile,
    scoreSmoothing: {
      rawScore: rawPhysiqueScore,
      finalScore,
      applied: smoothed.applied,
      reason: smoothed.reason,
      bfDelta: smoothed.bfDelta ?? null,
      leanMassDeltaKg: smoothed.leanMassDeltaKg ?? null,
    },
    symmetryDetails: scan.symmetryDetails || '',
    confidence,
    limitingFactor: scan.limitingFactor || '',
    limitingFactorExplanation: scan.limitingFactorExplanation || '',
    photoQualityIssues: Array.isArray(scan.photoQualityIssues) ? scan.photoQualityIssues : [],
    trainingFocus: scan.trainingFocus || null,
    nutritionKeyChange: scan.nutritionKeyChange || '',
  };
}
