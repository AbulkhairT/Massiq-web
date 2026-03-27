import Foundation
import CoreGraphics
import Vision
import CoreVideo
import CoreImage

/// Maps camera frames to `FrameMetrics` using Vision (human rectangles + optional body pose) and simple heuristics.
public final class VisionFrameAnalyzer {
    private let requestHandler = VNSequenceRequestHandler()
    private var previousBox: CGRect?
    private var previousBrightness: Double?
    public init() {}

    /// Analyze a full-resolution or preview-sized buffer. `imageSize` is pixel dimensions of the buffer.
    public func analyze(
        pixelBuffer: CVPixelBuffer,
        imageSize: CGSize,
        orientation: CGImagePropertyOrientation = .up
    ) -> FrameMetrics {
        let rectRequest = VNDetectHumanRectanglesRequest()
        rectRequest.upperBodyOnly = false
        let poseRequest = VNDetectHumanBodyPoseRequest()

        do {
            try requestHandler.perform([rectRequest, poseRequest], on: pixelBuffer, orientation: orientation)
        } catch {
            return FrameMetrics(
                brightness: estimateBrightness(pixelBuffer: pixelBuffer),
                bodyBoxRatio: 0,
                centered: false,
                fullBodyVisible: false,
                poseFront: false,
                poseSide: false,
                framingPassed: false,
                lightingPassed: false,
                alignmentPassed: false,
                distanceOK: false,
                stable: false,
                horizontalOffset: 0
            )
        }

        let brightness = estimateBrightness(pixelBuffer: pixelBuffer)
        let obs = rectRequest.results ?? []
        let boxes: [VNDetectedObjectObservation] = obs.compactMap { $0 as? VNDetectedObjectObservation }
        let best = boxes.max(by: { $0.boundingBox.area < $1.boundingBox.area })
        let box = best?.boundingBox ?? .zero

        let bodyBoxRatio = CGFloat(box.area)
        let midX = CGFloat(box.midX)
        let horizontalOffset = Double((midX - 0.5) * 2.0)
        let centered = abs(horizontalOffset) < 0.14

        let topOk = box.minY < 0.22
        let bottomOk = box.maxY > 0.78
        let tallEnough = box.height > 0.52
        let fullBodyVisible = topOk && bottomOk && tallEnough

        let ar = box.width / max(box.height, 0.001)
        var poseFront = ar > 0.38
        var poseSide = ar < 0.34 && box.height > 0.4
        if poseFront && poseSide { poseSide = false }

        if let pose = poseRequest.results?.first as? VNHumanBodyPoseObservation {
            if let ls = try? pose.recognizedPoint(.leftShoulder),
               let rs = try? pose.recognizedPoint(.rightShoulder),
               ls.confidence > 0.2, rs.confidence > 0.2 {
                let shoulderW = abs(rs.location.x - ls.location.x)
                if shoulderW < 0.08 { poseSide = true; poseFront = false }
                else if shoulderW > 0.14 { poseFront = true; poseSide = false }
            }
        }

        let lightingPassed = brightness > 0.22 && brightness < 0.97
        let framingPassed = fullBodyVisible && bodyBoxRatio > 0.06
        let distanceOK = bodyBoxRatio > 0.14 && bodyBoxRatio < 0.52
        let alignmentPassed = centered && abs(horizontalOffset) < 0.2

        var stable = true
        if let prev = previousBox {
            let dc = hypot(box.midX - prev.midX, box.midY - prev.midY)
            let da = abs(CGFloat(box.area) - CGFloat(prev.area))
            let motion = Double(dc + da * 0.8)
            stable = motion < 0.045
        }
        previousBox = box

        if let pb = previousBrightness {
            let db = abs(brightness - pb)
            if db > 0.08 { stable = false }
        }
        previousBrightness = brightness

        return FrameMetrics(
            brightness: brightness,
            bodyBoxRatio: Double(min(1, max(0, bodyBoxRatio))),
            centered: centered,
            fullBodyVisible: fullBodyVisible,
            poseFront: poseFront,
            poseSide: poseSide,
            framingPassed: framingPassed,
            lightingPassed: lightingPassed,
            alignmentPassed: alignmentPassed,
            distanceOK: distanceOK,
            stable: stable,
            horizontalOffset: horizontalOffset
        )
    }

    public func resetMotion() {
        previousBox = nil
        previousBrightness = nil
    }
}

private extension CGRect {
    var area: CGFloat { width * height }
}

private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

private func estimateBrightness(pixelBuffer: CVPixelBuffer) -> Double {
    let img = CIImage(cvPixelBuffer: pixelBuffer)
    let extent = img.extent
    guard extent.width > 1, extent.height > 1 else { return 0.4 }
    let avg = img.applyingFilter("CIAreaAverage", parameters: [kCIInputExtentKey: CIVector(cgRect: extent)])
    var bitmap = [UInt8](repeating: 0, count: 4)
    ciContext.render(
        avg,
        toBitmap: &bitmap,
        rowBytes: 4,
        bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return Double(bitmap[0] + bitmap[1] + bitmap[2]) / (3.0 * 255.0)
}
