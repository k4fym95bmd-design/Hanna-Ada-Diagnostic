import SwiftUI

@main
struct HannaAdaDiagApp: App {
    @StateObject private var obd = BluetoothOBDManager()

    var body: some Scene {
        WindowGroup {
            TabView {
                ContentView()
                    .environmentObject(obd)
                    .safeAreaInset(edge: .bottom) {
                        if !obd.rawLog.isEmpty {
                            VStack(spacing: 4) {
                                ShareLink(
                                    item: CaristaFieldReport.render(
                                        capturedAt: Date(),
                                        state: obd.state.rawValue,
                                        status: obd.status,
                                        adapterIdentity: obd.adapterIdentity,
                                        protocolName: obd.protocolName,
                                        supportedPIDs: obd.supportedPIDs,
                                        rpm: obd.rpm,
                                        coolant: obd.coolant,
                                        storedDTCs: obd.dtcs,
                                        rawLog: obd.rawLog
                                    )
                                ) {
                                    Label("SHARE CARISTA TEST REPORT", systemImage: "square.and.arrow.up")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent)
                                Text("Review RAW replies for VIN or identifiers before sharing.")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color(red: 0.025, green: 0.035, blue: 0.05))
                        }
                    }
                    .tabItem { Label("Bluetooth LE", systemImage: "dot.radiowaves.left.and.right") }

                WiredAccessoryView()
                    .tabItem { Label("Kabel", systemImage: "cable.connector") }
            }
            .tint(.blue)
            .preferredColorScheme(.dark)
        }
    }
}
