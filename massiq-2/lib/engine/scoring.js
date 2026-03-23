/**
 * Deterministic physique scoring — v1.0.0
 *
 * Produces a physique_score (0–99) and symmetry_score (0–100) from
 * measurable physiological inputs.  Claude's visual estimate is ONE
 * component; it cannot inflate or fabricate a score on its own.
 *
 * Components
 * ──────────────────────────────────────────────────
 *   body_composition  (max 35 pts)  BF% vs gender-specific ideal range
 *   muscularity       (max 30 pts)  FFMI (fat-free mass index)
 *   visual_quality    (max 20 pts)  Claude raw score, re-scaled
 *   confidence_bonus  (–5 to +5)   low-confidence scans are penalised
 * ──────────────────────────────────────────────────
 * Total: 0–90 raw → clamped 20–99 final.
 */

export const SCORING_VERSION = '1.0.0';

// Gender-specific ideal BF% windows
const BF_IDEAL = {
  Male:   { excellent: [6, 12],  good: [12, 18], fair: [18, 25] },
  Female: { excellent: [14, 22], good: [22, 28], fair: [28, 35] },
};

function bodyCompositionScore(bf, gender) {
  const ranges = BF_IDEAL[gender] ?? BF_IDEAL.Male;
  const { excellent, good, fair } = ranges;

  if (bf <= excellent[0]) {
    // Very lean — high score but slight penalty for sub-clinical leanness
    return Math.max(28, Math.round(35 - (excellent[0] - bf) * 1.5));
  }
  if (bf <= excellent[1]) return 35;
  if (bf <= good[1]) {
    const t = (bf - excellent[1]) / (good[1] - excellent[1]);
    return Math.round(35 - t * 10); // 35 → 25
  }
  if (bf <= fair[1]) {
    const t = (bf - good[1]) / (fair[1] - good[1]);
    return Math.round(25 - t * 13); // 25 → 12
  }
  const t = Math.min(1, (bf - fair[1]) / 15);
  return Math.round(12 - t * 12); // 12 → 0
}

function ffmiScore(leanMassLbs, heightCm, gender) {
  const leanMassKg = leanMassLbs * 0.453592;
  const heightM    = (heightCm > 0 ? heightCm : 170) / 100;
  const ffmi       = leanMassKg / (heightM * heightM);

  // Reference bands; females shift all thresholds down by 2
  const off = gender === 'Female' ? 2 : 0;
  const b = {
    low:   18 - off, // untrained baseline
    avg:   20 - off, // average active person
    good:  23 - off, // trained
    great: 25 - off, // advanced
    elite: 28 - off, // near natural ceiling
  };

  let score;
  if      (ffmi >= b.elite) score = 30;
  else if (ffmi >= b.great) score = Math.round(24 + ((ffmi - b.great) / (b.elite - b.great)) * 6);
  else if (ffmi >= b.good)  score = Math.round(17 + ((ffmi - b.good)  / (b.great - b.good))  * 7);
  else if (ffmi >= b.avg)   score = Math.round(10 + ((ffmi - b.avg)   / (b.good  - b.avg))   * 7);
  else if (ffmi >= b.low)   score = Math.round(4  + ((ffmi - b.low)   / (b.avg   - b.low))   * 6);
  else                      score = Math.max(0, Math.round(4 * (ffmi / b.low)));

  return { score, ffmi: Math.round(ffmi * 10) / 10 };
}

function visualAssessmentScore(claudeRaw) {
  // Claude returns 30–95; remap to 0–20 contribution
  return Math.round(Math.max(0, Math.min(20, ((claudeRaw - 30) / 65) * 20)));
}

function confidenceBonus(confidence) {
  if (confidence === 'high')   return 5;
  if (confidence === 'medium') return 0;
  if (confidence === 'low')    return -5;
  return 0;
}

/**
 * Compute deterministic physique and symmetry scores.
 *
 * @param {object} input
 * @param {number}  input.bodyFatPct      – 4–55
 * @param {number}  input.leanMassLbs     – pounds (always internal lbs)
 * @param {number}  input.heightCm        – centimetres
 * @param {string}  input.gender          – 'Male' | 'Female'
 * @param {number}  input.claudeScore     – raw Claude visual score (30–95)
 * @param {number}  input.claudeSymmetry  – raw Claude symmetry score (60–95)
 * @param {string}  input.confidence      – 'low' | 'medium' | 'high'
 *
 * @returns {{ physiqueScore: number, symmetryScore: number, ffmi: number, breakdown: object }}
 */
export function computePhysiqueScore({
  bodyFatPct,
  leanMassLbs,
  heightCm,
  gender,
  claudeScore,
  claudeSymmetry,
  confidence,
}) {
  const bcPts                  = bodyCompositionScore(bodyFatPct, gender);
  const { score: muscPts, ffmi } = ffmiScore(leanMassLbs, heightCm, gender);
  const visPts                 = visualAssessmentScore(claudeScore ?? 60);
  const confPts                = confidenceBonus(confidence);

  const raw           = bcPts + muscPts + visPts + confPts;
  const physiqueScore = Math.min(99, Math.max(20, Math.round(raw)));

  // Symmetry: confidence-weight Claude's reading toward neutral 70 when low
  const rawSym       = Math.min(100, Math.max(0, Math.round(claudeSymmetry ?? 70)));
  const symmetryScore = confidence === 'low'
    ? Math.round(rawSym * 0.65 + 70 * 0.35)
    : rawSym;

  return {
    physiqueScore,
    symmetryScore,
    ffmi,
    breakdown: {
      bodyComposition:  bcPts,
      muscularity:      muscPts,
      visualAssessment: visPts,
      confidenceBonus:  confPts,
    },
  };
}
