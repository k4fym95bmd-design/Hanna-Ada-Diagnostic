import XCTest
@testable import HannaAdaDiag

final class BridgeContractTests: XCTestCase {
    private func response(_ hex: String, profile: BridgeContract.Profile, name: String = "1423953") -> BridgeContract.Identity {
        BridgeContract.Identity(
            moduleId: profile.moduleId, protocolName: profile.protocolName,
            identity: name, status: "VERIFIED_ONLINE", responseHex: hex
        )
    }

    private func frame(_ bytes: [UInt8]) -> String {
        let checksum = bytes.reduce(UInt8(0), ^)
        return (bytes + [checksum]).map { String(format: "%02X", $0) }.joined(separator: " ")
    }

    func testValidDS2ECUReplyPasses() throws {
        let payload = [UInt8(0xA0)] + Array("1423953".utf8) + [0xFF]
        let hex = frame([0x32, UInt8(payload.count + 3)] + payload)
        XCTAssertEqual(try BridgeContract.verify(response(hex, profile: .egs), profile: .egs), "1423953")
    }

    func testValidKWPReplyPasses() throws {
        let payload = [UInt8(0xE2)] + Array("7506366".utf8) + [0xFF]
        let hex = frame([0xB8, 0xF1, 0x12, UInt8(payload.count)] + payload)
        XCTAssertEqual(try BridgeContract.verify(response(hex, profile: .dme, name: "7506366"), profile: .dme), "7506366")
    }

    func testRequestEchoCannotMasqueradeAsECUIdentity() {
        XCTAssertThrowsError(try BridgeContract.verify(response("32 04 00 36", profile: .egs), profile: .egs))
    }

    func testChecksumTamperingCannotMarkECUOnline() {
        let payload = [UInt8(0xA0)] + Array("1423953".utf8) + [0xFF]
        var bytes = [UInt8(0x32), UInt8(payload.count + 3)] + payload
        bytes.append(bytes.reduce(UInt8(0), ^) ^ 0x01)
        let hex = bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
        XCTAssertThrowsError(try BridgeContract.verify(response(hex, profile: .egs), profile: .egs))
    }

    func testIncorrectModuleReplyRejectedEvenWhenNamesMatch() {
        let payload = [UInt8(0xA0)] + Array("1423953".utf8) + [0xFF]
        let hex = frame([0x12, UInt8(payload.count + 3)] + payload)
        XCTAssertThrowsError(try BridgeContract.verify(response(hex, profile: .egs), profile: .egs))
    }

    func testServerIdentityMustMatchFramePayload() {
        let payload = [UInt8(0xA0)] + Array("1423953".utf8) + [0xFF]
        let hex = frame([0x32, UInt8(payload.count + 3)] + payload)
        XCTAssertThrowsError(try BridgeContract.verify(response(hex, profile: .egs, name: "7654321"), profile: .egs))
    }
}
