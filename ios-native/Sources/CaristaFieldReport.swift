import Foundation

/// Formats evidence already obtained by the iPhone. It never issues an OBD command.
enum CaristaFieldReport {
    static func render(
        capturedAt: Date,
        state: String,
        status: String,
        adapterIdentity: String,
        protocolName: String,
        supportedPIDs: Set<Int>,
        rpm: Double?,
        coolant: Double?,
        storedDTCs: [String],
        rawLog: [String]
    ) -> String {
        // Match BluetoothOBDManager.ConnectionState.ecu exactly; a BLE/ATI reply
        // alone must not mark either generic OBD-II or BMW modules verified.
        let ecuVerified = state == "OBD-II ECU ONLINE"
        let time = ISO8601DateFormatter().string(from: capturedAt)
        let pids = supportedPIDs.sorted().map { String(format: "%02X", $0) }.joined(separator: ", ")
        let dtcs = storedDTCs.joined(separator: ", ")
        var lines = [
            "HANNA & ADA — CARISTA / iPHONE FIELD REPORT",
            "Captured UTC: \(time)",
            "Connection state: \(state)",
            "ECU verified by valid OBD Mode 01 PID bitmap: \(ecuVerified ? "YES" : "NO")",
            "Status: \(status)",
            "Adapter identity (ATI): \(adapterIdentity)",
            "Reported protocol (ATDP): \(protocolName)",
            "Supported PID 01–20: \(pids.isEmpty ? "not verified / none declared" : pids)",
            "RPM: \(rpm.map { String(format: "%.0f rpm", $0) } ?? "not read")",
            "Coolant: \(coolant.map { String(format: "%.0f C", $0) } ?? "not read")",
            "Stored DTCs shown: \(dtcs.isEmpty ? "none displayed (read may not have been run)" : dtcs)",
            "",
            "RAW BLE / ELM TRANSCRIPT (up to last 300 lines):"
        ]
        if rawLog.isEmpty {
            lines.append("No transcript captured.")
        } else {
            lines.append(contentsOf: rawLog.suffix(300))
        }
        lines += [
            "",
            "This report is read-only. BLE or ATI alone does not verify the vehicle ECU.",
            "Review before sharing: raw replies may contain a VIN or other identifiers."
        ]
        return lines.joined(separator: "\n")
    }
}
