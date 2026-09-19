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

    func testTruncatedSecondECUCannotBeHiddenByValidFirstECU() {
        let raw = "41 00 BE 3E B8 13\r41 00 80 00\r>"
        XCTAssertThrowsError(try OBDParser.supportedPIDs01to20(from: raw)) { error in
            guard case OBDParserError.truncatedResponse = error else {
                return XCTFail("Expected incomplete ECU response, got \(error)")
            }
        }
    }

    func testTruncatedLiveValueCannotBeHiddenByValidFirstResponder() {
        XCTAssertThrowsError(try OBDParser.rpm(from: "41 0C 1A F8\r41 0C 1A\r>"))
    }

    func testNoDataIsRejected() {
        XCTAssertThrowsError(try OBDParser.supportedPIDs01to20(from: "NO DATA\r>"))
    }

    func testMisfireCylinderMapping() {
        XCTAssertEqual(OBDParser.misfireCylinder(from: "P0308"), 8)
        XCTAssertNil(OBDParser.misfireCylinder(from: "P0300"))
        XCTAssertNil(OBDParser.misfireCylinder(from: "P0310"))
    }

    func testValidLegacyMode03ReportsMisfireCylinderEight() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 03 08 00 00\r>"), ["P0308"])
    }

    func testValidLegacyMode03ZeroDTCs() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 00 00 00 00\r>"), [])
    }

    func testCANMode03UnframedCountIsNotDecodedAsDTC() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 01 03 08\r>"), ["P0308"])
    }

    func testCANMode03UnframedCountAndZeroPadding() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 01 03 08 00 00\r>"), ["P0308"])
    }

    func testCANMode03FramedSingleCodeIgnoresBusPadding() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "7E8 04 43 01 03 08 AA AA AA\r>"), ["P0308"])
    }

    func testCANMode03FramedZeroCountIsConfirmed() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "7E8 02 43 00 AA AA AA AA AA\r>"), [])
    }

    func testCANMode03MultipleValidRespondersCombineCodes() throws {
        let raw = "7E8 04 43 01 03 08 00 00 00\r7E9 04 43 01 01 33 00 00 00\r>"
        XCTAssertEqual(try OBDParser.dtcs(from: raw), ["P0133", "P0308"])
    }

    func testCANMode03TruncatedSingleFrameIsRejected() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "7E8 04 43 01 03\r>"))
    }

    func testCANMode03UnsupportedMultiFrameFailsClosed() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "7E8 10 0A 43 03 01 33\r>"))
    }

    func testMode03WithoutDTCBytesIsNotReportedAsNoFaults() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43\r>")) { error in
            guard case OBDParserError.truncatedResponse = error else {
                return XCTFail("Expected incomplete ECU response, got \(error)")
            }
        }
    }

    func testMode03UnframedCountOnlyIsNotReportedAsNoFaults() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 00\r>"))
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
