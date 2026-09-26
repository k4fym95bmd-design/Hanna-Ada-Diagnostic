import XCTest
@testable import HannaAdaDiag

final class BLEDisconnectWatchdogTests: XCTestCase {
    func testNewestDisconnectOwnsWatchdog() {
        var gate = BLEDisconnectWatchdog()
        let first = gate.begin()
        XCTAssertTrue(gate.owns(first))

        let second = gate.begin()
        XCTAssertFalse(gate.owns(first))
        XCTAssertTrue(gate.owns(second))
    }

    func testStaleTimeoutCannotCompleteNewDisconnect() {
        var gate = BLEDisconnectWatchdog()
        let first = gate.begin()
        let second = gate.begin()

        XCTAssertFalse(gate.complete(first))
        XCTAssertTrue(gate.owns(second))
        XCTAssertTrue(gate.complete(second))
        XCTAssertNil(gate.activeToken)
    }

    func testInvalidateDropsOutstandingOwnership() {
        var gate = BLEDisconnectWatchdog()
        let token = gate.begin()

        gate.invalidate()

        XCTAssertFalse(gate.owns(token))
        XCTAssertNil(gate.activeToken)
    }
}
