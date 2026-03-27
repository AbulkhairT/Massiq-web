/**
 * Single primary guidance line from current metrics (priority order).
 * Metrics MUST be in mirrored landmark space (see GuidedBodyScanModal + frameMetrics).
 *
 * Mirrored UX: positive horizontalOffset → body center is right of frame center → user moves left to center.
 */

import { getThresholds } from './guidedThresholds.js';

/** @param {Record<string, any>} m @param {ReturnType<typeof getThresholds>} [th] */
export function primaryGuidance(m, th) {
  const t = th || getThresholds();

  if (!m.lightingPassed) {
    if (m.brightness < t.lightEnterLow) return 'Too dark — add light';
    if (m.brightness > t.lightEnterHigh) return 'Too bright — reduce glare';
    return 'Adjust lighting';
  }

  if (!m.fullBodyVisible) return 'Step back — show full body';

  if (m.distanceTooFar) return 'Move closer';

  if (m.distanceTooClose) return 'Step back — show full body';

  if (m.horizontalOffset > t.offsetGuidanceStrong) return 'Move left';
  if (m.horizontalOffset < -t.offsetGuidanceStrong) return 'Move right';

  if (
    Math.abs(m.horizontalOffset) > t.offsetGuidanceAlign &&
    Math.abs(m.horizontalOffset) <= t.offsetGuidanceStrong
  ) {
    return 'Align with silhouette';
  }

  if (!m.stable) return 'Hold still';

  if (!m.alignmentPassed || !m.centered) return 'Align with silhouette';

  if (!m.framingPassed || !m.distanceOK) return 'Step back — show full body';

  const gates =
    m.lightingPassed &&
    m.framingPassed &&
    m.fullBodyVisible &&
    m.distanceOK &&
    m.centered &&
    m.alignmentPassed &&
    m.stable;

  if (gates) return 'Hold still — capture';

  return 'Adjust position';
}

/** All gates required before capture (matches hysteresis qualityPassed when smoothed). */
export function captureAllowed(m) {
  if (typeof m.qualityPassed === 'boolean') return m.qualityPassed;
  return !!(
    m.lightingPassed &&
    m.framingPassed &&
    m.fullBodyVisible &&
    m.distanceOK &&
    m.centered &&
    m.alignmentPassed &&
    m.stable
  );
}
