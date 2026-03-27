#if canImport(SwiftUI)
import SwiftUI

/// Holds a weak reference to `GuidedCameraViewController` so the overlay can trigger capture.
public final class GuidedCameraRef: ObservableObject {
    public weak var viewController: GuidedCameraViewController?
    public init() {}
    public func capturePhoto() {
        viewController?.capturePhoto()
    }
    public func resetStability() {
        viewController?.resetStabilityBaseline()
    }
}

/// End-to-end guided scan: live Vision validation + gated shutter + server pipeline.
public struct GuidedScanRootView: View {
    @ObservedObject public var coordinator: GuidedCaptureCoordinator
    @StateObject private var cameraRef = GuidedCameraRef()

    public let appBaseURL: URL
    public let accessToken: String
    public let profile: [String: Any]
    public let scanHistory: [[String: Any]]
    public var onFinished: (Result<UUID, Error>) -> Void

    @State private var pipelineBusy = false
    @State private var pipelineError: String?

    public init(
        coordinator: GuidedCaptureCoordinator,
        appBaseURL: URL,
        accessToken: String,
        profile: [String: Any],
        scanHistory: [[String: Any]] = [],
        onFinished: @escaping (Result<UUID, Error>) -> Void
    ) {
        self.coordinator = coordinator
        self.appBaseURL = appBaseURL
        self.accessToken = accessToken
        self.profile = profile
        self.scanHistory = scanHistory
        self.onFinished = onFinished
    }

    public var body: some View {
        ZStack {
            GuidedCameraRepresentable(
                cameraRef: cameraRef,
                onMetrics: { metrics in
                    Task { await coordinator.processFrame(metrics) }
                },
                onPhoto: { data, w, h in
                    Task { await runPipeline(imageData: data, width: w, height: h) }
                }
            )
            .ignoresSafeArea()

            GuidedCaptureOverlay(coordinator: coordinator) {
                guard coordinator.captureAllowed, !pipelineBusy else { return }
                cameraRef.capturePhoto()
            }

            if pipelineBusy {
                Color.black.opacity(0.45).ignoresSafeArea()
                ProgressView("Saving scan…")
                    .tint(.white)
                    .foregroundStyle(.white)
            }
            if let pipelineError {
                VStack {
                    Text(pipelineError)
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding()
                    Button("Dismiss") { self.pipelineError = nil }
                        .buttonStyle(.borderedProminent)
                }
                .padding()
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
        .onAppear {
            cameraRef.resetStability()
            Task {
                try? await coordinator.startGuidedSession(appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String, deviceType: "ios")
            }
        }
    }

    private func runPipeline(imageData: Data, width: Int, height: Int) async {
        guard coordinator.captureAllowed else { return }
        pipelineBusy = true
        pipelineError = nil
        do {
            // Shutter UI is only enabled when `captureAllowed`; treat as validated at tap time.
            try await coordinator.onPhotoCaptured(
                imageData: imageData,
                width: width,
                height: height,
                shutterAllowed: true,
                exifMetadata: [:]
            )
            let res = try await MassiqRemoteScanPipeline.completeGuidedScan(
                appBaseURL: appBaseURL,
                accessToken: accessToken,
                imageJPEGData: imageData,
                profile: profile,
                scanHistory: scanHistory,
                captureSessionId: coordinator.sessionId,
                imageWidth: width,
                imageHeight: height
            )
            guard let sidStr = res.scanId, let scanId = UUID(uuidString: sidStr) else {
                throw NSError(domain: "GuidedScan", code: 3, userInfo: [NSLocalizedDescriptionKey: "Missing scan id"])
            }
            try await coordinator.onScanPersisted(scanId: scanId)
            pipelineBusy = false
            onFinished(.success(scanId))
        } catch {
            pipelineBusy = false
            try? await coordinator.onFailure(reason: error.localizedDescription, kind: .analysisFailed)
            pipelineError = error.localizedDescription
            onFinished(.failure(error))
        }
    }
}

private struct GuidedCameraRepresentable: UIViewControllerRepresentable {
    @ObservedObject var cameraRef: GuidedCameraRef
    var onMetrics: (FrameMetrics) -> Void
    var onPhoto: (Data, Int, Int) -> Void

    func makeUIViewController(context: Context) -> GuidedCameraViewController {
        let c = GuidedCameraViewController()
        c.onMetrics = onMetrics
        c.onPhotoData = onPhoto
        DispatchQueue.main.async {
            cameraRef.viewController = c
        }
        return c
    }

    func updateUIViewController(_ uiViewController: GuidedCameraViewController, context: Context) {
        uiViewController.onMetrics = onMetrics
        uiViewController.onPhotoData = onPhoto
    }

    static func dismantleUIViewController(_ uiViewController: GuidedCameraViewController, coordinator: ()) {
        uiViewController.onMetrics = nil
        uiViewController.onPhotoData = nil
    }
}
#endif
