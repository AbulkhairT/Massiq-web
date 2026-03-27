import Foundation

/// Minimal PostgREST client: user JWT + public anon `apikey` (same as Supabase JS client).
public final class SupabaseRestClient: @unchecked Sendable {
    public let baseURL: URL
    private let anonKey: String
    private let urlSession: URLSession

    public init(baseURL: URL, anonKey: String, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.anonKey = anonKey
        self.urlSession = urlSession
    }

    private func url(path: String) -> URL {
        let root = baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let p = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(root)/\(p)")!
    }

    private func request(
        path: String,
        method: String,
        accessToken: String,
        body: Data? = nil
    ) throws -> URLRequest {
        let url = url(path: path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        req.httpBody = body
        return req
    }

    public func postJSON(path: String, accessToken: String, json: [String: Any]) async throws -> [[String: Any]] {
        let data = try JSONSerialization.data(withJSONObject: json)
        var req = try request(path: path, method: "POST", accessToken: accessToken, body: data)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let (respData, response) = try await urlSession.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200 ... 299).contains(http.statusCode) else {
            let msg = String(data: respData, encoding: .utf8) ?? "\(http.statusCode)"
            throw NSError(domain: "SupabaseRest", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        let obj = try JSONSerialization.jsonObject(with: respData)
        if let arr = obj as? [[String: Any]] { return arr }
        if let one = obj as? [String: Any] { return [one] }
        return []
    }

    public func patchJSON(path: String, accessToken: String, json: [String: Any]) async throws -> [[String: Any]] {
        let data = try JSONSerialization.data(withJSONObject: json)
        let req = try request(path: path, method: "PATCH", accessToken: accessToken, body: data)
        let (respData, response) = try await urlSession.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200 ... 299).contains(http.statusCode) else {
            let msg = String(data: respData, encoding: .utf8) ?? "\(http.statusCode)"
            throw NSError(domain: "SupabaseRest", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        let obj = try JSONSerialization.jsonObject(with: respData)
        if let arr = obj as? [[String: Any]] { return arr }
        if let one = obj as? [String: Any] { return [one] }
        return []
    }
}
