import Foundation

/// Small value-type ownership gate for CoreBluetooth disconnect watchdogs.
/// It never opens a transport; it only prevents stale timeout tasks from
/// mutating a newer BLE lifecycle operation.
struct BLEDisconnectWatchdog {
    private(set) var generation: UInt64 = 0
    private(set) var activeToken: UInt64?

    @discardableResult
    mutating func begin() -> UInt64 {
        generation = generation == UInt64.max ? 1 : generation + 1
        activeToken = generation
        return generation
    }

    func owns(_ token: UInt64) -> Bool {
        token != 0 && activeToken == token
    }

    @discardableResult
    mutating func complete(_ token: UInt64) -> Bool {
        guard owns(token) else { return false }
        activeToken = nil
        return true
    }

    mutating func invalidate() {
        generation = generation == UInt64.max ? 1 : generation + 1
        activeToken = nil
    }
}
