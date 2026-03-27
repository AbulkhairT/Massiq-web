'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createScanCaptureSession,
  updateScanCaptureSession,
  insertScanCaptureEvent,
} from '../lib/supabase/client';
import { computeBrightness, landmarksToFrameMetrics, scoresFromMetrics } from '../lib/guidedScan/frameMetrics';
import { primaryGuidance, captureAllowed } from '../lib/guidedScan/guidanceState';
import { createValidationTransitionEngine } from '../lib/guidedScan/validationTransitionEngine';
import { getViewportProfile, getThresholds } from '../lib/guidedScan/guidedThresholds';
import { createHysteresisState, applyHysteresis } from '../lib/guidedScan/hysteresis';

const C = {
  bg: '#0A0D0A',
  card: '#131713',
  border: 'rgba(255,255,255,0.08)',
  green: '#72B895',
  muted: 'rgba(255,255,255,0.55)',
  white: '#FFFFFF',
};

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

function isLikelySafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|crios|fxios|edg/i.test(ua);
}

/**
 * Full-screen guided body scan: real MediaPipe pose + brightness; gated capture; Supabase session + events.
 * Only mount when `open` is true so validation is never “fake” without an active pipeline.
 */
export default function GuidedBodyScanModal({
  open,
  onClose,
  profile,
  accessToken,
  userId,
  scanHistory = [],
  appVersion = '0.1.0',
  onScanSuccess,
  onScanError,
  onUploadFallback,
}) {
  const videoRef = useRef(null);
  const canvasBrightRef = useRef(null);
  const rafRef = useRef(null);
  const landmarkerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const completedRef = useRef(false);
  const prevMotionRef = useRef(null);
  const lastPatchRef = useRef(0);
  const lastGuidanceRef = useRef('');
  const lastCapRef = useRef(false);
  const transitionRef = useRef(null);
  const streamRef = useRef(null);
  const thresholdsRef = useRef(null);
  const hysteresisRef = useRef(null);
  const showDebugRef = useRef(false);
  const debugThrottleRef = useRef(0);

  const [phase, setPhase] = useState('idle'); // idle | loading_model | camera | running | error
  const [error, setError] = useState('');
  const [guidance, setGuidance] = useState('');
  const [canCapture, setCanCapture] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [showDebug, setShowDebug] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GUIDED_DEBUG === '1') return true;
      return window.localStorage?.getItem('massiq:guidedDebug') === '1';
    } catch {
      return false;
    }
  });
  const [debugSnapshot, setDebugSnapshot] = useState(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    landmarkerRef.current = null;
  }, []);

  const failSession = useCallback(
    async (reason) => {
      const sid = sessionIdRef.current;
      const token = accessToken;
      if (!sid || !token || completedRef.current) return;
      try {
        await updateScanCaptureSession(token, sid, {
          status: 'failed',
          failure_reason: reason,
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[guided_scan] failSession', e?.message);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    showDebugRef.current = showDebug;
    if (!showDebug) setDebugSnapshot(null);
  }, [showDebug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'd' || e.key === 'D') {
        setShowDebug((v) => {
          const n = !v;
          try {
            window.localStorage?.setItem('massiq:guidedDebug', n ? '1' : '0');
          } catch {}
          return n;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      thresholdsRef.current = getThresholds(getViewportProfile());
    };
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    completedRef.current = false;
    transitionRef.current = createValidationTransitionEngine();
    lastGuidanceRef.current = '';
    lastCapRef.current = false;
    prevMotionRef.current = null;
    sessionIdRef.current = null;
    thresholdsRef.current = getThresholds(getViewportProfile());
    hysteresisRef.current = createHysteresisState();

    (async () => {
      if (!accessToken || !userId) {
        setPhase('error');
        setError('Sign in required for guided scan.');
        return;
      }
      setPhase('loading_model');
      setError('');
      try {
        const row = await createScanCaptureSession(accessToken, userId, {
          platform: 'web',
          capture_mode: 'guided',
          status: 'started',
          app_version: appVersion,
          metadata: { flow: 'guided_browser', validation: 'mediapipe_pose' },
          started_at: new Date().toISOString(),
        });
        sessionIdRef.current = row?.id || null;
      } catch (e) {
        console.warn('[guided_scan] session create', e?.message);
      }

      try {
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        const baseOpts = {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
        };
        let landmarker;
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, baseOpts);
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            ...baseOpts,
            baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
          });
        }
        if (cancelled) return;
        landmarkerRef.current = landmarker;
      } catch (e) {
        console.error('[guided_scan] model load', e);
        setPhase('error');
        setError('Could not load body tracking. Try upload instead.');
        await failSession('model_load_failed');
        return;
      }

      setPhase('camera');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
        }
      } catch (e) {
        console.error('[guided_scan] camera', e);
        setPhase('error');
        const safari = isLikelySafari();
        setError(
          safari
            ? 'Camera unavailable or blocked. On Safari, allow camera for this site in Settings, or use upload.'
            : 'Camera access denied or unavailable. You can use upload instead.',
        );
        await failSession('camera_denied');
        return;
      }

      if (cancelled) return;
      const bc = canvasBrightRef.current;
      if (bc) {
        bc.width = 160;
        bc.height = 120;
      }
      setPhase('running');

      const loop = () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (!video || !landmarkerRef.current) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        if (!video.videoWidth) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        const lm = landmarkerRef.current;
        const now = performance.now();
        let brightness = 0.4;
        if (bc && video.videoWidth) {
          const ctx = bc.getContext('2d', { willReadFrequently: true });
          const w = bc.width;
          const h = bc.height;
          ctx.drawImage(video, 0, 0, w, h);
          try {
            const id = ctx.getImageData(0, 0, w, h);
            brightness = computeBrightness(id);
          } catch {
            /* tainted / privacy */
          }
        }

        const result = lm.detectForVideo(video, now);
        const raw = result?.landmarks?.[0] || null;
        const landmarks = raw ? raw.map((p) => ({ ...p, x: 1 - p.x })) : null;

        const th = thresholdsRef.current || getThresholds(getViewportProfile());
        const rawMetrics = landmarksToFrameMetrics(landmarks, {
          brightness,
          prevMotion: prevMotionRef.current,
          thresholds: th,
        });
        if (rawMetrics.motionSample) {
          prevMotionRef.current = rawMetrics.motionSample;
        }

        const metrics = applyHysteresis(rawMetrics, hysteresisRef.current, th);

        const guide = primaryGuidance(metrics, th);
        if (guide !== lastGuidanceRef.current) {
          lastGuidanceRef.current = guide;
          setGuidance(guide);
        }
        const cap = captureAllowed(metrics);
        if (cap !== lastCapRef.current) {
          lastCapRef.current = cap;
          setCanCapture(cap);
        }

        if (showDebugRef.current) {
          const now = Date.now();
          if (now - debugThrottleRef.current > 100) {
            debugThrottleRef.current = now;
            setDebugSnapshot({
              brightness: metrics.brightness,
              bodyBoxRatio: metrics.bodyBoxRatio,
              centered: metrics.centered,
              stable: metrics.stable,
              fullBodyVisible: metrics.fullBodyVisible,
              distanceOK: metrics.distanceOK,
              captureAllowed: cap,
            });
          }
        }

        const sid = sessionIdRef.current;
        if (sid && accessToken && userId) {
          const allowed = cap;
          const events = transitionRef.current?.eventsOnChange?.(metrics, allowed, userId, sid) || [];
          for (const ev of events) {
            insertScanCaptureEvent(accessToken, sid, ev.type, ev.payload, { userId }).catch(() => {});
          }
          const t = Date.now();
          if (t - lastPatchRef.current > 350) {
            lastPatchRef.current = t;
            const sc = scoresFromMetrics(metrics);
            const pose = [];
            if (metrics.poseFront) pose.push('front');
            if (metrics.poseSide) pose.push('side');
            updateScanCaptureSession(accessToken, sid, {
              lighting_score: sc.lighting,
              alignment_score: sc.alignment,
              framing_score: sc.framing,
              distance_score: sc.distance,
              stability_score: sc.stability,
              quality_passed: allowed,
              pose_sequence: pose,
              metadata: {
                brightness: metrics.brightness,
                body_box_ratio: metrics.bodyBoxRatio,
                horizontal_offset: metrics.horizontalOffset,
                platform: 'web',
                validation: 'mediapipe_pose',
                viewport_profile: th.profile,
              },
            }).catch(() => {});
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      stopCamera();
      transitionRef.current?.reset?.();
      setDebugSnapshot(null);
    };
  }, [open, accessToken, userId, appVersion, failSession, stopCamera]);

  const handleClose = useCallback(async () => {
    stopCamera();
    if (sessionIdRef.current && accessToken && !completedRef.current) {
      await failSession('user_cancelled');
    }
    onClose?.();
  }, [stopCamera, accessToken, failSession, onClose]);

  const handleUploadFallback = useCallback(() => {
    stopCamera();
    onUploadFallback?.();
    onClose?.();
  }, [stopCamera, onUploadFallback, onClose]);

  const handleCapture = useCallback(async () => {
    if (!canCapture || captureBusy) return;
    const video = videoRef.current;
    const token = accessToken;
    const sid = sessionIdRef.current;
    if (!video?.videoWidth || !token || !profile) return;

    setCaptureBusy(true);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = c.toDataURL('image/jpeg', 0.88);
      const base64 = dataUrl.split(',')[1];

      if (sid) {
        try {
          await updateScanCaptureSession(token, sid, {
            status: 'captured',
            metadata: { image_width: w, image_height: h, byte_length: base64.length },
          });
          await insertScanCaptureEvent(token, sid, 'photo_captured', {
            width: w,
            height: h,
            bytes: base64.length,
            user_id: userId,
            capture_session_id: sid,
          }, { userId });
        } catch (e) {
          console.warn('[guided_scan] captured patch', e?.message);
        }
      }

      const res = await fetch('/api/body-scan/complete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: 'image/jpeg',
          profile,
          captureSessionId: sid,
          scanHistory,
          imageWidth: w,
          imageHeight: h,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Scan failed (${res.status})`);
      }
      completedRef.current = true;
      stopCamera();
      onScanSuccess?.(json, { captureSessionId: sid });
    } catch (e) {
      const msg = e?.message || 'Scan failed';
      onScanError?.(msg);
      await failSession(msg);
    } finally {
      setCaptureBusy(false);
    }
  }, [canCapture, captureBusy, accessToken, profile, scanHistory, userId, onScanSuccess, onScanError, failSession, stopCamera]);

  if (!open) return null;

  const showErrorActions = phase === 'error' && error;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
        <span style={{ fontSize: 13, color: C.muted }}>Guided body scan</span>
        <button
          type="button"
          onClick={() => handleClose()}
          style={{
            border: `1px solid ${C.border}`,
            background: C.card,
            color: C.muted,
            borderRadius: 10,
            padding: '8px 14px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      <div style={{ position: 'relative', width: 'min(100vw - 32px, 420px)', aspectRatio: '3/4', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasBrightRef} style={{ display: 'none' }} />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '72%',
              height: '82%',
              border: `3px solid rgba(255,255,255,0.85)`,
              borderRadius: 24,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
            }}
          />
        </div>

        {phase === 'loading_model' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontSize: 15 }}>
            Loading body tracking…
          </div>
        )}

        {showDebug && debugSnapshot && phase === 'running' && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              right: 8,
              maxHeight: '42%',
              overflow: 'auto',
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.72)',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              lineHeight: 1.45,
              pointerEvents: 'none',
            }}
          >
            <div style={{ opacity: 0.75, marginBottom: 4 }}>Debug (press d)</div>
            {Object.entries(debugSnapshot).map(([k, v]) => (
              <div key={k}>
                {k}: {typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? v.toFixed(4) : String(v)}
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ marginTop: 16, marginBottom: 8, minHeight: 48, textAlign: 'center', fontSize: 17, fontWeight: 600, color: C.white, maxWidth: 400, padding: '0 20px' }}>
        {error || guidance || (phase === 'running' ? 'Finding you in frame…' : '')}
      </p>

      {showErrorActions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          {onUploadFallback && (
            <button
              type="button"
              onClick={handleUploadFallback}
              style={{
                padding: '12px 20px',
                borderRadius: 12,
                border: `1px solid ${C.green}`,
                background: 'transparent',
                color: C.green,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Use upload instead
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!canCapture || captureBusy || phase !== 'running'}
        onClick={handleCapture}
        style={{
          marginTop: 8,
          width: 'min(100vw - 48px, 400px)',
          padding: '14px 20px',
          borderRadius: 14,
          border: 'none',
          fontSize: 17,
          fontWeight: 700,
          cursor: canCapture && !captureBusy && phase === 'running' ? 'pointer' : 'not-allowed',
          background: canCapture && phase === 'running' ? C.green : 'rgba(255,255,255,0.2)',
          color: canCapture && phase === 'running' ? '#0A0D0A' : 'rgba(255,255,255,0.45)',
        }}
      >
        {captureBusy ? 'Analyzing…' : canCapture ? 'Capture scan' : 'Waiting…'}
      </button>

      <p style={{ marginTop: 14, fontSize: 12, color: C.muted, textAlign: 'center', maxWidth: 420, padding: '0 16px' }}>
        Stand so your full body fits the outline. Face the camera. When the button turns green, tap capture.
      </p>
    </div>
  );
}
