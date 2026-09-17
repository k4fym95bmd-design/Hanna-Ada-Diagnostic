import SwiftUI

@main
struct HannaAdaDiagApp: App {
    @StateObject private var obd = BluetoothOBDManager()

    var body: some Scene {
        WindowGroup {
            TabView {
                ContentView()
                    .environmentObject(obd)
                    .tabItem { Label("Carista OBD", systemImage: "waveform.path.ecg") }
                LocalBridgeView()
                    .tabItem { Label("BMW USB", systemImage: "cable.connector") }
            }
            .preferredColorScheme(.dark)
        }
    }
}
