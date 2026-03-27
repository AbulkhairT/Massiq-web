// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GuidedBodyScan",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
    ],
    products: [
        .library(name: "GuidedBodyScan", targets: ["GuidedBodyScan"]),
    ],
    targets: [
        .target(
            name: "GuidedBodyScan",
            dependencies: [],
            path: "Sources/GuidedBodyScan"
        ),
    ]
)
