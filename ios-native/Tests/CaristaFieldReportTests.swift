import Foundation
import XCTest
@testable import HannaAdaDiag

final class CaristaFieldReportTests: XCTestCase {
    private let epoch = Date(timeIntervalSince1970: 0)

    func testBluetoothHandshakeDoesNotClaimECUOnline() {
        let report = CaristaFieldReport.render(
            capturedAt: epoch, state: "ADAPTER", status: "ATI replied",
            adapterIdentity: "ELM327", protocolName: "—", supportedPIDs: [],
            rpm: nil, coolant: nil, storedDTCs: [], rawLog: ["TX  ATI", "RX  ELM327"]
        )
        XCTAssertTrue(report.contains("ECU verified by valid OBD Mode 01 PID bitmap: NO"))
        XCTAssertTrue(report.contains("RPM: not read"))
        XCTAssertTrue(report.contains("none displayed (read may not have been run)"))
        XCTAssertFalse(report.contains("P0308"))
        XCTAssertTrue(report.contains("TX  ATI"))
    }

    func testVerifiedValuesAndRawRepliesAreIncludedWithoutInvention() {
        let report = CaristaFieldReport.render(
            capturedAt: epoch, state: "ECU ONLINE", status: "2 PIDs declared",
            adapterIdentity: "ELM327", protocolName: "ISO 9141-2",
            supportedPIDs: [0x0C, 0x05], rpm: 650, coolant: 88,
            storedDTCs: ["P0308"], rawLog: ["TX  0100", "RX  41 00 08 10 00 00"]
        )
        XCTAssertTrue(report.contains("1970-01-01T00:00:00Z"))
        XCTAssertTrue(report.contains("ECU verified by valid OBD Mode 01 PID bitmap: YES"))
        XCTAssertTrue(report.contains("Supported PID 01–20: 05, 0C"))
        XCTAssertTrue(report.contains("RPM: 650 rpm"))
        XCTAssertTrue(report.contains("Coolant: 88 C"))
        XCTAssertTrue(report.contains("Stored DTCs shown: P0308"))
        XCTAssertTrue(report.contains("RX  41 00 08 10 00 00"))
    }

    func testEmptyTranscriptIsExplicitAndSharingWarningIsPresent() {
        let report = CaristaFieldReport.render(
            capturedAt: epoch, state: "DISCONNECTED", status: "Ready",
            adapterIdentity: "—", protocolName: "—", supportedPIDs: [],
            rpm: nil, coolant: nil, storedDTCs: [], rawLog: []
        )
        XCTAssertTrue(report.contains("No transcript captured."))
        XCTAssertTrue(report.contains("Review before sharing"))
        XCTAssertTrue(report.contains("VIN"))
    }
}
