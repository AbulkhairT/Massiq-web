# Guided web scan — QA notes

Central thresholds live in `guidedThresholds.js`. Hysteresis in `hysteresis.js` reduces flicker near band edges.

## Threshold values (current)

| Area | Key(s) | Compact | Desktop |
|------|--------|---------|---------|
| Brightness enter | `lightEnterLow` / `lightEnterHigh` | 0.23–0.93 | same |
| Brightness exit | `lightExitLow` / `lightExitHigh` | 0.19–0.96 | same |
| Full-body score enter / exit | `fullBodyEnterScore` / `fullBodyExitScore` | 0.62 / 0.52 | 0.68 / 0.58 |
| Nose max Y | `noseMaxY` | 0.32 | 0.28 |
| Ankle min Y | `ankleMinY` | 0.68 | 0.72 |
| Min body height (norm) | `minBodyHeight` | 0.40 | 0.44 |
| Min landmark visibility | `minVisibility` | 0.22 | 0.22 |
| Distance: too far (area) | `distTooFarRaw` | 0.085 | 0.095 |
| Distance: too close | `distTooCloseRaw` | 0.54 | 0.48 |
| Re-enter OK from far | `distEnterOkFromFar` | 0.11 | 0.12 |
| Exit OK → far | `distExitOkToFar` | 0.09 | 0.095 |
| Re-enter OK from close | `distEnterOkFromClose` | 0.50 | 0.45 |
| Exit OK → close | `distExitOkToClose` | 0.52 | 0.48 |
| Center enter / exit | `centerEnter` / `centerExit` | 0.13 / 0.17 | same |
| Align enter / exit | `alignEnter` / `alignExit` | 0.11 / 0.15 | same |
| Guidance strong / align | `offsetGuidanceStrong` / `offsetGuidanceAlign` | 0.20 / 0.14 | same |
| Stability motion enter / exit | `stableEnterMotion` / `stableExitMotion` | 0.048 / 0.068 | same |
| Motion EMA α | `motionEmaAlpha` | 0.22 | same |

Raw framing also uses `bodyBoxRatio > 0.055` and `bh > minBodyHeight * 0.88` in `frameMetrics.js`.

## Known browser limitations

- **Safari (macOS / iOS):** WebGL / WASM may fall back to CPU for MediaPipe; first frame can be slower. `getUserMedia` requires **HTTPS** (or localhost). If camera fails after permission, user should use **Upload**.
- **iOS Safari:** `ideal` video constraints are hints only; actual resolution varies. Portrait vs landscape changes normalized bbox — `getViewportProfile()` + resize/orientation refresh mitigates distance bands.
- **Chrome / desktop:** Laptop webcams often show a larger normalized figure at arm’s length than phones — desktop uses slightly tighter `distTooFarRaw` / full-body scores.
- **Canvas `getImageData`:** Some privacy modes or cross-origin video can throw; brightness falls back to a default (see `computeBrightness` usage).
- **No shared GPU context guarantees:** GPU delegate creation can fail; code already falls back to CPU.

## Tune after live testing

1. **`fullBodyEnterScore` / `Exit`** — false negatives (never green): lower enter slightly or relax `noseMaxY` / `ankleMinY` for your typical crop. False positives (green when feet cropped): raise enter or require two ankles visible.
2. **`distTooFarRaw` / bands** — if users cannot reach “OK” on phones without filling the frame too much, raise `distTooFarRaw` slightly on compact only.
3. **`stableEnterMotion` / EMA α** — if capture enables while swaying, lower `stableEnterMotion` or reduce α for slower EMA. If it takes too long to enable, raise exit or α.
4. **`offsetGuidanceStrong`** — if lateral instructions feel twitchy, increase toward 0.22; if users overshoot, decrease.
5. **Brightness** — office lighting vs sunlight: adjust `lightEnterLow` / `lightEnterHigh` if guidance is stuck on dark/bright.

## Dev debug overlay

Press **`d`** while the modal is open (not in an input), or set `NEXT_PUBLIC_GUIDED_DEBUG=1`, or `localStorage` key `massiq:guidedDebug` = `1`. Shows smoothed metrics after hysteresis.
