# MassIQ iOS host app (template)

There is no checked-in `.xcodeproj` in this repository. Create an **iOS App** target in Xcode, add the local Swift package at `ios/GuidedBodyScan`, then set your root view to the guided flow.

## Entry: guided scan as primary body capture

In your `Scene` / root `View`, present **`GuidedScanRootView`** when the user taps “Take photo” (or equivalent):

```swift
import SwiftUI
import GuidedBodyScan

@main
struct MassiqApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView() // your shell: loads profile + JWT, then pushes GuidedScanRootView
        }
    }
}
```

Example construction:

```swift
let coordinator = GuidedCaptureCoordinator(
    baseURL: URL(string: "https://YOUR_PROJECT.supabase.co")!,
    anonKey: "YOUR_ANON_KEY",
    userId: userUUID,
    accessToken: session.accessToken
)

GuidedScanRootView(
    coordinator: coordinator,
    appBaseURL: URL(string: "https://your-deployed-massiq-app.com")!,
    accessToken: session.accessToken,
    profile: profileDictionary, // same keys as web `profile` (age, gender, heightIn, weightLbs, goal, …)
    scanHistory: priorScansFromApi,
    onFinished: { result in
        switch result {
        case .success(let scanId): break // dismiss or navigate
        case .failure: break
        }
    }
)
```

Use **`GuidedScanRootView`** as the **default** body-scan screen; do not route “Take photo” to a plain `UIImagePickerController` unless you intentionally offer an advanced/manual fallback.

## Required permissions

- **Privacy – Camera Usage Description** (`NSCameraUsageDescription`).

## Network

- Same **`NEXT_PUBLIC_SUPABASE_URL`** / anon key as the web app.
- Deployed MassIQ app must expose **`POST /api/body-scan/complete`** (included in `massiq-2`).
