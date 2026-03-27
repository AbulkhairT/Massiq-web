import UIKit
import AVFoundation
import CoreVideo

/// Camera preview + Vision-driven metrics. Primary entry for guided body scan capture (use with `GuidedCaptureOverlay`).
public final class GuidedCameraViewController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {
    private let session = AVCaptureSession()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let photoOutput = AVCapturePhotoOutput()
    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let processingQueue = DispatchQueue(label: "com.massiq.guided.camera.vision", qos: .userInitiated)

    private var analyzer = VisionFrameAnalyzer()
    private var frameTick: Int = 0
    private var imageSize: CGSize = .zero

    /// Called on main queue ~5–8 Hz with fresh metrics (throttled).
    public var onMetrics: ((FrameMetrics) -> Void)?
    /// JPEG data + dimensions when capture finishes.
    public var onPhotoData: ((Data, Int, Int) -> Void)?
    public var videoOrientation: AVCaptureVideoOrientation = .portrait

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        configureSession()
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    private func configureSession() {
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            session.commitConfiguration()
            return
        }
        session.addInput(input)

        videoOutput.setSampleBufferDelegate(self, queue: processingQueue)
        videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        videoOutput.alwaysDiscardsLateVideoFrames = true
        if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }

        if let conn = videoOutput.connection(with: .video), conn.isVideoMirroringSupported {
            conn.isVideoMirrored = true
        }
        session.commitConfiguration()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }

    public func capturePhoto() {
        let settings = AVCapturePhotoSettings()
        settings.flashMode = .off
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    public func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        let w = photo.resolvedSettings.photoDimensions.width
        let h = photo.resolvedSettings.photoDimensions.height
        DispatchQueue.main.async { [weak self] in
            self?.onPhotoData?(data, Int(w), Int(h))
        }
    }

    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        frameTick += 1
        if frameTick % 3 != 0 { return }

        let w = CGFloat(CVPixelBufferGetWidth(pb))
        let h = CGFloat(CVPixelBufferGetHeight(pb))
        imageSize = CGSize(width: w, height: h)

        let orientation: CGImagePropertyOrientation = .leftMirrored
        var metrics = analyzer.analyze(pixelBuffer: pb, imageSize: imageSize, orientation: orientation)

        DispatchQueue.main.async { [weak self] in
            self?.onMetrics?(metrics)
        }
    }

    public func resetStabilityBaseline() {
        processingQueue.async { [weak self] in
            self?.analyzer.resetMotion()
        }
    }

    deinit {
        session.stopRunning()
    }
}
