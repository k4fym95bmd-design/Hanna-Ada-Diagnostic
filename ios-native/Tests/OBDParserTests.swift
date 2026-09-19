import XCTest
@testable import HannaAdaDiag

final class OBDParserTests: XCTestCase {
    func testSinglePIDBitmap() throws {
        let pids = try OBDParser.supportedPIDs01to20(from: "41 00 BE 3E B8 13\r>")
        XCTAssertTrue(pids.contains(1))
        XCTAssertTrue(pids.contains(32))
    }

    func testMultiplePIDBitmapRespondersAreUnioned() throws {
        let raw = "41 00 80 00 00 00\r41 00 00 00 00 01\r>"
        let pids = try OBDParser.supportedPIDs01to20(from: raw)
        XCTAssertEqual(pids, Set([1, 32]))
    }

    func testEchoHeadersAndMultipleResponders() throws {
        let raw = "0100\rSEARCHING...\r7E8 06 41 00 80 00 00 00\r7E9 06 41 00 00 00 00 01\r>"
        let pids = try OBDParser.supportedPIDs01to20(from: raw)
        XCTAssertEqual(pids, Set([1, 32]))
    }

    func testTruncatedPositiveResponseIsRejected() {
        XCTAssertThrowsError(try OBDParser.supportedPIDs01to20(from: "41 00 BE 3E\r>"))
    }

    func testNoDataIsRejected() {
        XCTAssertThrowsError(try OBDParser.supportedPIDs01to20(from: "NO DATA\r>"))
    }

    func testMisfireCylinderMapping() {
        XCTAssertEqual(OBDParser.misfireCylinder(from: "P0308"), 8)
        XCTAssertNil(OBDParser.misfireCylinder(from: "P0300"))
        XCTAssertNil(OBDParser.misfireCylinder(from: "P0310"))
    }

    func testValidMode03ReportsMisfireCylinderEight() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 03 08 00 00\r>"), ["P0308"])
    }

    func testValidMode03ZeroDTCs() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 00 00 00 00\r>"), [])
    }

    func testMode03WithoutDTCBytesIsNotReportedAsNoFaults() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43\r>")) { error in
            guard case OBDParserError.truncatedResponse = error else {
                return XCTFail("Expected incomplete ECU response, got \(error)")
            }
        }
    }

    func testMode03WithOrphanedDTCByteIsRejected() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 03\r>"))
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 03 08 00\r>"))
    }

    func testMode03RejectsMalformedSecondResponderRatherThanClearingFaults() {
        let raw = "43 00 00\r43 03\r>"
        XCTAssertThrowsError(try OBDParser.dtcs(from: raw))
    }
}
