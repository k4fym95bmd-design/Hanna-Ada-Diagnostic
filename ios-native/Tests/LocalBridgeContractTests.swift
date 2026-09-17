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
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Status(state: "USB_OPEN_NOT_ECU_VERIFIED", moduleIds: [], codecs: ["bmw-ds2", "bmw-kwp"], arbitraryWritesEnabled: true)))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Status(state: "ECU_ONLINE", moduleIds: ["dme"], codecs: ["bmw-ds2", "bmw-kwp"], arbitraryWritesEnabled: false)))
    }

    func testOnlyMatchingVerifiedIdentityCanEnableAModule() throws {
        let reply = BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366", status: "VERIFIED_ONLINE", responseHex: "B8 F1 12 01 E2 00")
        XCTAssertEqual(try BridgeContract.verify(reply, profile: .dme), "7506366")
        XCTAssertThrowsError(try BridgeContract.verify(reply, profile: .egs))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366", status: "NOT_VERIFIED", responseHex: "B8 F1 12 01 E2 00"), profile: .dme))
        XCTAssertThrowsError(try BridgeContract.verify(BridgeContract.Identity(moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366", status: "VERIFIED_ONLINE", responseHex: ""), profile: .dme))
    }
}
