# Hanna & Ada DIAG PRO — Native iOS

This folder is the native iPhone path for Hanna & Ada. It removes the browser Web Bluetooth dependency and uses Apple CoreBluetooth directly.

## Current scope

- Native BLE scan and connection for Carista/ELM327-class adapters.
- Preferred Carista FFF0 / FFF1 / FFF2 UART profile, with FFE0/FFE1 and Nordic UART fallbacks.
- Notification subscription before ELM traffic.
- ELM init: ATZ, ATE0, ATL0, ATS0, ATH0, ATAT1, ATSTFF, ATSP0.
- Adapter identity, ATDP protocol, ATRV supply voltage.
- ECU verification using Mode 01 PID 00.
- PID 0100 parser accepts multiple valid 41 00 responder frames and unions their bitmaps instead of treating them as ambiguous.
- Generic Mode 01 RPM and coolant read.
- Mode 03 DTC read.
- Ignition Coils 1–8 screen correlating P0301–P0308 to cylinders 1–8.
- P0300 kept as random/multiple misfire rather than falsely assigning it to a coil.
- Raw TX/RX transcript for vehicle-side debugging.

## Safety / capability boundaries

Carista BLE is treated as generic OBD-II unless BMW-specific transport support is independently verified. BMW E39 module access, cylinder cut-out, coding, adaptations and write/flash remain gated behind the dedicated K-Line/DS2/KWP path. No fake live values are generated.

The tuning catalog remains exactly Stage 1, Stage 2, Stage 3 plus separate M5 Character / Booster. There is no Stage 4.

## Build

The project is generated with XcodeGen from `project.yml`. GitHub Actions builds the app on a macOS runner without code signing. A signed iPhone/TestFlight build requires an Apple Developer team and signing configuration.
