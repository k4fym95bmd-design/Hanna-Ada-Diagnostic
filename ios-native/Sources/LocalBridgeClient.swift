import Foundation
import Combine

// A verified USB port is not proof that a vehicle ECU has answered.
enum BridgeContract {
    enum Problem: LocalizedError {
        case invalidAddress, weakToken, disconnected, invalidResponse, unauthorized, rejected
        var errorDescription: String? {
            switch self {
            case .invalidAddress: return "Enter a trusted HTTPS URL for the local USB host (no path or credentials)."
            case .weakToken: return "The gateway pairing token is missing or too short."
            case .disconnected: return "The local USB gateway is not connected."
            case .invalidResponse: return "Gateway response was not verified; no ECU will be marked online."
            case .unauthorized: return "Gateway rejected the token. Pair again."
            case .rejected: return "Gateway rejected the identity request."
            }
        }
    }

    enum Profile: String, CaseIterable, Identifiable {
        case dme = "dme-me72"
        case egs = "egs-gs8602"
        var id: String { rawValue }
        var moduleId: String { self == .dme ? "dme" : "egs" }
        var protocolName: String { self == .dme ? "bmw-kwp" : "bmw-ds2" }
        var title: String { self == .dme ? "DME ME7.2 · identity" : "EGS GS8.60.2 · identity" }
    }

    struct Status: Decodable {
        let state: String
        let moduleIds: [String]
        let codecs: [String]
        let arbitraryWritesEnabled: Bool
    }

    struct Identity: Decodable {
        let moduleId: String
        let protocolName: String
        let identity: String
        let status: String
        let responseHex: String

        enum CodingKeys: String, CodingKey {
            case moduleId, identity, status, responseHex
            case protocolName = "protocol"
        }
    }

    // Construct this only after verify(_:profile:) has independently parsed the raw ECU frame.
    struct VerifiedEvidence: Equatable {
        let moduleId: String
        let protocolName: String
        let identity: String
        let responseHex: String
        let capturedAt: Date
    }

    static func report(_ evidence: [VerifiedEvidence]) -> String {
        var lines = [
            "Hanna & Ada Diagnostics — BMW ECU identity evidence",
            "Scope: read-only identity probes only; this is not a complete vehicle scan.",
            "Only independently validated replies are included. No host URL, pairing token or user credentials are exported.",
        ]
        guard !evidence.isEmpty else {
            lines.append("No verified ECU identities are available.")
            return lines.joined(separator: "\n")
        }
        let timestamp = ISO8601DateFormatter()
        timestamp.formatOptions = [.withInternetDateTime]
        for item in evidence.sorted(by: { $0.moduleId < $1.moduleId }) {
            lines.append("")
            lines.append("Module: \(item.moduleId.uppercased())")
            lines.append("Protocol: \(item.protocolName)")
            lines.append("Identity: \(item.identity)")
            lines.append("Captured (UTC): \(timestamp.string(from: item.capturedAt))")
            lines.append("Raw validated ECU response: \(item.responseHex)")
        }
        return lines.joined(separator: "\n")
    }

    static func endpoint(_ raw: String) throws -> URL {
        let address = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: address),
              parts.scheme?.lowercased() == "https", parts.host?.isEmpty == false,
              parts.user == nil, parts.password == nil, parts.query == nil,
              parts.fragment == nil, parts.path.isEmpty || parts.path == "/",
              let url = parts.url else { throw Problem.invalidAddress }
        return url
    }

    static func verify(_ status: Status) throws -> Bool {
        guard !status.arbitraryWritesEnabled,
              status.codecs.contains("bmw-ds2"), status.codecs.contains("bmw-kwp"),
              ["USB_OPEN_NOT_ECU_VERIFIED", "USB_DISCONNECTED"].contains(status.state) else {
            throw Problem.invalidResponse
        }
        return status.state == "USB_OPEN_NOT_ECU_VERIFIED"
    }

    static func verify(_ identity: Identity, profile: Profile) throws -> String {
        guard identity.status == "VERIFIED_ONLINE",
              identity.moduleId == profile.moduleId,
              identity.protocolName == profile.protocolName,
              (6...128).contains(identity.identity.count),
              identity.identity.utf8.allSatisfy({ $0 >= 32 && $0 <= 126 }) else {
            throw Problem.invalidResponse
        }

        // Validate the RAW ECU frame independently of the gateway's JSON claims.
        // Never promote a module based on responseHex merely being nonempty.
        let tokens = identity.responseHex.split(separator: " ")
        guard (4...260).contains(tokens.count), tokens.allSatisfy({
            $0.count == 2 && $0.allSatisfy({ $0.isASCII && $0.isHexDigit })
        }) else { throw Problem.invalidResponse }
        var bytes: [UInt8] = []
        bytes.reserveCapacity(tokens.count)
        for token in tokens {
            guard let value = UInt8(token, radix: 16) else { throw Problem.invalidResponse }
            bytes.append(value)
        }
        guard bytes.dropLast().reduce(UInt8(0), { $0 ^ $1 }) == bytes.last else {
            throw Problem.invalidResponse
        }

        let payload: [UInt8]
        switch profile {
        case .egs:
            guard bytes.count <= 255, bytes[0] == 0x32,
                  Int(bytes[1]) == bytes.count else { throw Problem.invalidResponse }
            payload = Array(bytes[2..<(bytes.count - 1)])
        case .dme:
            guard bytes.count >= 6, bytes[0] == 0xB8,
                  bytes[1] == 0xF1, bytes[2] == 0x12,
                  Int(bytes[3]) + 5 == bytes.count else { throw Problem.invalidResponse }
            payload = Array(bytes[4..<(bytes.count - 1)])
        }
        let positive: UInt8 = profile == .egs ? 0xA0 : 0xE2
        guard payload.first == positive else { throw Problem.invalidResponse }

        // Same conservative evidence rule as gateway/bmw_frames.py: the longest
        // run of >=6 printable ASCII characters after a positive service byte.
        var runs: [String] = []
        var current: [UInt8] = []
        for byte in payload.dropFirst() {
            if (0x20...0x7E).contains(byte) {
                current.append(byte)
            } else {
                if current.count >= 6 { runs.append(String(decoding: current, as: UTF8.self)) }
                current.removeAll(keepingCapacity: true)
            }
        }
        if current.count >= 6 { runs.append(String(decoding: current, as: UTF8.self)) }
        var longest = ""
        for run in runs where run.count > longest.count { longest = run }
        guard longest.count >= 6, String(longest.prefix(128)) == identity.identity else {
            throw Problem.invalidResponse
        }
        return identity.identity
    }
}

