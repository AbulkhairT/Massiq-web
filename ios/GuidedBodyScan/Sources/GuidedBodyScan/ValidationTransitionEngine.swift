import Foundation

struct ValidationTransitionEngine {
    private var seenGuidedStart = false
    private var last: [String: Bool] = [:]
    private var lastLeftZone = false
    private var lastRightZone = false

    struct EmittedEvent: Sendable {
        let type: String
        let payload: [String: Any]
    }

    static func scores(from m: FrameMetrics) -> (
        lighting: Double,
        alignment: Double,
        framing: Double,
        distance: Double,
        stability: Double
    ) {
        let lighting = m.lightingPassed ? min(1, m.brightness * 1.15) : m.brightness
        let alignment = (m.alignmentPassed && m.centered) ? 1.0 : (m.centered ? 0.65 : 0.3)
        let framing = m.framingPassed ? 1.0 : min(1, m.bodyBoxRatio * 1.4)
        let distance = m.distanceOK ? 1.0 : min(1, m.bodyBoxRatio * 1.8)
        let stability = m.stable ? 1.0 : 0.35
        return (lighting, alignment, framing, distance, stability)
    }

    mutating func eventsOnChange(
        _ m: FrameMetrics,
        captureEnabled: Bool,
        userId: String,
        sessionId: String
    ) -> [EmittedEvent] {
        let s = Self.scores(from: m)
        let payload: [String: Any] = [
            "brightness": m.brightness,
            "body_box_ratio": m.bodyBoxRatio,
            "centered": m.centered,
            "horizontal_offset": m.horizontalOffset,
            "pose_front": m.poseFront,
            "pose_side": m.poseSide,
            "full_body_visible": m.fullBodyVisible,
            "lighting_score": s.lighting,
            "alignment_score": s.alignment,
            "framing_score": s.framing,
            "distance_score": s.distance,
            "stability_score": s.stability,
            "user_id": userId,
            "capture_session_id": sessionId,
        ]

        var out: [EmittedEvent] = []

        if !seenGuidedStart {
            seenGuidedStart = true
            out.append(EmittedEvent(type: "guided_scan_started", payload: payload))
        }

        func flip(_ key: String, _ v: Bool, _ onTrue: String, _ onFalse: String) {
            let p = last[key]
            guard p != v else { return }
            last[key] = v
            out.append(EmittedEvent(type: v ? onTrue : onFalse, payload: payload))
        }

        flip("lp", m.lightingPassed, "lighting_passed", "too_dark")
        flip("fp", m.framingPassed, "framing_passed", "full_body_not_visible")
        flip("fb", m.fullBodyVisible, "full_body_visible", "full_body_not_visible")
        flip("dk", m.distanceOK, "distance_ok", "move_back")
        flip("st", m.stable, "stable_enough", "unstable")
        flip("ce", captureEnabled, "capture_enabled", "capture_disabled")

        if last["pf"] != true, m.poseFront {
            last["pf"] = true
            out.append(EmittedEvent(type: "pose_front_detected", payload: payload))
        }
        if last["ps"] != true, m.poseSide {
            last["ps"] = true
            out.append(EmittedEvent(type: "pose_side_detected", payload: payload))
        }

        flip("al", m.alignmentPassed && m.centered, "body_centered", "center_body")

        let left = m.horizontalOffset < -0.18
        let right = m.horizontalOffset > 0.18
        if left != lastLeftZone {
            lastLeftZone = left
            if left { out.append(EmittedEvent(type: "move_left", payload: payload)) }
        }
        if right != lastRightZone {
            lastRightZone = right
            if right { out.append(EmittedEvent(type: "move_right", payload: payload)) }
        }

        return out
    }

    mutating func reset() {
        last.removeAll()
        seenGuidedStart = false
        lastLeftZone = false
        lastRightZone = false
    }
}
