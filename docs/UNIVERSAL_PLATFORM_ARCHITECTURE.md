# Universal Hanna & Ada transport architecture

## Chosen architecture

The Windows laptop is the canonical physical K+DCAN host. iOS, Android and other computers use the same Hanna & Ada web UI and route diagnostics through the safest available transport.

Priority:
1. Windows laptop bridge -> canonical K+DCAN session, USB binding and atomic passive snapshots.
2. Windows Chromium + Web Serial -> local fallback if the bridge is unavailable.
3. Android native USB Host -> direct Android USB path when the native module confirms support.
4. Android WebUSB -> identity/access discovery only.
5. iOS -> HTTPS connection to the Windows laptop bridge.
6. Any unsupported client -> Windows laptop bridge.

The bridge remains read-only: USB enumeration, open/close, passive RX and atomic status/RX snapshot. No raw transmit, coding, DTC erase, actuator or flash route exists.

## Why this is the practical cross-platform choice

Web Serial and WebUSB are limited-availability browser APIs, so a browser-only design cannot provide one reliable direct-USB path across Windows, Android and iOS. Android has a native USB Host API; iOS therefore uses the laptop as the hardware gateway.

The bridge now exposes `GET /v1/snapshot`, returning status and passive RX from one server-side capture. This avoids the prior race where the browser fetched RX and status in separate requests.

## Windows laptop profile

The UI includes a 12 GB RAM gateway profile. Hanna & Ada's bridge is lightweight; memory readiness is treated separately from USB-driver, cable VID:PID and ECU evidence. The code intentionally does not hard-code a Windows marketing version, so it remains compatible with current and future Windows releases.

Supported runtime baseline is Node.js 20+. Node.js 24 is a current development target, but the browser UI must not claim a runtime version until `doctor:windows` or the local gateway actually verifies it.

## Packaging alternative

Tauri 2 is a future packaging option because it can reuse the existing web frontend on Windows, Android and iOS while adding platform-native Kotlin/Swift/Rust integrations. It is not required for the current architecture and it does not by itself make a generic K+DCAN USB cable directly accessible on iOS.

## Tuning mode

The tuning area is now guarded by an ANALYSIS ONLY evidence model. It can evaluate diagnostic evidence and logs but does not generate calibration payloads or enable ECU writes.
