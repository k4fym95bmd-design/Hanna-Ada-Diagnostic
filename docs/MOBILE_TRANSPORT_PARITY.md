# Hanna & Ada — native mobile connection parity (22 September 2026)

This is ONE existing repository with TWO native application targets, not a web app packaged twice. Bluetooth, USB and ECU protocol are independent layers. A USB permission prompt, BLE pairing, SPP socket or FTDI port open does **not** mean the BMW ECU is connected.

## Required product behaviour

1. Both iPhone and Android tablet present large, clearly labelled `Bluetooth` and `Cable` entry points. Actual link state is never fabricated.
2. Common session and diagnostics capabilities eventually use an explicit transport abstraction: `discover -> authorize -> open -> identify adapter -> verify ECU -> read-only capability -> disconnect` with distinct failures at each stage.
3. Carista/ELM BLE generic OBD-II is separate from BMW-specific K-Line/DS2/KWP. Feature buttons remain unavailable until both vehicle and adapter capabilities are verified. No simulated VIN, RPM, DTC or success messages.
4. No commands are sent during the off-vehicle transport smoke tests. No coding, adaptations, actuator tests, tune or ECU flashing are part of these changes.

## Current implementation on this branch — NOT a production release

| Platform / transport | Real code | Hardware validation | User-facing behaviour |
|---|---|---|---|
| Android / USB FTDI | Existing `UsbSerialLink` identifies compatible USB-serial driver and performs a manual port open/close without data exchange. | Lenovo Android 5 has enumerated `0403:6001` with permission. New open/close test and Fire HD 10 are **not** verified. | New large `ConnectionsActivity` links to the existing USB inspector. |
| Android / Bluetooth Classic SPP | New `BluetoothLink` uses the official RFCOMM SPP UUID, on a paired candidate only; opens and closes without bytes. Handles Android 12+ connect permission. | Not tested on physical Android device. | New connection hub lists matching paired diagnostic adapter names and displays actual success/failure. |
| Android / Carista BLE | Not implemented in Android native application yet. SPP is NOT BLE. | Not tested. | Explicit pending status; no deceptive BLE connect button. |
| iPhone / Carista BLE | Existing native `BluetoothOBDManager` scans CoreBluetooth peripherals and contains generic OBD-II BLE paths. | Physical iPhone-to-specific-Carista compatibility not verified in this PR. | Existing BLE screen remains first tab. |
| iPhone / cable | New `WiredAccessoryView` enumerates only iOS-reported ExternalAccessory devices. Generic FTDI `0403:6001` is **not** a public iPhone USB serial transport. | Same generic K+DCAN cable on iPhone unverified and not advertised as supported. | Second cable tab shows truthful capability and system detection, without a fake Connect button. |

## Hard platform limitation — do not hide it

Apple's iOS External Accessory API is for supported MFi accessories/protocols, not arbitrary USB-serial FTDI cables; Apple USBDriverKit is a macOS and M-series iPadOS path, not a generic iPhone FTDI solution. Do not promise that a Lightning/USB-C adapter, WebUSB, web hosting or a JavaScript bridge can make the observed generic K+DCAN cable work on iPhone. For wired iOS, first verify an actual supported vendor accessory + protocol + app authorization or change the hardware/transport architecture with the user's consent. No purchase should be proposed based only on a VID:PID.

Apple references: https://developer.apple.com/documentation/externalaccessory ; https://developer.apple.com/documentation/usbdriverkit ; https://developer.apple.com/documentation/driverkit/creating-drivers-for-ipados
Android reference: https://developer.android.com/reference/android/bluetooth/BluetoothSocket

## Release gates

- Android: build with real Gradle/Android SDK, run tests, inspect APK minSdk and manifest, then verify tablet UI and both supported physical transports off-vehicle.
- iOS: build in Xcode/macos runner, sign through authorized Apple developer provisioning, run BLE and MFi enumeration tests on actual hardware. No TestFlight or IPA exists until signing and device tests succeed.
- A common diagnostic core must not be advertised until transport-independent response parsing and read-only ECU tests are actually integrated and passed on both builds.
- Never provide an earlier v0.3 USB probe as if it were a full multi-transport diagnostic release.
