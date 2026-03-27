#if canImport(SwiftUI)
import SwiftUI

/// Active guided UI: silhouette + inline guidance + **gated** shutter (not decorative).
public struct GuidedCaptureOverlay: View {
    @ObservedObject var coordinator: GuidedCaptureCoordinator
    let onShutter: () -> Void

    public init(coordinator: GuidedCaptureCoordinator, onShutter: @escaping () -> Void) {
        self.coordinator = coordinator
        self.onShutter = onShutter
    }

    public var body: some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer(minLength: 24)
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.white.opacity(0.85), lineWidth: 3)
                    .frame(maxWidth: 320, maxHeight: 480)
                    .overlay(
                        Image(systemName: "figure.stand")
                            .font(.system(size: 120))
                            .foregroundStyle(.white.opacity(0.35))
                    )
                Text(coordinator.guidanceText)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button(action: onShutter) {
                    Text(coordinator.captureAllowed ? "Capture" : "Waiting…")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(coordinator.captureAllowed ? Color.green : Color.gray)
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(!coordinator.captureAllowed)
                .padding(.horizontal, 24)
                Spacer()
            }
        }
    }
}
#endif
