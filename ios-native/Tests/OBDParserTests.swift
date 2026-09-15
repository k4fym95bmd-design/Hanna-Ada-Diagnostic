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
}
