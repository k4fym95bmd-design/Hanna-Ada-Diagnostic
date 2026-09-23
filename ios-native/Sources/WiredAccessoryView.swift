import SwiftUI
import ExternalAccessory

/// Enumerates only accessories that iOS already exposes to this application.
/// This does not open a generic FTDI port or claim a BMW ECU connection.
@MainActor
final class WiredAccessoryState: ObservableObject {
    @Published private(set) var accessoryNames: [String] = []
    @Published private(set) var status = "Nie sprawdzono akcesoriów."
    @Published private(set) var evidenceStage: EvidenceStage = .noCable

    func refresh() {
        let accessories = EAAccessoryManager.shared().connectedAccessories
        accessoryNames = accessories.map { $0.name }
        evidenceStage = accessories.isEmpty ? .noCable : .usbSeen
        status = accessories.isEmpty
            ? "iOS nie udostępnia aplikacji żadnego akcesorium przewodowego."
            : "Wykryto akcesorium w iOS. To nie potwierdza protokołu, dostępu szeregowego ani ECU."
    }

    func startWatching() {
        EAAccessoryManager.shared().registerForLocalNotifications()
        refresh()
    }

    func stopWatching() {
        EAAccessoryManager.shared().unregisterForLocalNotifications()
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
                        Label("AKCESORIA UDOSTĘPNIONE PRZEZ iOS", systemImage: "cable.connector")
                            .font(.headline)
                        Text(hardware.status).foregroundStyle(.secondary)
                        Text("Evidence Contract v\(EvidenceContract.version) · \(hardware.evidenceStage.rawValue)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                        ForEach(Array(hardware.accessoryNames.enumerated()), id: \.offset) { item in
                            Label(item.element, systemImage: "cable.connector")
                                .foregroundStyle(.orange)
                        }
                        Text("Lista odświeża się także po podłączeniu lub odłączeniu akcesorium, gdy ta zakładka jest otwarta.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button {
                            hardware.refresh()
                        } label: {
                            Label("ODŚWIEŻ AKCESORIA", systemImage: "arrow.clockwise")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 64)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                panel {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("KABEL K+DCAN · VID:PID NIEZWERYFIKOWANY", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                            .foregroundStyle(.orange)
                        Text("Rodzina USB-serial wykryta na innym urządzeniu nie oznacza, że iPhone udostępni ten sam port. iOS nie może zakładać VID:PID ani sterownika tego egzemplarza kabla bez własnego dowodu.")
                            .foregroundStyle(.secondary)
                        Text("Połączenie przewodowe wymaga akcesorium zgodnego z iOS, udokumentowanego protokołu i odpowiednich uprawnień aplikacji. Nie pokazujemy przycisku Połącz bez tej weryfikacji.")
                            .foregroundStyle(.secondary)
                    }
                }
                panel {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("BLUETOOTH LE TO OSOBNY TOR", systemImage: "waveform.path")
                            .font(.headline)
                            .foregroundStyle(.blue)
                        Text("Zakładka BLE używa CoreBluetooth. Połączenie BLE nie zastępuje fizycznego dostępu do K-Line przez kabel.")
                            .foregroundStyle(.secondary)
                    }
                }
                Text("Status pochodzi z iOS · bez symulowanych połączeń ECU")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(18)
        }
        .background(background.ignoresSafeArea())
        .onAppear { hardware.startWatching() }
        .onDisappear { hardware.stopWatching() }
        .onReceive(NotificationCenter.default.publisher(for: .EAAccessoryDidConnect)) { _ in
            hardware.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: .EAAccessoryDidDisconnect)) { _ in
            hardware.refresh()
        }
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(panelColor, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.10)))
    }
}
