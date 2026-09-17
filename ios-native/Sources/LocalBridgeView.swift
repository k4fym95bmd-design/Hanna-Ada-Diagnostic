import SwiftUI

struct LocalBridgeView: View {
    @StateObject private var bridge = LocalBridgeClient()
    @State private var host = ""
    @State private var pairingToken = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("LOCAL BMW VCI").font(.title2.bold()).foregroundStyle(.blue)
                        Text("E39 540i · 1999 · 20-pin diagnostic connection")
                            .font(.caption.monospaced()).foregroundStyle(.secondary)
                        Text("Connect an OS-recognized USB K-line interface through an HTTPS gateway on your own LAN. This phone does not drive the FTDI USB cable directly.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("HOST / PAIRING").font(.caption.bold()).foregroundStyle(.blue)
                        TextField("https://your-local-host:8443", text: $host)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .textFieldStyle(.roundedBorder)
                            .disabled(bridge.usbOpen || bridge.busy)
                        SecureField("Local gateway bearer token", text: $pairingToken)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                            .disabled(bridge.usbOpen || bridge.busy)
                        Text("HTTPS with a certificate trusted by iOS is mandatory. Pairing token stays in memory and is never saved to a server or report.")
                            .font(.caption).foregroundStyle(.secondary)
                        if bridge.usbOpen {
                            Button(role: .destructive) {
                                bridge.disconnect()
                                pairingToken = ""
                            } label: {
                                Label("DISCONNECT LOCAL VCI", systemImage: "xmark.circle")
                            }
                            .buttonStyle(.bordered)
                        } else {
                            Button {
                                Task {
                                    await bridge.connect(address: host, token: pairingToken)
                                    pairingToken = ""
                                }
                            } label: {
                                Label(bridge.busy ? "CONNECTING…" : "CONNECT LOCAL USB HOST", systemImage: "cable.connector")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(bridge.busy || host.isEmpty || pairingToken.isEmpty)
                        }
                    }
                    .padding(15)
                    .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("VEHICLE EVIDENCE").font(.caption.bold()).foregroundStyle(.blue)
                            Spacer()
                            Text(bridge.usbOpen ? "USB OPEN" : "NOT CONNECTED")
                                .font(.caption2.monospaced())
                                .foregroundStyle(bridge.usbOpen ? .blue : .secondary)
                        }
                        Text(bridge.message).font(.subheadline)
                        Text("USB OPEN ≠ ECU ONLINE. Each ECU needs its own validated reply.")
                            .font(.caption.bold()).foregroundStyle(.orange)
                        ForEach(BridgeContract.Profile.allCases) { profile in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(profile.title).font(.subheadline.bold())
                                    Spacer()
                                    Text(bridge.identities[profile.moduleId] == nil ? "UNVERIFIED" : "VERIFIED")
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(bridge.identities[profile.moduleId] == nil ? .orange : .green)
                                }
                                if let identity = bridge.identities[profile.moduleId] {
                                    Text(identity).font(.caption.monospaced()).textSelection(.enabled)
                                }
                                if let evidence = bridge.evidence[profile.moduleId] {
                                    Text("VALIDATED ECU FRAME · \(evidence.protocolName)")
                                        .font(.caption2.bold()).foregroundStyle(.secondary)
                                    Text(evidence.responseHex)
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(.secondary)
                                        .textSelection(.enabled)
                                }
                                Button("READ ECU IDENTITY") {
                                    Task { await bridge.probe(profile) }
                                }
                                .buttonStyle(.bordered)
                                .disabled(!bridge.usbOpen || bridge.busy)
                            }
                            .padding(12)
                            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
                        }
                        if !bridge.evidence.isEmpty {
                            ShareLink(item: bridge.reportText) {
                                Label("EXPORT VERIFIED ECU REPORT", systemImage: "square.and.arrow.up")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            Text("Export contains ECU identity and raw diagnostic bytes. Review the destination before sharing. Host address and pairing token are not included. Export before disconnecting: evidence is erased from memory on disconnect.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Text("Read-only identity probes only. Fault clearing, activation, coding, adaptation and flashing remain unavailable.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(15)
                    .background(Color(red: 0.055, green: 0.07, blue: 0.09), in: RoundedRectangle(cornerRadius: 14))
                }
                .padding(16)
            }
            .background(Color(red: 0.025, green: 0.035, blue: 0.05).ignoresSafeArea())
            .navigationTitle("BMW USB Bridge")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onDisappear { bridge.disconnect() }
    }
}
