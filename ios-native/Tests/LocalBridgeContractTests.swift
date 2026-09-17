import XCTest
@testable import HannaAdaDiag

final class LocalBridgeContractTests: XCTestCase {
    func testRequiresHttpsLocalGatewayWithoutEmbeddedCredentials() throws {
        let url = try BridgeContract.endpoint("https://192.168.1.25:8443")
        XCTAssertEqual(url.scheme, "https")
        XCTAssertThrowsError(try BridgeContract.endpoint("http://192.168.1.25:8443"))
        XCTAssertThrowsError(try BridgeContract.endpoint("https://token:secret@192.168.1.25:8443"))
        XCTAssertThrowsError(try BridgeContract.endpoint("https://192.168.1.25:8443/v1/identity"))
        XCTAssertThrowsError(try BridgeContract.endpoint("https://192.168.1.25:8443?token=secret"))
    }

    func testAnOpenUsbPortDoesNotVerifyAnEcu() throws {
        let status = BridgeContract.Status(state: "USB_OPEN_NOT_ECU_VERIFIED", moduleIds: [], codecs: ["bmw-ds2", "bmw-kwp"], arbitraryWritesEnabled: false)
        XCTAssertTrue(try BridgeContract.verify(status))
        XCTAssertFalse(try BridgeContract.verify(BridgeContract.Status(state: "USB_DISCONNECTED", moduleIds: [], codecs: ["bmw-ds2", "bmw-kwp"], arbitraryWritesEnabled: false)))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Status(state: "USB_OPEN_NOT_ECU_VERIFIED", moduleIds: ["dme"], codecs: ["bmw-ds2", "bmw-kwp"], arbitraryWritesEnabled: true)))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Status(state: "ECU_ONLINE", moduleIds: ["dme"], codecs: ["bmw-ds2", "bmw-kwp"], arbitraryWritesEnabled: false)))
    }

    // Synthetic fixture for the protocol validator, not evidence of a real vehicle response.
    // The previous six-byte fixture was structurally invalid: it contained neither
    // the claimed ASCII ECU identity nor a valid KWP payload length/checksum.
    private func validKwpIdentityFrame(_ identity: String) -> String {
        let payload = [UInt8(0xE2)] + Array(identity.utf8) + [0xFF]
        let body = [UInt8(0xB8), 0xF1, 0x12, UInt8(payload.count)] + payload
        let checksum = body.reduce(UInt8(0), ^)
        return (body + [checksum]).map { String(format: "%02X", $0) }.joined(separator: " ")
    }

    func testOnlyMatchingVerifiedIdentityCanEnableAModule() throws {
        let responseHex = validKwpIdentityFrame("7506366")
        let reply = BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366", status: "VERIFIED_ONLINE", responseHex: responseHex)
        XCTAssertEqual(try BridgeContract.verify(reply, profile: .dme), "7506366")
        XCTAssertThrowsError(try BridgeContract.verify(reply, profile: .egs))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366", status: "NOT_VERIFIED", responseHex: responseHex), profile: .dme))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366", status: "VERIFIED_ONLINE", responseHex: ""), profile: .dme))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "9999999", status: "VERIFIED_ONLINE", responseHex: responseHex), profile: .dme))
    }
}
