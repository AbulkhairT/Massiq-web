import Foundation

/// Metrics from your Vision / AVFoundation / CoreML pipeline (you map detections into this struct).
public struct FrameMetrics: Sendable, Equatable {
    public var brightness: Double
    /// 0...1 relative area of person vs frame (heuristic).
    public var bodyBoxRatio: Double
    public var centered: Bool
    public var fullBodyVisible: Bool
    public var poseFront: Bool
    public var poseSide: Bool
    public var framingPassed: Bool
    public var lightingPassed: Bool
    public var alignmentPassed: Bool
    public var distanceOK: Bool
    public var stable: Bool
    /// -1 ... 1 from face/body centroid vs frame center (negative = move left).
    public var horizontalOffset: Double

    public init(
        brightness: Double = 0,
        bodyBoxRatio: Double = 0,
        centered: Bool = false,
        fullBodyVisible: Bool = false,
        poseFront: Bool = false,
        poseSide: Bool = false,
        framingPassed: Bool = false,
        lightingPassed: Bool = false,
        alignmentPassed: Bool = false,
        distanceOK: Bool = false,
        stable: Bool = false,
        horizontalOffset: Double = 0
    ) {
        self.brightness = brightness
        self.bodyBoxRatio = bodyBoxRatio
        self.centered = centered
        self.fullBodyVisible = fullBodyVisible
        self.poseFront = poseFront
        self.poseSide = poseSide
        self.framingPassed = framingPassed
        self.lightingPassed = lightingPassed
        self.alignmentPassed = alignmentPassed
        self.distanceOK = distanceOK
        self.stable = stable
        self.horizontalOffset = horizontalOffset
    }
}

public enum CaptureFailureKind: String, Sendable {
    case captureFailed
    case analysisFailed
    case uploadFailed
}
