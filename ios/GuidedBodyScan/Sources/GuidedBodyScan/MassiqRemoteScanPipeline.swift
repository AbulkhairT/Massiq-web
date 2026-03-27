import Foundation

/// Response from `POST /api/body-scan/complete` (MassIQ Next.js app).
public struct GuidedScanCompleteResponse: Sendable, Decodable {
    public let ok: Bool?
    public let scanId: String?
    public let assetId: String?
    public let error: String?
    public let qualityReviewInserted: Bool?
    public let lowConfidence: Bool?
    public let poorLighting: Bool?
    public let framingIssues: Bool?
}

/// Calls the server-orchestrated body scan pipeline (Claude + engine + Supabase).
public enum MassiqRemoteScanPipeline {
    /// - Parameters:
    ///   - appBaseURL: e.g. `https://your-app.vercel.app` (no trailing slash)
    ///   - imageJPEGData: JPEG data from photo capture
    ///   - profile: JSON-serializable profile map (age, gender, heightIn, weightLbs, goal, heightCm, activity, …)
    ///   - scanHistory: optional prior scans for engine + smoothing (same shape as web localStorage entries)
    public static func completeGuidedScan(
        appBaseURL: URL,
        accessToken: String,
        imageJPEGData: Data,
        profile: [String: Any],
        scanHistory: [[String: Any]] = [],
        captureSessionId: UUID?,
        imageWidth: Int,
        imageHeight: Int
    ) async throws -> GuidedScanCompleteResponse {
        let base64 = imageJPEGData.base64EncodedString()
        var body: [String: Any] = [
            "imageBase64": base64,
            "mediaType": "image/jpeg",
            "profile": profile,
            "scanHistory": scanHistory,
            "imageWidth": imageWidth,
            "imageHeight": imageHeight,
        ]
        if let sid = captureSessionId {
            body["captureSessionId"] = sid.uuidString.lowercased()
        }
        let json = try JSONSerialization.data(withJSONObject: body)

        let url = appBaseURL
            .appendingPathComponent("api")
            .appendingPathComponent("body-scan")
            .appendingPathComponent("complete")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = json

        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse else {
            throw NSError(domain: "MassiqRemoteScanPipeline", code: -1, userInfo: [NSLocalizedDescriptionKey: "No HTTP response"])
        }
        let decoded = try JSONDecoder().decode(GuidedScanCompleteResponse.self, from: data)
        if http.statusCode >= 400 {
            let msg = decoded.error ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "MassiqRemoteScanPipeline", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        if decoded.ok == false {
            let msg = decoded.error ?? "Scan pipeline failed"
            throw NSError(domain: "MassiqRemoteScanPipeline", code: 1, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        return decoded
    }
}
