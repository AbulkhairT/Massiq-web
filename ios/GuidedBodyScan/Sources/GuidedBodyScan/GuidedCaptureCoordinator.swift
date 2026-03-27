import Foundation
import Combine
#if canImport(SwiftUI)
import SwiftUI
#endif

/// Owns Supabase REST writes for guided capture + gating. **Requires user JWT** (no service role).
@MainActor
public final class GuidedCaptureCoordinator: ObservableObject {
    public let userId: UUID
    private let client: SupabaseRestClient
    private var accessToken: String
    private var transitionEngine = ValidationTransitionEngine()
    private var lastAggregatePatch: Date = .distantPast
    private let aggregatePatchMinInterval: TimeInterval = 0.35
    private var lastGuidanceEmitted: String = ""

    @Published public private(set) var sessionId: UUID?
    @Published public private(set) var captureAllowed: Bool = false
    @Published public private(set) var guidanceText: String = ""
    @Published public private(set) var sessionScores: (lighting: Double, alignment: Double, framing: Double, distance: Double, stability: Double) = (0, 0, 0, 0, 0)

    public init(baseURL: URL, anonKey: String, userId: UUID, accessToken: String) {
        self.client = SupabaseRestClient(baseURL: baseURL, anonKey: anonKey)
        self.userId = userId
        self.accessToken = accessToken
    }

    /// Call when your auth layer refreshes the JWT.
    public func updateAccessToken(_ token: String) {
        accessToken = token
    }

    // MARK: - Session lifecycle

