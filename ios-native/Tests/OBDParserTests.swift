import XCTest
@testable import HannaAdaDiag

final class OBDParserTests: XCTestCase {
    func testSinglePIDBitmap() throws {
        let pids = try OBDParser.supportedPIDs01to20(from: "41 00 BE 3E B8 13\r>")
        XCTAssertTrue(pids.contains(1))
        XCTAssertTrue(pids.contains(32))
    }

    func testMultiplePIDBitmapRespondersAreUnioned() throws {
        let pids = try OBDParser.supportedPIDs01to20(from: "41 00 80 00 00 00\r41 00 00 00 00 01\r>")
        XCTAssertEqual(pids, Set([1, 32]))
    }

    func testEchoHeadersAndMultipleResponders() throws {
        let raw = "0100\rSEARCHING...\r7E8 06 41 00 80 00 00 00\r7E9 06 41 00 00 00 00 01\r>"
        XCTAssertEqual(try OBDParser.supportedPIDs01to20(from: raw), Set([1, 32]))
    }

    func testTruncatedPositiveResponseIsRejected() {
        XCTAssertThrowsError(try OBDParser.supportedPIDs01to20(from: "41 00 BE 3E\r>"))
    }

    func testTruncatedSecondECUCannotBeHiddenByValidFirstECU() {
        XCTAssertThrowsError(try OBDParser.supportedPIDs01to20(from: "41 00 BE 3E B8 13\r41 00 80 00\r>")) { error in
            guard case OBDParserError.truncatedResponse = error else { return XCTFail("Expected truncation: \(error)") }
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

    func testATDPNClassifiesOnlyActualKnownProtocols() {
        for raw in ["3", "A3\r>", "ATDPN\rA4\r>", "1", "5"] {
            XCTAssertEqual(OBDParser.vehicleBusKind(fromATDPN: raw), .legacy)
        }
        for raw in ["6", "A6\r>", "ATDPN\rA9\r>", "7", "8"] {
            XCTAssertEqual(OBDParser.vehicleBusKind(fromATDPN: raw), .can)
        }
        for raw in ["", "0", "A0", "A", "A3GARBAGE", "ELM327 v2.2", "ISO 9141-2", "?", "B"] {
            XCTAssertNil(OBDParser.vehicleBusKind(fromATDPN: raw))
        }
        XCTAssertNil(OBDParser.vehicleBusKind(fromATDPN: nil))
    }

    func testVerifiedLegacyMode03ReportsMisfireCylinderEight() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 03 08 00 00\r>", protocolNumber: "A3"), ["P0308"])
    }

    func testVerifiedLegacyMode03ZeroDTCs() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 00 00 00 00\r>", protocolNumber: "3"), [])
    }

    func testVerifiedCANUnframedCountIsNotDecodedAsDTC() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 01 03 08\r>", protocolNumber: "A6"), ["P0308"])
        XCTAssertEqual(try OBDParser.dtcs(from: "43 01 03 08 00 00\r>", protocolNumber: "6"), ["P0308"])
    }

    func testLegacyAndCANUseDifferentDecodingForAmbiguousSameLengthData() throws {
        let legacy = "43 01 33 00 00 00 00\r>"
        let can = "43 01 03 08 00 00 00\r>"
        XCTAssertEqual(try OBDParser.dtcs(from: legacy, protocolNumber: "A3"), ["P0133"])
        XCTAssertEqual(try OBDParser.dtcs(from: can, protocolNumber: "A6"), ["P0308"])
        XCTAssertThrowsError(try OBDParser.dtcs(from: legacy))
        XCTAssertThrowsError(try OBDParser.dtcs(from: can))
    }

    func testVerifiedCANUnframedZeroCountIsConfirmed() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "43 00\r>", protocolNumber: "6"), [])
        XCTAssertEqual(try OBDParser.dtcs(from: "43 00 00 00\r>", protocolNumber: "A7"), [])
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 00\r>", protocolNumber: "3"))
    }

    func testUnknownProtocolNeverProducesFalseNoFaults() {
        for raw in ["43 00", "43 00 00", "43 03 08 00 00", "43 01 03 08"] {
            XCTAssertThrowsError(try OBDParser.dtcs(from: raw + "\r>"))
        }
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 00\r>", protocolNumber: "A0"))
    }

    func testCANMode03FramedSingleCodeIgnoresBusPadding() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "7E8 04 43 01 03 08 AA AA AA\r>"), ["P0308"])
    }

    func testCANFrameContradictingVerifiedLegacyProtocolFails() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "7E8 04 43 01 03 08 00 00 00\r>", protocolNumber: "3"))
    }

    func testCANMode03FramedZeroCountIsConfirmed() throws {
        XCTAssertEqual(try OBDParser.dtcs(from: "7E8 02 43 00 AA AA AA AA AA\r>"), [])
    }

    func testCANMode03MultipleValidRespondersCombineCodes() throws {
        let raw = "7E8 04 43 01 03 08 00 00 00\r7E9 04 43 01 01 33 00 00 00\r>"
        XCTAssertEqual(try OBDParser.dtcs(from: raw), ["P0133", "P0308"])
    }

    func testCANMode03RejectsMalformedSecondResponder() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 01 03 08\r43 02 01 33\r>", protocolNumber: "6"))
    }

    func testCANMode03TruncatedSingleFrameIsRejected() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "7E8 04 43 01 03\r>"))
    }

    func testCANMode03UnsupportedMultiFrameFailsClosed() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "7E8 10 0A 43 03 01 33\r>"))
    }

    func testMode03WithoutDTCBytesIsNotReportedAsNoFaults() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43\r>", protocolNumber: "3"))
    }

    func testMode03WithOrphanedDTCByteIsRejected() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 03\r>", protocolNumber: "3"))
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 03 08 00\r>", protocolNumber: "3"))
    }

    func testMode03RejectsMalformedSecondResponderRatherThanClearingFaults() {
        XCTAssertThrowsError(try OBDParser.dtcs(from: "43 00 00\r43 03\r>", protocolNumber: "3"))
    }
}
