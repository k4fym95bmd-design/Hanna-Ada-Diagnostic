# BMW E39 540i (1999, round 20-pin): no-new-purchase diagnostic path

Status (17 September 2026): a **limited read-only local USB bridge and native iOS client have been implemented and build-tested**, but **no genuine vehicle ECU response has been captured**. This is not a finished BMW-wide diagnostic system.

## What is saved in this repository

- `gateway/usb_kline.py`: operating-system USB serial interface using pyserial, exclusive port, fixed 9600 baud/8E1, bounded timeouts and allowlisted identity probes. No ADS, arbitrary commands or coding.
- `gateway/bmw_frames.py`: DS2/KWP frame encoding and strict checksum, address, length, positive-service and ECU-identity validation.
- `gateway/lan_bridge.py`: local HTTP loopback or authenticated HTTPS on the LAN. The iPhone side requires HTTPS with a certificate trusted by iOS.
- `ios-native/`: separate SwiftUI iPhone app for DME/EGS identity evidence, authenticated LAN connection, raw frame display and user-initiated export; evidence is cleared on disconnect. This is **not** the published Floot/Capacitor app.
- `test/test_usb_bmw.py`, `test/test_lan_bridge.py`, `ios-native/Tests/`: simulated, offline transport/protocol/security tests. Passing tests do **not** establish real-car compatibility.
- Native GitHub workflow builds an **unsigned** IPA artifact. It is not a ready-to-install TestFlight/App Store download.

## Existing equipment: facts and open checks

- Carista / Car Insta BLE: the Floot app's generic OBD-II companion path; its connection cannot establish proprietary DME/EGS/ABS/DSC availability.
- Previously pictured USB K+DCAN / INPA-style cable: chipset, required K-line routing, ADS support and correct vehicle connector **not verified**.
- Previously pictured R365X: operating system, USB-host capability and suitability as a local serial host **not verified**.
- Reported vehicle: 1999 E39 540i with round 20-pin under-hood connector. Exact production date, socket pin 15 population, access to a correctly pinned 20-to-16 adapter, and an OS USB host are **not verified**.

## Hardware-gated validation — do not bypass electrical checks

1. Continue generic OBD-II live PIDs and emissions codes through the owned BLE adapter only when a real adapter and vehicle reply are available. Never generate artificial live measurements.
2. Confirm **already owned** 20-pin adapter, its wiring/compatibility, and a machine capable of recognizing the USB serial cable. No additional purchase should be assumed or requested before inventorying the existing equipment.
3. Check vehicle-specific protocol requirements, including whether the 20-pin socket's pin 15 is populated and whether ADS/L-line handling is needed. The implemented gateway does **not** implement ADS. No bare-wire bridging, pin shorting or energizing unknown pins.
4. On an electrically correct setup only, use `python gateway/usb_kline.py --list` to identify the OS port. `--dry-run --probe dme-me72` or `egs-gs8602` prints a **software-only** request and does not contact the vehicle. Actual `--port ... --probe ...` requires a connected interface and the appropriate vehicle profile; a failed/ambiguous response must remain `NOT_VERIFIED`.
5. If the local host and iPhone are on the same trusted network, the bridge requires a TLS certificate trusted by the iPhone and a session bearer token. Never expose the bridge to the internet or share its token.
6. Save a report only after the iPhone app independently validates a real ECU frame. A USB-open status, adapter greeting or static example fixture is insufficient evidence.

## Delivery status

The web app remains at https://bmw.floot.app; it has not been updated with this separate Swift native implementation. The working code is on GitHub PR #7: https://github.com/k4fym95bmd-design/Hanna-Ada-Diagnostic/pull/7 . Review and actual-vehicle validation are prerequisites to claiming support beyond generic OBD-II or these limited experimental identity probes.

Unimplemented in this bridge: full-module scan; proprietary fault-memory read/clear, full live data, actuation, service, adaptation, coding, programming, flashing and recovery. The AutoMotion integration lists service locations; it does not supply protocol drivers or diagnostics APIs.