    /// Call when user enters guided capture (creates `scan_capture_sessions` row).
    public func startGuidedSession(
        appVersion: String?,
        deviceType: String?,
        initialMetadata: [String: Any] = [:]
    ) async throws {
        transitionEngine.reset()
        lastGuidanceEmitted = ""
        var meta = initialMetadata
        meta["flow"] = "guided_capture"
        var row: [String: Any] = [
            "user_id": userId.uuidString.lowercased(),
            "platform": "ios",
            "capture_mode": "guided",
            "status": "started",
            "started_at": isoNow(),
            "pose_sequence": [] as [Any],
            "metadata": meta,
        ]
        if let v = appVersion { row["app_version"] = v }
        if let d = deviceType { row["device_type"] = d }
        let rows = try await client.postJSON(path: "rest/v1/scan_capture_sessions", accessToken: accessToken, json: row)
        guard let idStr = rows.first?["id"] as? String, let uuid = UUID(uuidString: idStr) else {
            throw NSError(domain: "GuidedCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "No session id"])
        }
        sessionId = uuid
        guidanceText = "Step into frame"
    }

    /// Process vision metrics each frame (throttled events + PATCH aggregates).
    public func processFrame(_ metrics: FrameMetrics) async {
        guard let sid = sessionId else { return }
        let s = ValidationTransitionEngine.scores(from: metrics)
        sessionScores = s

        let gates = metrics.lightingPassed
            && metrics.framingPassed
            && metrics.alignmentPassed
            && metrics.fullBodyVisible
            && metrics.distanceOK
            && metrics.stable
        captureAllowed = gates
        let nextGuidance = Self.guidanceCopy(metrics: metrics, gatesOk: gates)
        if nextGuidance != lastGuidanceEmitted {
            lastGuidanceEmitted = nextGuidance
            guidanceText = nextGuidance
        }

        let events = transitionEngine.eventsOnChange(
            metrics,
            captureEnabled: gates,
            userId: userId.uuidString.lowercased(),
            sessionId: sid.uuidString.lowercased()
        )
        for ev in events {
            await insertEvent(type: ev.type, payload: ev.payload)
        }

        let now = Date()
        if now.timeIntervalSince(lastAggregatePatch) >= aggregatePatchMinInterval {
            lastAggregatePatch = now
            await patchSessionAggregates(
                sessionId: sid,
                metrics: metrics,
                scores: s,
                qualityPassed: gates
            )
        }
    }

    static func guidanceCopy(metrics: FrameMetrics, gatesOk: Bool) -> String {
        if gatesOk { return "Hold still — capture" }
        if !metrics.lightingPassed || metrics.brightness < 0.22 { return "Too dark — add light" }
        if !metrics.lightingPassed { return "Improve lighting" }
        if !metrics.framingPassed { return "Step back — show full body" }
        if !metrics.fullBodyVisible { return "Full body not visible" }
        if metrics.horizontalOffset < -0.18 { return "Move left" }
        if metrics.horizontalOffset > 0.18 { return "Move right" }
        if !metrics.distanceOK { return "Move back" }
        if !metrics.centered { return "Center your body" }
        if !metrics.stable { return "Hold still" }
        if !metrics.alignmentPassed { return "Align with silhouette" }
        return "Adjust position"
    }

    private func patchSessionAggregates(
        sessionId: UUID,
        metrics: FrameMetrics,
        scores: (lighting: Double, alignment: Double, framing: Double, distance: Double, stability: Double),
        qualityPassed: Bool
    ) async {
        var pose: [String] = []
        if metrics.poseFront { pose.append("front") }
        if metrics.poseSide { pose.append("side") }
        let patch: [String: Any] = [
            "lighting_score": scores.lighting,
            "alignment_score": scores.alignment,
            "framing_score": scores.framing,
            "distance_score": scores.distance,
            "stability_score": scores.stability,
            "quality_passed": qualityPassed,
            "pose_sequence": pose,
            "metadata": [
                "brightness": metrics.brightness,
                "body_box_ratio": metrics.bodyBoxRatio,
                "horizontal_offset": metrics.horizontalOffset,
            ],
        ]
        let path = "rest/v1/scan_capture_sessions?id=eq.\(sessionId.uuidString.lowercased())"
        _ = try? await client.patchJSON(path: path, accessToken: accessToken, json: patch)
    }

    private func insertEvent(type: String, payload: [String: Any]) async {
        guard let sid = sessionId else { return }
        var body: [String: Any] = [
            "session_id": sid.uuidString.lowercased(),
            "event_type": type,
            "payload": payload,
            "user_id": userId.uuidString.lowercased(),
        ]
        _ = try? await client.postJSON(path: "rest/v1/scan_capture_events", accessToken: accessToken, json: body)
    }

    /// After shutter. Pass `shutterAllowed: captureAllowed` from the frame when user tapped (must be true).
    public func onPhotoCaptured(
        imageData: Data,
        width: Int,
        height: Int,
        shutterAllowed: Bool,
        exifMetadata: [String: Any] = [:]
    ) async throws {
        guard shutterAllowed else {
            throw NSError(domain: "GuidedCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "Capture gated: validation did not pass"])
        }
        guard let sid = sessionId else { return }
        let path = "rest/v1/scan_capture_sessions?id=eq.\(sid.uuidString.lowercased())"
        let patch: [String: Any] = [
            "status": "captured",
            "metadata": [
                "image_width": width,
                "image_height": height,
                "byte_length": imageData.count,
                "exif": exifMetadata,
            ] as [String: Any],
        ]
        _ = try await client.patchJSON(path: path, accessToken: accessToken, json: patch)
        await insertEvent(type: "photo_captured", payload: [
            "width": width,
            "height": height,
            "bytes": imageData.count,
            "user_id": userId.uuidString.lowercased(),
            "capture_session_id": sid.uuidString.lowercased(),
        ])
    }

    /// When backend scan row is saved.
    public func onScanPersisted(scanId: UUID) async throws {
        guard let sid = sessionId else { return }
        let path = "rest/v1/scan_capture_sessions?id=eq.\(sid.uuidString.lowercased())"
        let patch: [String: Any] = [
            "scan_id": scanId.uuidString.lowercased(),
            "status": "completed",
            "completed_at": isoNow(),
        ]
        _ = try await client.patchJSON(path: path, accessToken: accessToken, json: patch)
    }

    public func onFailure(reason: String, kind: CaptureFailureKind) async throws {
        guard let sid = sessionId else { return }
        let path = "rest/v1/scan_capture_sessions?id=eq.\(sid.uuidString.lowercased())"
        let patch: [String: Any] = [
            "status": "failed",
            "failure_reason": reason,
            "completed_at": isoNow(),
        ]
        _ = try await client.patchJSON(path: path, accessToken: accessToken, json: patch)
        await insertEvent(type: kind.rawValue, payload: [
            "reason": reason,
            "user_id": userId.uuidString.lowercased(),
            "capture_session_id": sid.uuidString.lowercased(),
        ])
    }

    /// When analysis says low quality / rescan.
    public func insertQualityReviewIfNeeded(
        scanId: UUID,
        confidenceLabel: String,
        lowConfidence: Bool,
        poorLighting: Bool,
        framingIssues: Bool,
        rescanRecommended: Bool
    ) async throws {
        let bad = lowConfidence || poorLighting || framingIssues || rescanRecommended
        guard bad else { return }
        let bucket: String
        if lowConfidence || rescanRecommended { bucket = "low" }
        else if poorLighting || framingIssues { bucket = "medium" }
        else { bucket = "medium" }
        let action: String
        if rescanRecommended { action = "rescan_required" }
        else if poorLighting || framingIssues { action = "warn" }
        else { action = "warn" }
        var reasons: [String: Any] = [:]
        if lowConfidence { reasons["low_confidence"] = true }
        if poorLighting { reasons["poor_lighting"] = true }
        if framingIssues { reasons["framing"] = true }
        if rescanRecommended { reasons["rescan_recommended"] = true }
        let row: [String: Any] = [
            "user_id": userId.uuidString.lowercased(),
            "scan_id": scanId.uuidString.lowercased(),
            "confidence_label": confidenceLabel,
            "review_source": "system",
            "quality_bucket": bucket,
            "reasons": reasons,
            "recommended_action": action,
            "recommendation": action,
            "notes": [
                "source": "ios_guided_capture",
            ] as [String: Any],
        ]
        _ = try await client.postJSON(path: "rest/v1/scan_quality_reviews", accessToken: accessToken, json: row)
    }

    private func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}
