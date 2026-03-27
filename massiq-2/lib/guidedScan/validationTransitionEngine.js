/**
 * Emits scan_capture_events only on meaningful state transitions (no per-frame spam).
 * Mirrors ios/GuidedBodyScan ValidationTransitionEngine logic.
 *
 * Horizontal zones use mirrored landmark space: positive offset → body right of center → user should move left.
 */

import { scoresFromMetrics } from './frameMetrics.js';
import { getThresholds } from './guidedThresholds.js';

export function createValidationTransitionEngine() {
  let seenGuidedStart = false;
  const last = {};
  let lastNeedMoveLeft = false;
  let lastNeedMoveRight = false;

  return {
    reset() {
      Object.keys(last).forEach((k) => delete last[k]);
      seenGuidedStart = false;
      lastNeedMoveLeft = false;
      lastNeedMoveRight = false;
    },

    /**
     * @returns {Array<{ type: string, payload: object }>}
     */
    eventsOnChange(metrics, captureEnabled, userId, sessionId) {
      const th = getThresholds();
      const s = scoresFromMetrics(metrics);
      const payload = {
        brightness: metrics.brightness,
        body_box_ratio: metrics.bodyBoxRatio,
        centered: metrics.centered,
        horizontal_offset: metrics.horizontalOffset,
        pose_front: metrics.poseFront,
        pose_side: metrics.poseSide,
        full_body_visible: metrics.fullBodyVisible,
        lighting_score: s.lighting,
        alignment_score: s.alignment,
        framing_score: s.framing,
        distance_score: s.distance,
        stability_score: s.stability,
        user_id: userId,
        capture_session_id: sessionId,
      };

      const out = [];

      if (!seenGuidedStart) {
        seenGuidedStart = true;
        out.push({ type: 'guided_scan_started', payload });
      }

      function flip(key, v, onTrue, onFalse) {
        if (last[key] === v) return;
        last[key] = v;
        out.push({ type: v ? onTrue : onFalse, payload });
      }

      flip('lp', metrics.lightingPassed, 'lighting_passed', 'too_dark');
      flip('fp', metrics.framingPassed, 'framing_passed', 'full_body_not_visible');
      flip('fb', metrics.fullBodyVisible, 'full_body_visible', 'full_body_not_visible');
      {
        const dkKey = metrics.distanceOK ? 'ok' : metrics.distanceTooFar ? 'far' : 'close';
        if (last.dk !== dkKey) {
          last.dk = dkKey;
          const type = metrics.distanceOK ? 'distance_ok' : metrics.distanceTooFar ? 'move_closer' : 'move_back';
          out.push({ type, payload });
        }
      }
      flip('st', metrics.stable, 'stable_enough', 'unstable');
      flip('ce', captureEnabled, 'capture_enabled', 'capture_disabled');
      flip('al', metrics.alignmentPassed && metrics.centered, 'body_centered', 'center_body');

      if (last.pf !== true && metrics.poseFront) {
        last.pf = true;
        out.push({ type: 'pose_front_detected', payload });
      }
      if (last.ps !== true && metrics.poseSide) {
        last.ps = true;
        out.push({ type: 'pose_side_detected', payload });
      }

      const needMoveLeft = metrics.horizontalOffset > th.offsetGuidanceStrong;
      const needMoveRight = metrics.horizontalOffset < -th.offsetGuidanceStrong;
      if (needMoveLeft !== lastNeedMoveLeft) {
        lastNeedMoveLeft = needMoveLeft;
        if (needMoveLeft) out.push({ type: 'move_left', payload });
      }
      if (needMoveRight !== lastNeedMoveRight) {
        lastNeedMoveRight = needMoveRight;
        if (needMoveRight) out.push({ type: 'move_right', payload });
      }

      return out;
    },
  };
}