@MainActor
final class LocalBridgeClient: ObservableObject {
    @Published private(set) var usbOpen = false
    @Published private(set) var busy = false
    @Published private(set) var message = "No local USB host connected. Carista BLE remains separate."
    @Published private(set) var identities: [String: String] = [:]
    @Published private(set) var evidence: [String: BridgeContract.VerifiedEvidence] = [:]

    var reportText: String { BridgeContract.report(Array(evidence.values)) }

    private var origin: URL?
    private var token: String = ""
    private var session: URLSession?
    private var generation = 0

    func disconnect() {
        generation += 1
        session?.invalidateAndCancel()
        session = nil
        origin = nil
        token = ""
        usbOpen = false
        busy = false
        identities.removeAll()
        evidence.removeAll()
        message = "Disconnected. All BMW ECU evidence cleared."
    }

    func connect(address: String, token supplied: String) async {
        disconnect()
        let current = generation
        busy = true
        defer { if generation == current { busy = false } }
        do {
            let url = try BridgeContract.endpoint(address)
            let secret = supplied.trimmingCharacters(in: .whitespacesAndNewlines)
            guard secret.count >= 32 else { throw BridgeContract.Problem.weakToken }
            origin = url
            token = secret
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 8
            configuration.timeoutIntervalForResource = 12
            session = URLSession(configuration: configuration)
            let status: BridgeContract.Status = try await request("v1/status")
            guard generation == current else { return }
            usbOpen = try BridgeContract.verify(status)
            message = usbOpen
                ? "USB host connected over HTTPS. No ECU verified yet."
                : "Gateway responds but USB adapter is disconnected."
        } catch {
            guard generation == current else { return }
            disconnect()
            message = "Connection failed: \(error.localizedDescription)"
        }
    }

    func probe(_ profile: BridgeContract.Profile) async {
        guard usbOpen && !busy else { return }
        let current = generation
        busy = true
        identities.removeValue(forKey: profile.moduleId)
        evidence.removeValue(forKey: profile.moduleId)
        defer { if generation == current { busy = false } }
        do {
            let body = try JSONEncoder().encode(["profile": profile.rawValue])
            let response: BridgeContract.Identity = try await request("v1/identity", body: body)
            guard generation == current else { return }
            let identity = try BridgeContract.verify(response, profile: profile)
            identities[profile.moduleId] = identity
            evidence[profile.moduleId] = BridgeContract.VerifiedEvidence(
                moduleId: response.moduleId,
                protocolName: response.protocolName,
                identity: identity,
                responseHex: response.responseHex,
                capturedAt: Date()
            )
            message = "\(profile.moduleId.uppercased()): verified ECU identity from local host."
        } catch {
            guard generation == current else { return }
            disconnect() // A bus/protocol failure may invalidate every previous identity.
            message = "ECU not verified: \(error.localizedDescription)"
        }
    }

    private func request<T: Decodable>(_ route: String, body: Data? = nil) async throws -> T {
        guard let origin, let session, !token.isEmpty else { throw BridgeContract.Problem.disconnected }
        var request = URLRequest(url: origin.appendingPathComponent(route))
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw BridgeContract.Problem.invalidResponse }
        if http.statusCode == 401 { throw BridgeContract.Problem.unauthorized }
        guard http.statusCode == 200, data.count <= 8192 else { throw BridgeContract.Problem.rejected }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
