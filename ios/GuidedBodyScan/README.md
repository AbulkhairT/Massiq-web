# GuidedBodyScan (iOS Swift Package)

This package implements **real** Supabase writes for **`scan_capture_sessions`**, **`scan_capture_events`**, and **`scan_quality_reviews`** during guided body scan (user JWT only). It is not a logging stub: rows are created/updated as the user moves through the flow.

## Prerequisites

1. Apply **`massiq-2/supabase/migrations/033_guided_capture_ios_columns.sql`** (adds aggregate scores, `device_type`, `failure_reason`, `scan_capture_events.user_id`, quality review columns).
2. RLS policies must allow authenticated users to `INSERT`/`UPDATE`/`SELECT` their own rows (same as web app patterns).

## Add to Xcode

1. File → Add Package Dependencies → Add Local → select `ios/GuidedBodyScan`.
2. Link `GuidedBodyScan` to your app target.
3. Pass your Supabase project URL (`https://<ref>.supabase.co`) and **anon** key (same as `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Pass the **user’s** `access_token` from Supabase Auth (not service role).

## Integration (recommended)

Use **`GuidedScanRootView`** for the full flow: **AVFoundation** preview + **`VisionFrameAnalyzer`** (human rectangles, body pose, brightness, motion) → **`GuidedCaptureCoordinator.processFrame`** → gated **`GuidedCaptureOverlay`** → **`POST /api/body-scan/complete`** on your MassIQ Next app (Claude + engine + Supabase upload + `scans` row + quality review when needed) → **`onScanPersisted`**.

1. Add your deployed app URL as **`appBaseURL`** (origin only, e.g. `https://your-app.vercel.app`).
2. Build `GuidedCaptureCoordinator(baseURL:anonKey:userId:accessToken:)` with Supabase URL + anon key + user JWT.
3. Present **`GuidedScanRootView(coordinator:appBaseURL:accessToken:profile:scanHistory:onFinished:)`** from your “Take photo” / body scan entry (this should be the **primary** capture path in the host app).
4. **Info.plist**: `NSCameraUsageDescription`.

**Server route** (repo): `massiq-2/app/api/body-scan/complete` — requires `ANTHROPIC_API_KEY`, Supabase envs, and the same Bearer session as the web app.

### Manual integration (advanced)

1. **`VisionFrameAnalyzer`** — produce `FrameMetrics` each throttled frame (see `GuidedCameraViewController`).
2. On entering guided mode: `await coordinator.startGuidedSession(appVersion:deviceType:)`.
3. Each frame: `await coordinator.processFrame(metrics)` (async, MainActor).
4. UI: `GuidedCaptureOverlay` — **disable shutter** unless `captureAllowed`.
5. On shutter: `try await coordinator.onPhotoCaptured(..., shutterAllowed: true)` only if the control was enabled (gates passed at tap).
6. Run your scan pipeline, then `try await coordinator.onScanPersisted(scanId:)`.
7. On failure: `try await coordinator.onFailure(reason:kind:)`.
8. Optional: `insertQualityReviewIfNeeded` — the **`/api/body-scan/complete`** route already inserts a quality review when confidence/lighting/framing warrant it; use the coordinator method only for custom clients.

## Where rows are written

| Step | Table | Operation |
|------|--------|-----------|
| Enter guided | `scan_capture_sessions` | `POST` with `platform=ios`, `capture_mode=guided`, `status=started`, `app_version`, `device_type`, `metadata` |
| Validation + aggregates | `scan_capture_sessions` | `PATCH` every ~350ms: `lighting_score`, `alignment_score`, `framing_score`, `distance_score`, `stability_score`, `quality_passed`, `pose_sequence`, `metadata` |
| State transitions | `scan_capture_events` | `POST` with `session_id`, `event_type`, `payload`, `user_id` (after migration 033) |
| Photo taken | `scan_capture_sessions` + events | `PATCH` `status=captured`; `POST` `photo_captured` |
| Scan saved | `scan_capture_sessions` | `PATCH` `scan_id`, `status=completed`, `completed_at` |
| Failure | `scan_capture_sessions` + events | `PATCH` `failed`, `failure_reason`; `POST` `capture_failed` / `analysis_failed` / `upload_failed` |
| Quality | `scan_quality_reviews` | `POST` with `review_source=system`, `quality_bucket`, `reasons`, `recommended_action` |

## Files

| File | Purpose |
|------|---------|
| `CaptureModels.swift` | `FrameMetrics`, `CaptureFailureKind` |
| `VisionFrameAnalyzer.swift` | Vision → `FrameMetrics` (body box, pose heuristics, brightness, stability) |
| `GuidedCameraController.swift` | Front camera preview + throttled frame analysis + photo capture |
| `MassiqRemoteScanPipeline.swift` | `POST {app}/api/body-scan/complete` |
| `GuidedScanRootView.swift` | SwiftUI shell: camera + overlay + pipeline + coordinator callbacks |
| `SupabaseRestClient.swift` | PostgREST `POST`/`PATCH` with `apikey` + Bearer JWT |
| `ValidationTransitionEngine.swift` | Transition-only event emission (no spam) |
| `GuidedCaptureCoordinator.swift` | Session lifecycle, gating, REST calls, guidance de-duplication |
| `GuidedCaptureOverlay.swift` | SwiftUI silhouette + guidance + gated button |

## Read path (debug / analytics)

Fetch `scan_capture_sessions` / `scan_capture_events` / `scan_quality_reviews` by `user_id` or `session_id` in Supabase SQL or the `verify-user-canonical` script in `massiq-2/scripts/ops/`.
