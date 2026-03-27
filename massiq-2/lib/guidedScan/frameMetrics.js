/**
 * Browser-side frame metrics for guided body scan (MediaPipe pose + canvas brightness).
 * Landmarks MUST be in mirrored horizontal space (x flipped) so "left/right" matches the mirrored preview.
 *
 * Mirrored preview: landmarks use x' = 1 − x. Positive horizontalOffset → body center right of frame → guide "Move left".
 */

import { getThresholds } from './guidedThresholds.js';

/** Mean linear luma 0..1 from ImageData (RGBA). */
export function computeBrightness(imageData) {
  const d = imageData.data;
  if (!d?.length) return 0.4;
  let sum = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    sum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return n > 0 ? sum / n : 0.4;
}

const IDX = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
  lFoot: 29,
  rFoot: 30,
  lHeel: 31,
  rHeel: 32,
};

/**
 * @param {Array<{x:number,y:number,z?:number,visibility?:number}>|null} landmarks
 * @param {object} opts
 * @param {number} opts.brightness 0..1
 * @param {{ cx: number, cy: number, area: number } | null} opts.prevMotion
 * @param {ReturnType<import('./guidedThresholds.js').getThresholds>} [opts.thresholds]
 */
export function landmarksToFrameMetrics(landmarks, opts = {}) {
  const brightness = typeof opts.brightness === 'number' ? opts.brightness : 0.4;
  const prev = opts.prevMotion || null;
  const th = opts.thresholds || getThresholds();

  const base = {
    brightness,
    bodyBoxRatio: 0,
    centered: false,
    fullBodyVisible: false,
    fullBodyScore: 0,
    poseFront: true,
    poseSide: false,
    framingPassed: false,
    framingPassedRaw: false,
    lightingPassed: false,
    lightingPassedRaw: false,
    alignmentPassed: false,
    alignmentPassedRaw: false,
    distanceOK: false,
    stable: true,
    horizontalOffset: 0,
    qualityPassed: false,
    distanceTooFar: false,
    distanceTooClose: false,
    motion: 0,
    motionSample: null,
  };

  base.lightingPassedRaw = brightness > th.lightEnterLow && brightness < th.lightEnterHigh;

  if (!landmarks || !landmarks.length) {
    base.lightingPassed = base.lightingPassedRaw;
    base.stable = true;
    base.motion = 0;
    return base;
  }

  const vis = (i) => {
    const p = landmarks[i];
    if (!p) return 0;
    return p.visibility != null ? p.visibility : 1;
  };
  const ok = (i) => vis(i) > th.minVisibility;

  const xs = [];
  const ys = [];
  const push = (i) => {
    if (!ok(i)) return;
    const p = landmarks[i];
    xs.push(p.x);
    ys.push(p.y);
  };

  [IDX.nose, IDX.lShoulder, IDX.rShoulder, IDX.lHip, IDX.rHip, IDX.lAnkle, IDX.rAnkle].forEach(push);
  if (xs.length < 4) {
    for (let i = 0; i < landmarks.length; i++) {
      if (vis(i) > 0.35) {
        xs.push(landmarks[i].x);
        ys.push(landmarks[i].y);
      }
    }
  }
  if (xs.length < 3) {
    base.lightingPassed = base.lightingPassedRaw;
    base.motionSample = null;
    base.motion = 0;
    return base;
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bw = maxX - minX;
  const bh = maxY - minY;
  const bodyBoxRatio = Math.max(0, Math.min(1, bw * bh));

  const midX = (minX + maxX) / 2;
  const horizontalOffset = (midX - 0.5) * 2;

  const nose = landmarks[IDX.nose];
  const ankleYs = [IDX.lAnkle, IDX.rAnkle, IDX.lHeel, IDX.rHeel, IDX.lFoot, IDX.rFoot]
    .map((i) => (landmarks[i] && vis(i) > 0.15 ? landmarks[i].y : null))
    .filter((y) => y != null);
  const bottomY = ankleYs.length ? Math.max(...ankleYs) : 0;

  const shouldersOk = vis(IDX.lShoulder) > 0.2 && vis(IDX.rShoulder) > 0.2;
  const hipsOk = vis(IDX.lHip) > 0.15 || vis(IDX.rHip) > 0.15;
  const noseOk = nose && vis(IDX.nose) > 0.15;
  const anklesOk = ankleYs.length >= 1;

  const verticalSpanOk = noseOk && bottomY > th.ankleMinY && nose.y < th.noseMaxY;
  const heightOk = bh > th.minBodyHeight;

  const fullBodyVisibleRaw =
    noseOk &&
    anklesOk &&
    verticalSpanOk &&
    heightOk &&
    (shouldersOk || hipsOk);

  let fullBodyScore = 0;
  if (noseOk) fullBodyScore += 0.22;
  if (anklesOk) fullBodyScore += 0.22;
  if (verticalSpanOk) fullBodyScore += 0.28;
  if (heightOk) fullBodyScore += 0.18;
  if (shouldersOk) fullBodyScore += 0.05;
  if (hipsOk) fullBodyScore += 0.05;
  fullBodyScore = Math.min(1, fullBodyScore);

  const lightingPassed = base.lightingPassedRaw;
  const centeredRaw = Math.abs(horizontalOffset) < th.centerEnter;
  const framingPassedRaw = fullBodyVisibleRaw && bodyBoxRatio > 0.055 && bh > th.minBodyHeight * 0.88;
  const alignmentPassedRaw = Math.abs(horizontalOffset) < th.alignEnter && framingPassedRaw;

  const distanceTooFar = bodyBoxRatio < th.distTooFarRaw;
  const distanceTooClose = bodyBoxRatio > th.distTooCloseRaw;
  const distanceOK = !distanceTooFar && !distanceTooClose;

  const ar = bw / Math.max(bh, 0.001);
  const poseFront = ar > 0.36;
  const poseSide = ar < 0.34 && bh > 0.33;

  const cx = midX;
  const cy = (minY + maxY) / 2;
  const area = bodyBoxRatio;
  let motion = 0;
  if (prev) {
    const dc = Math.hypot(cx - prev.cx, cy - prev.cy);
    const da = Math.abs(area - prev.area);
    motion = dc + da * 0.85;
  }

  const gates =
    lightingPassed &&
    framingPassedRaw &&
    fullBodyVisibleRaw &&
    distanceOK &&
    centeredRaw &&
    alignmentPassedRaw &&
    motion < th.stableEnterMotion;

  return {
    brightness,
    bodyBoxRatio,
    centered: centeredRaw,
    fullBodyVisible: fullBodyVisibleRaw,
    fullBodyScore,
    poseFront,
    poseSide,
    framingPassed: framingPassedRaw,
    framingPassedRaw,
    lightingPassed,
    lightingPassedRaw,
    alignmentPassed: alignmentPassedRaw,
    alignmentPassedRaw,
    distanceOK,
    stable: motion < th.stableEnterMotion,
    horizontalOffset,
    distanceTooFar,
    distanceTooClose,
    qualityPassed: gates,
    motion,
    motionSample: { cx, cy, area: bodyBoxRatio },
  };
}

export function scoresFromMetrics(m) {
  const lighting = m.lightingPassed ? Math.min(1, m.brightness * 1.12) : m.brightness;
  const alignment = m.alignmentPassed && m.centered ? 1 : m.centered ? 0.65 : 0.3;
  const framing = m.framingPassed ? 1 : Math.min(1, m.bodyBoxRatio * 1.4);
  const distance = m.distanceOK ? 1 : Math.min(1, m.bodyBoxRatio * 1.75);
  const stability = m.stable ? 1 : 0.35;
  return { lighting, alignment, framing, distance, stability };
}
