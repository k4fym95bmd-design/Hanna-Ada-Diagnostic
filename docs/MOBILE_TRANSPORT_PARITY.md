# Hanna & Ada — native mobile transport parity (22 September 2026)

This is ONE existing repository with TWO native app targets, not two new Base44/Netlify/Floot projects. Bluetooth, USB serial and vehicle-specific ECU protocols are independent layers. A USB permission prompt, BLE GATT connection, SPP socket or FTDI port open does **not** mean a BMW ECU is connected.

## Target product

- iPhone and Android tablet: large, clearly labelled Bluetooth and cable connection options; only actual connection state is shown.
- Explicit future transport abstraction: discover → authorize → open → identify adapter → verify ECU → read-only capability → disconnect, with distinct failures at each stage.
- Generic ELM/Carista BLE OBD-II is separate from BMW-specific K-Line/DS2/KWP. Capability buttons must stay unavailable until compatibility is verified. No invented VIN/RPM/DTC success.
- No ECU commands during off-vehicle transport smoke tests. No coding, adaptations, actuator tests or ECU flashing in these changes.

## Actual implementation in PR #33 — NOT a production release

| Platform / transport | Current code | Physical validation |
|---|---|---|
| Android / USB FTDI | Existing `UsbSerialLink` identifies available USB-serial driver, offers manual port open/close with no data exchange; the large `ConnectionsActivity` opens the USB inspector. | Lenovo Android 5 enumerated `0403:6001` and permission granted only. Port open/close and Fire HD 10 unverified. |
| Android / Bluetooth Classic SPP | `BluetoothLink` offers a paired-device RFCOMM socket open/close test without sending bytes. Tablet hub lists all paired devices, including unfamiliar names; only real SPP success shown green. | Not physically tested; SPP is not BLE or ECU diagnostics. |
| Android / Bluetooth LE | New `BleLink` performs user-triggered real BLE discovery for up to 10 seconds, displays up to 12 nearby devices, tries a manual GATT connection with 12-second timeout, then closes. Permissions are scoped for Android 5, 6–11 and 12+. GATT success is shown as transport-only. **No Carista-specific characteristic negotiation or ELM read commands.** | No physical Android BLE/Carista test completed; no OBD-II or BMW ECU claim. |
| iPhone / Bluetooth LE | Existing native `BluetoothOBDManager` scans CoreBluetooth and contains generic ELM BLE/OBD-II code paths. | iPhone-to-specific-adapter compatibility unverified for this PR. |
| iPhone / cable | `WiredAccessoryView` lists only accessories exposed to the app by iOS, refreshes on attach/detach notifications, never represents accessory enumeration as ECU success. | No compatible authorized wired iPhone accessory or protocol identified; generic FTDI K+DCAN is not a supported iPhone serial transport. |

## Hardware limitation

Apple's public ExternalAccessory API is for compatible authorized accessory protocols, not arbitrary USB-serial FTDI cables; Apple USBDriverKit is not a generic iPhone FTDI solution. A Lightning or USB-C adapter, WebUSB, web host or JavaScript bridge alone cannot establish app access to the observed generic K+DCAN `0403:6001`. Wired iOS needs a real compatible accessory, documented protocol and authorization or a user-approved hardware/architecture change. No purchase recommendations based only on VID:PID.

Apple references: https://developer.apple.com/documentation/externalaccessory ; https://developer.apple.com/documentation/usbdriverkit
Android references: https://developer.android.com/develop/connectivity/bluetooth/bt-permissions ; https://developer.android.com/reference/android/bluetooth/le/BluetoothLeScanner

## Release gates (none claimed to be green)

- Android: actual Gradle + SDK build and tests, verify APK/minSdk/manifest, then run genuine off-vehicle USB, SPP and BLE tests on Fire HD 10.
- iOS: real Xcode/macOS build and signing, iPhone BLE and authorized-accessory physical tests; signed deliverable required before advertising install availability.
- ECU read-only functionality: verify actual vehicle/adapter and protocol independently for each supported platform, not inferred from a Bluetooth or USB session.
- CI currently fails before jobs execute. No verified new APK/IPA from this PR, no merging or release while this remains true; never substitute the old v0.3 USB enumerator.
