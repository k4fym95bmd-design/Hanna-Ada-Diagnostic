import SwiftUI

@main
struct HannaAdaDiagApp: App {
    @StateObject private var obd = BluetoothOBDManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(obd)
                .preferredColorScheme(.dark)
        }
    }
}
