import Foundation
import CoreBluetooth

@MainActor
final class BluetoothOBDManager: NSObject, ObservableObject {
    enum ConnectionState: String {
        case disconnected = "DISCONNECTED"
        case scanning = "SCANNING"
        case ble = "BLE"
        case gatt = "GATT"
        case adapter = "ADAPTER"
        case ecu = "ECU ONLINE"
        case error = "ERROR"
    }

    struct Device: Identifiable, Hashable {
        let id: UUID
        let name: String
        let rssi: Int
    }

    @Published var state: ConnectionState = .disconnected
    @Published var devices: [Device] = []
    @Published var status = "Ready"
    @Published var adapterIdentity = "—"
    @Published var protocolName = "—"
    @Published var adapterVoltage: Double?
    @Published var supportedPIDs = Set<Int>()
    @Published var rpm: Double?
    @Published var coolant: Double?
    @Published var dtcs: [String] = []
    @Published var rawLog: [String] = []

    private let caristaService = CBUUID(string: "FFF0")
    private let caristaNotify = CBUUID(string: "FFF1")
    private let caristaWrite = CBUUID(string: "FFF2")
    private let ffe0Service = CBUUID(string: "FFE0")
    private let ffe1Characteristic = CBUUID(string: "FFE1")
    private let nusService = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    private let nusWrite = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    private let nusNotify = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var receiveBuffer = ""
    private var pendingContinuation: CheckedContinuation<String, Error>?
    private var pendingTimer: Timer?
    private var handshakeStarted = false

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func scan() {
        guard central.state == .poweredOn else {
            state = .error
            status = "Bluetooth is not available"
            return
        }
        resetSession(keepDevices: false)
        state = .scanning
        status = "Scanning for BLE OBD adapters…"
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(7))
            if self.state == .scanning {
                self.central.stopScan()
                self.status = self.devices.isEmpty ? "No BLE OBD adapter found" : "Select an adapter"
            }
        }
    }

    func connect(to device: Device) {
        guard let candidate = peripherals[device.id] else { return }
        central.stopScan()
        resetSession(keepDevices: true)
        peripheral = candidate
        candidate.delegate = self
        state = .ble
        status = "Connecting to \(device.name)…"
        central.connect(candidate, options: nil)
    }

    func disconnect() {
        if let peripheral { central.cancelPeripheralConnection(peripheral) }
        resetSession(keepDevices: true)
        state = .disconnected
        status = "Disconnected"
    }

    func readLive() async {
        guard state == .ecu else { return }
        do {
            if supportedPIDs.contains(0x0C) {
                rpm = try OBDParser.rpm(from: try await command("010C", timeout: 5))
            }
            if supportedPIDs.contains(0x05) {
                coolant = try OBDParser.coolant(from: try await command("0105", timeout: 5))
            }
            status = "Live values updated"
        } catch {
            status = error.localizedDescription
        }
    }

    func readDTCs() async {
        guard state == .ecu else { return }
        do {
            dtcs = try OBDParser.dtcs(from: try await command("03", timeout: 10))
            status = dtcs.isEmpty ? "No stored Mode 03 DTCs" : "\(dtcs.count) stored DTC(s)"
        } catch {
            status = error.localizedDescription
        }
    }

    func command(_ command: String, timeout: TimeInterval = 6) async throws -> String {
        guard let peripheral, let writeCharacteristic, let notifyCharacteristic else {
            throw OBDParserError.adapterError("GATT channel unavailable")
        }
        guard pendingContinuation == nil else {
            throw OBDParserError.adapterError("Previous ELM command still pending")
        }
        guard notifyCharacteristic.isNotifying else {
            throw OBDParserError.adapterError("Notifications are not active")
        }

        receiveBuffer = ""
        appendLog("TX  \(command)")
        return try await withCheckedThrowingContinuation { continuation in
            pendingContinuation = continuation
            pendingTimer?.invalidate()
            pendingTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
                Task { @MainActor in
                    guard let self, let pending = self.pendingContinuation else { return }
                    self.pendingContinuation = nil
                    self.appendLog("ERR Timeout: \(command)")
                    pending.resume(throwing: OBDParserError.adapterError("Timeout waiting for \(command)"))
                }
            }

            let payload = Data((command.trimmingCharacters(in: .whitespacesAndNewlines) + "\r").utf8)
            let type: CBCharacteristicWriteType = writeCharacteristic.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
            peripheral.writeValue(payload, for: writeCharacteristic, type: type)
        }
    }

    private func startHandshake() async {
        guard !handshakeStarted else { return }
        handshakeStarted = true
        do {
            status = "Initializing ELM…"
            for cmd in ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSTFF", "ATSP0"] {
                _ = try await command(cmd, timeout: cmd == "ATZ" ? 9 : 5)
            }

            let identityRaw = try await command("ATI", timeout: 5)
            adapterIdentity = OBDParser.clean(identityRaw).replacingOccurrences(of: "ATI", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
            state = .adapter

            status = "Adapter online · verifying ECU…"
            let pidRaw = try await command("0100", timeout: 15)
            do {
                supportedPIDs = try OBDParser.supportedPIDs01to20(from: pidRaw)
            } catch {
                appendLog("RAW 0100  \(OBDParser.clean(pidRaw))")
                throw error
            }

            let protocolRaw = try await command("ATDP", timeout: 5)
            protocolName = OBDParser.clean(protocolRaw).replacingOccurrences(of: "ATDP", with: "").trimmingCharacters(in: .whitespacesAndNewlines)

            if let voltageRaw = try? await command("ATRV", timeout: 5) {
                let cleaned = OBDParser.clean(voltageRaw)
                let pattern = /([0-9]+(?:\.[0-9]+)?)\s*V/
                if let match = cleaned.firstMatch(of: pattern) { adapterVoltage = Double(match.1) }
            }

            state = .ecu
            status = "ECU ONLINE · \(supportedPIDs.count) PID(s) declared"
        } catch {
            state = .error
            status = error.localizedDescription
            appendLog("ERR \(error.localizedDescription)")
        }
    }

    private func chooseSerialCharacteristics(from service: CBService) {
        guard let characteristics = service.characteristics else { return }

        if service.uuid == caristaService {
            writeCharacteristic = characteristics.first(where: { $0.uuid == caristaWrite && ($0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)) })
            notifyCharacteristic = characteristics.first(where: { $0.uuid == caristaNotify && ($0.properties.contains(.notify) || $0.properties.contains(.indicate)) })
        } else if service.uuid == ffe0Service {
            if let shared = characteristics.first(where: { $0.uuid == ffe1Characteristic }) {
                if shared.properties.contains(.write) || shared.properties.contains(.writeWithoutResponse) { writeCharacteristic = shared }
                if shared.properties.contains(.notify) || shared.properties.contains(.indicate) { notifyCharacteristic = shared }
            }
        } else if service.uuid == nusService {
            writeCharacteristic = characteristics.first(where: { $0.uuid == nusWrite })
            notifyCharacteristic = characteristics.first(where: { $0.uuid == nusNotify })
        }

        if writeCharacteristic == nil {
            writeCharacteristic = characteristics.first(where: { $0.properties.contains(.writeWithoutResponse) || $0.properties.contains(.write) })
        }
        if notifyCharacteristic == nil {
            notifyCharacteristic = characteristics.first(where: { $0.properties.contains(.notify) || $0.properties.contains(.indicate) })
        }

        if let notifyCharacteristic, let peripheral, !notifyCharacteristic.isNotifying {
            peripheral.setNotifyValue(true, for: notifyCharacteristic)
        }
    }

    private func resetSession(keepDevices: Bool) {
        pendingTimer?.invalidate()
        pendingTimer = nil
        pendingContinuation?.resume(throwing: OBDParserError.adapterError("Session reset"))
        pendingContinuation = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        receiveBuffer = ""
        handshakeStarted = false
        adapterIdentity = "—"
        protocolName = "—"
        adapterVoltage = nil
        supportedPIDs = []
        rpm = nil
        coolant = nil
        dtcs = []
        if !keepDevices {
            devices = []
            peripherals = [:]
        }
    }

    private func appendLog(_ line: String) {
        rawLog.append(line)
        if rawLog.count > 300 { rawLog.removeFirst(rawLog.count - 300) }
    }
}

