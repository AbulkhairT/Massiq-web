/**
 * Guided body scan — all tunable thresholds in one place.
 *
 * Mirror preview: landmarks are x-flipped before metrics (see GuidedBodyScanModal).
 * "Move left" = move your body to YOUR left as you see yourself in the mirrored feed
 * (decreases horizontalOffset in mirrored normalized space).
 *
 * @see ../guidedScan/QA.md for live-testing notes (if present)
 */

/** @returns {'compact' | 'desktop'} */
export function getViewportProfile() {
  if (typeof window === 'undefined') return 'desktop';
  const sw = window.screen?.width ?? window.innerWidth;
  const sh = window.screen?.height ?? window.innerHeight;
  const shortSide = Math.min(sw, sh);
  const longSide = Math.max(sw, sh);
  // Phones / small tablets in portrait or landscape
  if (shortSide <= 520 || (longSide <= 900 && shortSide <= 600)) return 'compact';
  return 'desktop';
}

/**
 * Distance (body box area = width*height in normalized [0,1]) bands.
 * Compact viewports often show a smaller normalized figure (farther hold) — slightly relax "too far".
 */
export function getThresholds(profile = getViewportProfile()) {
  const compact = profile === 'compact';
  return {
    profile,

    // Brightness (raw 0–1); hysteresis applied in hysteresis.js
    lightEnterLow: 0.23,
    lightExitLow: 0.19,
    lightEnterHigh: 0.93,
    lightExitHigh: 0.96,

    // Full body: geometry + fullBodyScore (0–1); hysteresis on score
    fullBodyEnterScore: compact ? 0.62 : 0.68,
    fullBodyExitScore: compact ? 0.52 : 0.58,
    noseMaxY: compact ? 0.32 : 0.28,
    ankleMinY: compact ? 0.68 : 0.72,
    minBodyHeight: compact ? 0.4 : 0.44,
    minVisibility: 0.22,

    // Distance bands (bodyBoxRatio = bbox width * height)
    distTooFarRaw: compact ? 0.085 : 0.095,
    distTooCloseRaw: compact ? 0.54 : 0.48,
    // Hysteresis: re-enter "ok" from far/close (wider dead zone = less jitter)
    distEnterOkFromFar: compact ? 0.11 : 0.12,
    distExitOkToFar: compact ? 0.09 : 0.095,
    distEnterOkFromClose: compact ? 0.5 : 0.45,
    distExitOkToClose: compact ? 0.52 : 0.48,

    // Horizontal (mirrored space): guidance uses wider bands than capture
    offsetGuidanceStrong: 0.2,
    offsetGuidanceAlign: 0.14,
    centerEnter: 0.13,
    centerExit: 0.17,
    alignEnter: 0.11,
    alignExit: 0.15,

    // Stability: motion = Δcenter + 0.85*Δarea (normalized)
    stableEnterMotion: 0.048,
    stableExitMotion: 0.068,
    motionEmaAlpha: 0.22,
  };
}

export const DEFAULT_THRESHOLDS_DESKTOP = getThresholds('desktop');
export const DEFAULT_THRESHOLDS_COMPACT = getThresholds('compact');
