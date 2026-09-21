import SwiftUI
import ExternalAccessory

/// Only reports accessories the iOS ExternalAccessory framework actually exposes.
/// Generic USB FTDI (0403:6001) is NOT a publicly available iPhone serial port.
@MainActor
final class WiredAccessoryState: ObservableObject {
    @Published private(set) var accessoryNames: [String] = []
    @Published private(set) var status = "Nie sprawdzono akcesoriów."

    func refresh() {
        let accessories = EAAccessoryManager.shared().connectedAccessories
        // Only locally show accessory names; never copy serial numbers, VIN or addresses.
        accessoryNames = accessories.map { $0.name }
        status = accessories.isEmpty
            ? "iOS nie udostępnia aplikacji zgodnego akcesorium MFi."
            : "Wykryto akcesorium systemowe. Protokół i uprawnienia wymagają potwierdzenia producenta."
    }
}

struct WiredAccessoryView: View {
    @StateObject private var hardware = WiredAccessoryState()
    private let background = Color(red: 0.025, green: 0.035, blue: 0.05)
    private let panelColor = Color(red: 0.055, green: 0.075, blue: 0.105)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 14) {
                    Image(systemName: "cable.connector")
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundStyle(.blue)
                        .frame(width: 66, height: 66)
                        .background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("HANNA & ADA").font(.title2.bold())
                        Text("KABEL / iOS").font(.headline.monospaced())
                    }
                    Spacer()
                }
                panel {
                    VStack(alignment: .leading, spacing: 13) {
                        Label("AKCESORIA WYKRYTE PRZEZ iOS", systemImage: "cable.connector")
                            .font(.headline)
                        Text(hardware.status).foregroundStyle(.secondary)
                        ForEach(hardware.accessoryNames, id: \.self) { name in
                            Label(name, systemImage: "checkmark.circle")
                                .foregroundStyle(.green)
                        }
                        Button {
                            hardware.refresh()
                        } label: {
                            Label("ODŚWIEŻ AKCESORIA", systemImage: "arrow.clockwise")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 54)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                panel {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("TWÓJ KABEL K+DCAN · 0403:6001", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                            .foregroundStyle(.orange)
                        Text("Wykrycie kabla FTDI na Androidzie nie oznacza, że iPhone udostępni jego port USB aplikacji. Publiczne API iOS nie daje naszej aplikacji ogólnego sterownika FTDI, nawet po użyciu samej przejściówki Lightning/USB-C.")
                            .foregroundStyle(.secondary)
                        Text("Połączenie przewodowe w iOS wymaga zgodnego, autoryzowanego akcesorium i udokumentowanego protokołu producenta. Dopóki tego nie potwierdzimy, nie pokażemy fałszywego przycisku POŁĄCZ.")
                            .foregroundStyle(.secondary)
                    }
                }
                panel {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("BLUETOOTH LE JEST ODDZIELNY", systemImage: "waveform.path")
                            .font(.headline)
                            .foregroundStyle(.blue)
                        Text("Zakładka BLE korzysta z istniejącego modułu CoreBluetooth i obsługuje testy zgodnych adapterów Carista/ELM. Nie jest zamiennikiem dostępu K-Line przez USB.")
                            .foregroundStyle(.secondary)
                    }
                }
                Text("Tylko rzeczywisty status sprzętu · bez wymyślonych połączeń ECU")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(18)
        }
        .background(background.ignoresSafeArea())
        .onAppear { hardware.refresh() }
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(panelColor, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.10)))
    }
}
