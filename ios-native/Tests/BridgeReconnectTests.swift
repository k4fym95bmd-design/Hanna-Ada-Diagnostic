import XCTest
@testable import HannaAdaDiag

// HTTP fixtures only. These tests never contact a LAN gateway or a vehicle.
private final class ReconnectProtocol: URLProtocol {
    static var disconnected = true
    static var reopenFails = false
    static var paths: [String] = []
    static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        let path = request.url!.path
        Self.paths.append(path)
        let failed = path == "/v1/connect" && Self.reopenFails
        let closed = path == "/v1/status" && Self.disconnected
        Self.lock.unlock()
        let payload = failed
            ? "{\"state\":\"USB_UNAVAILABLE\"}"
            : "{\"state\":\"\(closed ? "USB_DISCONNECTED" : "USB_OPEN_NOT_ECU_VERIFIED")\",\"moduleIds\":[],\"codecs\":[\"bmw-ds2\",\"bmw-kwp\"],\"arbitraryWritesEnabled\":false}"
        let response = HTTPURLResponse(url: request.url!, statusCode: failed ? 503 : 200,
                                       httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(payload.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class BridgeReconnectTests: XCTestCase {
    @MainActor
    private func client(disconnected: Bool, fails: Bool = false) -> LocalBridgeClient {
        ReconnectProtocol.lock.lock()
        ReconnectProtocol.disconnected = disconnected
        ReconnectProtocol.reopenFails = fails
        ReconnectProtocol.paths = []
        ReconnectProtocol.lock.unlock()
        return LocalBridgeClient(makeConfiguration: {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [ReconnectProtocol.self]
            return configuration
        })
    }

    private func paths() -> [String] {
        ReconnectProtocol.lock.lock()
        defer { ReconnectProtocol.lock.unlock() }
        return ReconnectProtocol.paths
    }

    @MainActor
    func testConnectReopensClosedPortButNeverProbesEcu() async {
        let bridge = client(disconnected: true)
        await bridge.connect(address: "https://gateway.invalid:8443", token: String(repeating: "t", count: 40))
        XCTAssertTrue(bridge.usbOpen)
        XCTAssertFalse(bridge.busy)
        XCTAssertTrue(bridge.identities.isEmpty)
        XCTAssertTrue(bridge.evidence.isEmpty)
        XCTAssertEqual(paths(), ["/v1/status", "/v1/connect"])
        bridge.disconnect()
    }

    @MainActor
    func testOpenPortDoesNotNeedReconnect() async {
        let bridge = client(disconnected: false)
        await bridge.connect(address: "https://gateway.invalid:8443", token: String(repeating: "t", count: 40))
        XCTAssertTrue(bridge.usbOpen)
        XCTAssertEqual(paths(), ["/v1/status"])
        XCTAssertTrue(bridge.evidence.isEmpty)
        bridge.disconnect()
    }

    @MainActor
    func testUnavailablePortDoesNotBecomeConnected() async {
        let bridge = client(disconnected: true, fails: true)
        await bridge.connect(address: "https://gateway.invalid:8443", token: String(repeating: "t", count: 40))
        XCTAssertFalse(bridge.usbOpen)
        XCTAssertFalse(bridge.busy)
        XCTAssertTrue(bridge.evidence.isEmpty)
        XCTAssertEqual(paths(), ["/v1/status", "/v1/connect"])
    }
}
