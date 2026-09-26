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
        case ecu = "OBD-II ECU ONLINE"
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

    // Candidate ELM-over-BLE profiles: a UUID match alone does not establish
    // compatibility with every Carista OBD/EVO firmware revision.
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
    private var disconnectingPeripheral: CBPeripheral?
    private var pendingConnection: (peripheral: CBPeripheral, name: String)?
    private var disconnectWatchdog = BLEDisconnectWatchdog()
    private var disconnectWatchdogTask: Task<Void, Never>?
    private var writeCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var discoveryRemaining = 0
    private var epoch = 0
    private var receiveBuffer = ""
    private var pendingContinuation: CheckedContinuation<String, Error>?
    private var pendingTimer: Timer?
    private var pendingCommandEpoch: Int?
    private var pendingCommandToken: UInt64 = 0
    private var commandSequence: UInt64 = 0
    private var commandChannelDesynced = false
    private var handshakeStarted = false
    private var selectedOBDProtocolNumber: String?

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
        central.stopScan()
        abandonDisconnectOwnership()
        if let old = peripheral {
            central.cancelPeripheralConnection(old)
        }
        resetSession(keepDevices: false)
        let scanEpoch = epoch
        state = .scanning
        status = "Scanning for BLE OBD adapters…"
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(7))
            guard self.epoch == scanEpoch, self.state == .scanning else { return }
            self.central.stopScan()
            self.status = self.devices.isEmpty ? "No BLE OBD adapter found" : "Select an adapter"
        }
    }

    func connect(to device: Device) {
        guard let candidate = peripherals[device.id] else { return }
        central.stopScan()

        if let old = peripheral {
            pendingConnection = (candidate, device.name)
            beginDisconnect(old)
            resetSession(keepDevices: true)
            state = .ble
            status = "Closing previous BLE session before reconnect…"
            return
        }

        if disconnectingPeripheral != nil {
            pendingConnection = (candidate, device.name)
            state = .ble
            status = "Waiting for previous BLE session to close…"
            return
        }

        startConnection(candidate, name: device.name)
    }

    func disconnect() {
        central.stopScan()
        abandonDisconnectOwnership()
        if let old = peripheral {
            central.cancelPeripheralConnection(old)
        }
        resetSession(keepDevices: true)
        state = .disconnected
        status = "Disconnected"
    }

    func suspendForBackground() {
        central.stopScan()
        abandonDisconnectOwnership()
        if let old = peripheral {
            central.cancelPeripheralConnection(old)
        }
        resetSession(keepDevices: true)
        state = .disconnected
        status = "Paused while app is not active"
    }

    private func beginDisconnect(_ current: CBPeripheral) {
        disconnectingPeripheral = current
        disconnectWatchdogTask?.cancel()
        let token = disconnectWatchdog.begin()
        let identifier = current.identifier

        disconnectWatchdogTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled,
                  let self,
                  self.disconnectWatchdog.owns(token),
                  self.disconnectingPeripheral?.identifier == identifier else { return }

            _ = self.disconnectWatchdog.complete(token)
            self.disconnectWatchdogTask = nil
            self.central.stopScan()
            if let stale = self.disconnectingPeripheral {
                self.central.cancelPeripheralConnection(stale)
            }
            self.pendingConnection = nil
            self.disconnectingPeripheral = nil
            self.resetSession(keepDevices: true)
            self.state = .error
            self.status = "Previous BLE session did not confirm disconnect; retry connection"
        }

        central.cancelPeripheralConnection(current)
    }

    private func cancelDisconnectWatchdog() {
        disconnectWatchdogTask?.cancel()
        disconnectWatchdogTask = nil
        disconnectWatchdog.invalidate()
    }

    private func abandonDisconnectOwnership() {
        cancelDisconnectWatchdog()
        if let stale = disconnectingPeripheral {
            central.cancelPeripheralConnection(stale)
        }
        disconnectingPeripheral = nil
        pendingConnection = nil
    }

    private func startConnection(_ candidate: CBPeripheral, name: String) {
        guard central.state == .poweredOn, disconnectingPeripheral == nil else {
            pendingConnection = (candidate, name)
            return
        }
        pendingConnection = nil
        peripheral = candidate
        candidate.delegate = self
        state = .ble
        status = "Connecting to \(name)…"
        central.connect(candidate, options: nil)
    }

    private func finishDisconnect(_ disconnected: CBPeripheral, error: Error?) {
        guard disconnectingPeripheral === disconnected else { return }
        cancelDisconnectWatchdog()
        disconnectingPeripheral = nil

        if commandChannelDesynced {
            // Preserve the stronger fail-closed state. A late CoreBluetooth
            // disconnect callback must not downgrade "reconnect required".
            pendingConnection = nil
            state = .error
            if !status.contains("reconnect required") {
                status = "BLE response correlation lost · reconnect required"
            }
            return
        }

        if let pending = pendingConnection {
            pendingConnection = nil
            startConnection(pending.peripheral, name: pending.name)
        } else if state != .scanning {
            state = .disconnected
            status = error?.localizedDescription ?? "Disconnected"
        }
    }

    func readLive() async {
        guard state == .ecu else { return }
        let operationEpoch = epoch
        rpm = nil
        coolant = nil
        do {
            if supportedPIDs.contains(0x0C) {
                let value = try OBDParser.rpm(from: try await command("010C", timeout: 5))
                guard operationEpoch == epoch else { return }
                rpm = value
            }
            if supportedPIDs.contains(0x05) {
                let value = try OBDParser.coolant(from: try await command("0105", timeout: 5))
                guard operationEpoch == epoch else { return }
                coolant = value
            }
            status = "Generic OBD-II live values updated"
        } catch {
            if operationEpoch == epoch { status = error.localizedDescription }
        }
    }

    func readDTCs() async {
        guard state == .ecu else { return }
        let operationEpoch = epoch
        dtcs = []
        do {
            // ATDPN (not ATI or a guess based on byte parity) identifies the
            // protocol actually selected by ELM after the valid PID 0100 reply.
            let codes = try OBDParser.dtcs(from: try await command("03", timeout: 10),
                                           protocolNumber: selectedOBDProtocolNumber)
            guard operationEpoch == epoch else { return }
            dtcs = codes
            status = dtcs.isEmpty ? "No stored Mode 03 DTCs" : "\(dtcs.count) stored DTC(s)"
        } catch {
            if operationEpoch == epoch { status = error.localizedDescription }
        }
    }

    func command(_ command: String, timeout: TimeInterval = 6) async throws -> String {
        guard let peripheral, let writeCharacteristic, let notifyCharacteristic else {
            throw OBDParserError.adapterError("GATT channel unavailable")
        }
        guard pendingContinuation == nil else {
            throw OBDParserError.adapterError("Previous ELM command still pending")
        }
        guard !commandChannelDesynced else {
            throw OBDParserError.adapterError("BLE response correlation lost; reconnect required")
        }
        guard notifyCharacteristic.isNotifying else {
            throw OBDParserError.adapterError("Notifications are not active")
        }

        let commandEpoch = epoch
        commandSequence = commandSequence == UInt64.max ? 1 : commandSequence + 1
        let commandToken = commandSequence
        receiveBuffer = ""
        appendLog("TX  \(command)")

        return try await withCheckedThrowingContinuation { continuation in
            pendingContinuation = continuation
            pendingCommandEpoch = commandEpoch
            pendingCommandToken = commandToken
            pendingTimer?.invalidate()
            pendingTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
                Task { @MainActor in
                    guard let self,
                          self.epoch == commandEpoch,
                          self.pendingCommandEpoch == commandEpoch,
                          self.pendingCommandToken == commandToken,
                          let pending = self.clearPendingCommand() else { return }
                    self.markCommandChannelDesynced("Timeout waiting for \(command)")
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
        let operationEpoch = epoch
        do {
            status = "Initializing ELM…"
            for cmd in ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSTFF", "ATSP0"] {
                _ = try await command(cmd, timeout: cmd == "ATZ" ? 9 : 5)
                guard operationEpoch == epoch else { return }
            }
            let identityRaw = try await command("ATI", timeout: 5)
            guard operationEpoch == epoch else { return }
            adapterIdentity = OBDParser.clean(identityRaw).replacingOccurrences(of: "ATI", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
            state = .adapter
            status = "Adapter online · verifying generic OBD ECU…"
            let pidRaw = try await command("0100", timeout: 15)
            guard operationEpoch == epoch else { return }
            supportedPIDs = try OBDParser.supportedPIDs01to20(from: pidRaw)

            // Evidence first: ask for the protocol number before any descriptive
            // protocol text. Only ATDPN can authorize protocol-aware unframed
            // DTC decoding; ATDP is display-only fallback.
            let protocolNumberRaw = try? await command("ATDPN", timeout: 5)
            guard operationEpoch == epoch else { return }
            if let protocolNumberRaw,
               OBDParser.vehicleBusKind(fromATDPN: protocolNumberRaw) != nil {
                selectedOBDProtocolNumber = protocolNumberRaw
                let cleanedNumber = OBDParser.clean(protocolNumberRaw)
                    .replacingOccurrences(of: "ATDPN", with: "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                protocolName = cleanedNumber.isEmpty ? "Verified by ATDPN" : "ELM protocol \(cleanedNumber)"
                appendLog("SYS  Vehicle protocol verified by ATDPN")
            } else {
                selectedOBDProtocolNumber = nil
                appendLog("SYS  ATDPN unavailable/unknown; unframed DTC decoding locked")

                if let protocolRaw = try? await command("ATDP", timeout: 5) {
                    guard operationEpoch == epoch else { return }
                    protocolName = OBDParser.clean(protocolRaw)
                        .replacingOccurrences(of: "ATDP", with: "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                } else {
                    guard operationEpoch == epoch else { return }
                    protocolName = "—"
                }
            }
            if let voltageRaw = try? await command("ATRV", timeout: 5) {
                guard operationEpoch == epoch else { return }
                let cleaned = OBDParser.clean(voltageRaw)
                let pattern = /([0-9]+(?:\.[0-9]+)?)\s*V/
                if let match = cleaned.firstMatch(of: pattern) { adapterVoltage = Double(match.1) }
            }
            guard operationEpoch == epoch else { return }
            state = .ecu
            status = "Generic OBD-II ECU ONLINE · \(supportedPIDs.count) PIDs; BMW modules not verified"
        } catch {
            guard operationEpoch == epoch else { return }
            state = .error
            status = error.localizedDescription
            appendLog("ERR \(error.localizedDescription)")
        }
    }

    private func chooseSerialCharacteristics(from service: CBService) {
        guard writeCharacteristic == nil, notifyCharacteristic == nil, let chars = service.characteristics else { return }
        var pair: (CBCharacteristic, CBCharacteristic)?
        if service.uuid == caristaService {
            if let write = chars.first(where: { $0.uuid == caristaWrite && ($0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)) }),
               let notify = chars.first(where: { $0.uuid == caristaNotify && ($0.properties.contains(.notify) || $0.properties.contains(.indicate)) }) {
                pair = (write, notify)
            }
        } else if service.uuid == ffe0Service {
            if let shared = chars.first(where: { $0.uuid == ffe1Characteristic && ($0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)) && ($0.properties.contains(.notify) || $0.properties.contains(.indicate)) }) {
                pair = (shared, shared)
            }
        } else if service.uuid == nusService {
            if let write = chars.first(where: { $0.uuid == nusWrite && ($0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)) }),
               let notify = chars.first(where: { $0.uuid == nusNotify && ($0.properties.contains(.notify) || $0.properties.contains(.indicate)) }) {
                pair = (write, notify)
            }
        }
        guard let (write, notify) = pair, let peripheral else { return }
        writeCharacteristic = write
        notifyCharacteristic = notify
        appendLog("SYS  GATT serial \(service.uuid.uuidString): RX \(notify.uuid.uuidString) TX \(write.uuid.uuidString)")
        peripheral.setNotifyValue(true, for: notify)
    }

    private func clearPendingCommand() -> CheckedContinuation<String, Error>? {
        pendingTimer?.invalidate()
        pendingTimer = nil
        let pending = pendingContinuation
        pendingContinuation = nil
        pendingCommandEpoch = nil
        pendingCommandToken = 0
        receiveBuffer = ""
        return pending
    }

    private func markCommandChannelDesynced(_ reason: String) {
        if let current = peripheral {
            beginDisconnect(current)
        }
        resetSession(keepDevices: true)
        commandChannelDesynced = true
        state = .error
        status = "\(reason) · reconnect required"
    }

    private func resetSession(keepDevices: Bool) {
        epoch &+= 1
        let pending = clearPendingCommand()
        pending?.resume(throwing: OBDParserError.adapterError("Session reset"))
        commandChannelDesynced = false
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        discoveryRemaining = 0
        receiveBuffer = ""
        handshakeStarted = false
        selectedOBDProtocolNumber = nil
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
                self.pendingConnection = nil
                self.cancelDisconnectWatchdog()
                self.disconnectingPeripheral = nil
                self.resetSession(keepDevices: true)
                self.state = .disconnected
                self.status = "Bluetooth unavailable: \(String(describing: central.state))"
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        Task { @MainActor in
            guard self.state == .scanning else { return }
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
            guard self.peripheral === peripheral else { return }
            self.state = .ble
            self.status = "BLE connected · discovering GATT…"
            peripheral.discoverServices(nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            if self.disconnectingPeripheral === peripheral {
                self.finishDisconnect(peripheral, error: error)
                return
            }
            guard self.peripheral === peripheral else { return }
            self.resetSession(keepDevices: true)
            self.state = .error
            self.status = error?.localizedDescription ?? "BLE connection failed"
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            if self.disconnectingPeripheral === peripheral {
                self.finishDisconnect(peripheral, error: error)
                return
            }
            guard self.peripheral === peripheral else { return }
            self.resetSession(keepDevices: true)
            self.state = .disconnected
            self.status = error?.localizedDescription ?? "Disconnected"
        }
    }
}

extension BluetoothOBDManager: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        Task { @MainActor in
            guard self.peripheral === peripheral else { return }
            if let error {
                self.state = .error
                self.status = error.localizedDescription
                return
            }
            self.state = .gatt
            let services = peripheral.services ?? []
            guard !services.isEmpty else {
                self.state = .error
                self.status = "No BLE GATT services reported by adapter"
                return
            }
            self.appendLog("SYS  GATT services: \(services.map { $0.uuid.uuidString }.joined(separator: ", "))")
            self.discoveryRemaining = services.count
            for service in services { peripheral.discoverCharacteristics(nil, for: service) }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        Task { @MainActor in
            guard self.peripheral === peripheral else { return }
            if let error { self.appendLog("ERR GATT \(error.localizedDescription)") }
            else {
                self.appendLog("SYS  GATT \(service.uuid.uuidString) characteristics: \((service.characteristics ?? []).map { $0.uuid.uuidString }.joined(separator: ", "))")
                self.chooseSerialCharacteristics(from: service)
            }
            self.discoveryRemaining = max(0, self.discoveryRemaining - 1)
            if self.discoveryRemaining == 0 && (self.writeCharacteristic == nil || self.notifyCharacteristic == nil) {
                self.state = .error
                self.status = "No supported ELM BLE serial service; adapter may use a proprietary protocol"
            } else if self.writeCharacteristic != nil && self.notifyCharacteristic != nil {
                self.status = "BLE serial channel found · enabling notifications…"
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            guard self.peripheral === peripheral, let selected = self.notifyCharacteristic, characteristic === selected else { return }
            if let error {
                self.state = .error
                self.status = error.localizedDescription
                return
            }
            guard characteristic.isNotifying else { return }
            self.status = "Notifications active · starting ELM handshake…"
            await self.startHandshake()
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            guard self.peripheral === peripheral,
                  let selected = self.writeCharacteristic,
                  characteristic === selected,
                  let error,
                  self.pendingCommandEpoch == self.epoch,
                  self.pendingCommandToken != 0,
                  let pending = self.clearPendingCommand() else { return }
            self.markCommandChannelDesynced("GATT write failed")
            self.appendLog("ERR GATT write: \(error.localizedDescription)")
            pending.resume(throwing: error)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            guard self.peripheral === peripheral,
                  let selected = self.notifyCharacteristic,
                  characteristic === selected,
                  self.pendingCommandEpoch == self.epoch,
                  self.pendingCommandToken != 0 else { return }
            if let error {
                let pending = self.clearPendingCommand()
                self.markCommandChannelDesynced("GATT notification failed")
                pending?.resume(throwing: error)
                return
            }
            guard self.pendingContinuation != nil,
                  let data = characteristic.value,
                  let chunk = String(data: data, encoding: .utf8) else { return }
            self.receiveBuffer += chunk
            self.appendLog("RX  \(OBDParser.clean(chunk))")
            if self.receiveBuffer.utf8.count > 16384 {
                let pending = self.clearPendingCommand()
                self.markCommandChannelDesynced("Oversized BLE response")
                pending?.resume(throwing: OBDParserError.adapterError("Oversized BLE response"))
                return
            }
            guard let prompt = self.receiveBuffer.firstIndex(of: ">") else { return }
            let response = String(self.receiveBuffer[...prompt])
            guard let pending = self.clearPendingCommand() else { return }
            pending.resume(returning: response)
        }
    }
}
