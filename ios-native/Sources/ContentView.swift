import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var obd: BluetoothOBDManager
    @State private var showRaw = false

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    header
                    stateCard
                    connectionCard
                    liveCard
                    coilsCard
                    dtcCard
                    rawCard
                }
                .padding(16)
            }
            .background(Color(red: 0.025, green: 0.035, blue: 0.05).ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(.blue)
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 15).fill(Color.blue.opacity(0.12))
                Image(systemName: "gauge.with.dots.needle.67percent")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(.blue)
            }
            .frame(width: 58, height: 58)
            VStack(alignment: .leading, spacing: 2) {
                Text("Hanna & Ada").font(.title2.bold())
                Text("BMW E39 540i V8 · Native iOS")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Circle().fill(obd.state == .ecu ? Color.green : obd.state == .error ? Color.red : Color.blue)
                .frame(width: 10, height: 10)
        }
    }

    private var stateCard: some View {
        panel {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label(obd.state.rawValue, systemImage: "dot.radiowaves.left.and.right")
                        .font(.headline.monospaced())
                    Spacer()
                    Text(obd.protocolName).font(.caption.monospaced()).foregroundStyle(.secondary)
                }
                Text(obd.status).font(.subheadline).foregroundStyle(obd.state == .error ? .red : .secondary)
                LazyVGrid(columns: columns, spacing: 10) {
                    metric("Adapter", obd.adapterIdentity)
                    metric("PID 01–20", "\(obd.supportedPIDs.count)")
                    metric("Voltage", obd.adapterVoltage.map { String(format: "%.2f V", $0) } ?? "—")
                    metric("Transport", "CoreBluetooth")
                }
            }
        }
    }

    private var connectionCard: some View {
        panel {
            VStack(alignment: .leading, spacing: 12) {
                Text("VCI / CONNECTION").font(.caption.bold()).foregroundStyle(.blue)
                if obd.state == .disconnected || obd.state == .error || obd.state == .scanning {
                    Button {
                        obd.scan()
                    } label: {
                        Label(obd.state == .scanning ? "SCANNING…" : "SCAN CARISTA / OBD BLE", systemImage: "bluetooth")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(obd.state == .scanning)
                }

                ForEach(obd.devices) { device in
                    Button {
                        obd.connect(to: device)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(device.name).font(.headline)
                                Text("\(device.rssi) dBm").font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderless)
                }

                if obd.state != .disconnected && obd.state != .scanning {
                    Button(role: .destructive) { obd.disconnect() } label: {
                        Label("DISCONNECT", systemImage: "xmark.circle")
                    }
                }
            }
        }
    }

    private var liveCard: some View {
        panel {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("LIVE DATA").font(.caption.bold()).foregroundStyle(.blue)
                        Text("Real ECU values only").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("READ") { Task { await obd.readLive() } }
                        .buttonStyle(.bordered)
                        .disabled(obd.state != .ecu)
                }
                LazyVGrid(columns: columns, spacing: 10) {
                    metric("RPM", obd.rpm.map { String(format: "%.0f rpm", $0) } ?? "—")
                    metric("Coolant", obd.coolant.map { String(format: "%.0f °C", $0) } ?? "—")
                }
            }
        }
    }

    private var coilsCard: some View {
        panel {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("IGNITION COILS 1–8").font(.caption.bold()).foregroundStyle(.blue)
                        Text("Misfire correlation · BMW E39 V8")
                            .font(.subheadline.bold())
                    }
                    Spacer()
                    Button("READ MISFIRE DTC") { Task { await obd.readDTCs() } }
                        .buttonStyle(.bordered)
                        .disabled(obd.state != .ecu)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 8) {
                    ForEach(1...8, id: \.self) { cylinder in
                        let code = "P030\(cylinder)"
                        let active = obd.dtcs.contains(code)
                        VStack(spacing: 3) {
                            Text("CYL \(cylinder)").font(.caption2.monospaced())
                            Image(systemName: active ? "bolt.trianglebadge.exclamationmark.fill" : "bolt.horizontal.circle")
                                .foregroundStyle(active ? Color.red : Color.blue)
                            Text(active ? code : "—").font(.caption2.monospaced())
                        }
                        .frame(maxWidth: .infinity, minHeight: 72)
                        .background((active ? Color.red : Color.blue).opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke((active ? Color.red : Color.blue).opacity(0.35)))
                    }
                }
                Text("P0301–P0308 are mapped to cylinders 1–8. P0300 is shown as random/multiple misfire. A true BMW cylinder cut-out/coil activation test remains locked until the K-Line/DS2/KWP path is validated for the exact DME.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var dtcCard: some View {
        panel {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("STORED DTC · MODE 03").font(.caption.bold()).foregroundStyle(.red)
                    Spacer()
                    Button("READ") { Task { await obd.readDTCs() } }
                        .buttonStyle(.bordered)
                        .disabled(obd.state != .ecu)
                }
                if obd.dtcs.isEmpty {
                    Text("No result yet").foregroundStyle(.secondary)
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(obd.dtcs, id: \.self) { code in
                            Text(code)
                                .font(.system(.body, design: .monospaced, weight: .bold))
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(Color.red.opacity(0.12), in: Capsule())
                        }
                    }
                }
            }
        }
    }

    private var rawCard: some View {
        panel {
            DisclosureGroup(isExpanded: $showRaw) {
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(obd.rawLog.suffix(120).enumerated()), id: \.offset) { _, line in
                            Text(line).font(.caption2.monospaced()).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .frame(maxHeight: 260)
            } label: {
                Text("RAW BLE / ELM TRANSCRIPT").font(.caption.bold())
            }
        }
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(red: 0.055, green: 0.07, blue: 0.09), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.09)))
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption2.monospaced()).foregroundStyle(.secondary)
            Text(value.isEmpty ? "—" : value).font(.subheadline.bold().monospaced()).lineLimit(2)
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
        .background(Color.black.opacity(0.2), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
