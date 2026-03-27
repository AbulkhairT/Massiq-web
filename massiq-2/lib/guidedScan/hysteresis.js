/**
 * Schmitt-style hysteresis + EMA on motion to prevent guidance/capture flicker near thresholds.
 */

/**
 * @param {ReturnType<import('./guidedThresholds.js').getThresholds>} th
 */
export function createHysteresisState() {
  return {
    lightingOn: false,
    fullBodyOn: false,
    distanceBand: /** @type {'far' | 'ok' | 'close'} */ ('ok'),
    centeredOn: false,
    alignmentOn: false,
    stableOn: true,
    motionEma: 0,
    initialized: false,
  };
}

/**
 * @param {object} raw from landmarksToFrameMetrics (raw, pre-hysteresis booleans on raw thresholds)
 * @param {ReturnType<import('./hysteresis.js').createHysteresisState>} state - mutated
 * @param {ReturnType<import('./guidedThresholds.js').getThresholds>} th
 */
export function applyHysteresis(raw, state, th) {
  const b = raw.brightness;

  let lightingOn = state.lightingOn;
  if (lightingOn) {
    lightingOn = b > th.lightExitLow && b < th.lightExitHigh;
  } else {
    lightingOn = b > th.lightEnterLow && b < th.lightEnterHigh;
  }

  let fullBodyOn = state.fullBodyOn;
  const fbs = raw.fullBodyScore ?? 0;
  if (fullBodyOn) {
    fullBodyOn = fbs >= th.fullBodyExitScore;
  } else {
    fullBodyOn = fbs >= th.fullBodyEnterScore;
  }

  const area = raw.bodyBoxRatio;
  let band = state.distanceBand;
  if (!state.initialized) {
    if (area < th.distTooFarRaw) band = 'far';
    else if (area > th.distTooCloseRaw) band = 'close';
    else band = 'ok';
    state.initialized = true;
  } else if (band === 'ok') {
    if (area < th.distExitOkToFar) band = 'far';
    else if (area > th.distExitOkToClose) band = 'close';
  } else if (band === 'far') {
    if (area >= th.distEnterOkFromFar) band = 'ok';
  } else if (band === 'close') {
    if (area <= th.distEnterOkFromClose) band = 'ok';
  }

  const absOff = Math.abs(raw.horizontalOffset);
  let centeredOn = state.centeredOn;
  if (centeredOn) {
    centeredOn = absOff < th.centerExit;
  } else {
    centeredOn = absOff < th.centerEnter;
  }

  let alignmentOn = state.alignmentOn;
  if (alignmentOn) {
    alignmentOn = absOff < th.alignExit && raw.framingPassedRaw !== false;
  } else {
    alignmentOn = absOff < th.alignEnter && !!raw.framingPassedRaw;
  }

  const motionRaw = raw.motion ?? 0;
  const a = th.motionEmaAlpha;
  state.motionEma = state.motionEma * (1 - a) + motionRaw * a;

  let stableOn = state.stableOn;
  if (stableOn) {
    stableOn = state.motionEma < th.stableExitMotion;
  } else {
    stableOn = state.motionEma < th.stableEnterMotion;
  }

  state.lightingOn = lightingOn;
  state.fullBodyOn = fullBodyOn;
  state.distanceBand = band;
  state.centeredOn = centeredOn;
  state.alignmentOn = alignmentOn;
  state.stableOn = stableOn;

  const distanceTooFar = band === 'far';
  const distanceTooClose = band === 'close';
  const distanceOK = band === 'ok';

  const smoothed = {
    ...raw,
    lightingPassed: lightingOn,
    fullBodyVisible: fullBodyOn,
    framingPassed: !!raw.framingPassedRaw && fullBodyOn,
    distanceTooFar,
    distanceTooClose,
    distanceOK,
    centered: centeredOn,
    alignmentPassed: alignmentOn,
    stable: stableOn,
    qualityPassed:
      lightingOn &&
      !!raw.framingPassedRaw &&
      fullBodyOn &&
      distanceOK &&
      centeredOn &&
      alignmentOn &&
      stableOn,
  };

  return smoothed;
}
