import Foundation
import XCTest
@testable import HannaAdaDiag

final class EvidenceReportTests: XCTestCase {
    func testEmptyReportNeverClaimsAnyEcuOnline() {
        let text = BridgeContract.report([])
        XCTAssertTrue(text.contains("No verified ECU identities are available."))
        XCTAssertFalse(text.contains("VERIFIED_ONLINE"))
        XCTAssertFalse(text.contains("Raw validated ECU response:"))
    }

    func testReportIncludesOnlyValidatedEvidenceWithoutNetworkSecrets() {
        let evidence = BridgeContract.VerifiedEvidence(
            moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366",
            responseHex: "B8 F1 12 09 E2 37 35 30 36 33 36 36 FF 9A",
            capturedAt: Date(timeIntervalSince1970: 0)
        )
        let text = BridgeContract.report([evidence])
        XCTAssertTrue(text.contains("Module: DME"))
        XCTAssertTrue(text.contains("Identity: 7506366"))
        XCTAssertTrue(text.contains("Captured (UTC): 1970-01-01T00:00:00Z"))
        XCTAssertTrue(text.contains("Raw validated ECU response: B8 F1"))
        XCTAssertFalse(text.contains("Bearer "))
        XCTAssertFalse(text.contains("https://"))
        XCTAssertFalse(text.contains("ECU fault codes"))
    }

    func testEvidenceReportOrderingIsDeterministic() {
        let timestamp = Date(timeIntervalSince1970: 0)
        let egs = BridgeContract.VerifiedEvidence(
            moduleId: "egs", protocolName: "bmw-ds2", identity: "1423953",
            responseHex: "32 04 00 36", capturedAt: timestamp
        )
        let dme = BridgeContract.VerifiedEvidence(
            moduleId: "dme", protocolName: "bmw-kwp", identity: "7506366",
            responseHex: "B8 F1 12 01 E2 00", capturedAt: timestamp
        )
        XCTAssertEqual(BridgeContract.report([egs, dme]), BridgeContract.report([dme, egs]))
    }
}