extension BluetoothOBDManager: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            if central.state != .poweredOn {
                self.state = .disconnected
                self.status = "Bluetooth: \(String(describing: central.state))"
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        Task { @MainActor in
            let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? "BLE device"
            let relevant = name.localizedCaseInsensitiveContains("carista") || name.localizedCaseInsensitiveContains("obd") || name.localizedCaseInsensitiveContains("vlink") || name.localizedCaseInsensitiveContains("veepeak")
            guard relevant else { return }
            self.peripherals[peripheral.identifier] = peripheral
            let item = Device(id: peripheral.identifier, name: name, rssi: RSSI.intValue)
            if let index = self.devices.firstIndex(where: { $0.id == item.id }) { self.devices[index] = item }
            else { self.devices.append(item) }
            self.devices.sort { $0.rssi > $1.rssi }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            self.state = .ble
            self.status = "BLE connected · discovering GATT…"
            peripheral.discoverServices(nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            self.state = .error
            self.status = error?.localizedDescription ?? "BLE connection failed"
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            self.resetSession(keepDevices: true)
            self.state = .disconnected
            self.status = error?.localizedDescription ?? "Disconnected"
        }
    }
}

extension BluetoothOBDManager: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        Task { @MainActor in
            if let error {
                self.state = .error
                self.status = error.localizedDescription
                return
            }
            self.state = .gatt
            let services = peripheral.services ?? []
            for service in services {
                peripheral.discoverCharacteristics(nil, for: service)
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        Task { @MainActor in
            if let error {
                self.appendLog("ERR GATT \(error.localizedDescription)")
                return
            }
            self.chooseSerialCharacteristics(from: service)
            if self.writeCharacteristic != nil && self.notifyCharacteristic != nil {
                self.status = "GATT serial channel found · enabling notifications…"
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            if let error {
                self.state = .error
                self.status = error.localizedDescription
                return
            }
            guard characteristic.uuid == self.notifyCharacteristic?.uuid, characteristic.isNotifying else { return }
            self.status = "Notifications active · starting ELM handshake…"
            await self.startHandshake()
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            if let error {
                self.pendingTimer?.invalidate()
                self.pendingTimer = nil
                if let pending = self.pendingContinuation {
                    self.pendingContinuation = nil
                    pending.resume(throwing: error)
                }
                return
            }
            guard let data = characteristic.value, let chunk = String(data: data, encoding: .utf8) else { return }
            self.receiveBuffer += chunk
            self.appendLog("RX  \(OBDParser.clean(chunk))")
            guard let prompt = self.receiveBuffer.firstIndex(of: ">"), let pending = self.pendingContinuation else { return }
            let response = String(self.receiveBuffer[...prompt])
            self.receiveBuffer = String(self.receiveBuffer[self.receiveBuffer.index(after: prompt)...])
            self.pendingTimer?.invalidate()
            self.pendingTimer = nil
            self.pendingContinuation = nil
            pending.resume(returning: response)
        }
    }
}
