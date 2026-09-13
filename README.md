# Hanna & Ada Diagnostics

Professional automotive diagnostics platform focused first on BMW E39 540i V8, with a strict separation between generic OBD-II capabilities and BMW-specific diagnostics.

## Product direction

One application, one shared vehicle/session state, and one capability model across diagnostics, coding, tuning, recovery, workshop data and remote support.

Primary modules:

- Home / Vehicle Session
- Scan / Control Units / DTC
- Live Data / Active Test / Service / Adaptations
- Coding Studio / BMW Expert
- Tuning / Map Store
- Advanced / Expert Lab
- AI Mechanic
- Reports / History
- VCI / Connection
- Workshop Library / Wiring Lab
- Flash / Recovery
- Remote Garage

## Visual system

- Graphite / black base
- Electric blue: connection, read, live, safe
- Red: DTC, warning, write, coding, flash, risk
- White / gray neutral text
- Dense OEM-style workshop-console layout
- No fake connected states or fabricated measurements

## BMW E39 540i profiles

### PRE-TU — 1997–1998
- Engine: M62B44
- DME: Bosch M5.2 / M5.2.1
- Transmission: ZF 5HP24 / EGS where fitted
- Relevant transport: K-Line / DS2 / generic OBD-II

### TU — 1999–2003
- Engine: M62TUB44
- DME: Bosch ME7.2
- Transmission: ZF 5HP24 / EGS where fitted
- Relevant transport: K-Line / DS2 / BMW KWP2000 / generic OBD-II

## Platform roles

### iPhone / Carista BLE
Generic OBD-II companion path. Supports adapter discovery, ELM initialization, supported PID discovery, live standard PIDs, DTC modes and RAW TX/RX where the browser/native transport permits it. Carista/ELM must never be presented as proof of full BMW E39 module access.

### Android / K+DCAN
Primary path for direct USB BMW diagnostics. Target transport stack includes K-Line, DS2 and BMW KWP where implemented and verified. Hardware/protocol-dependent functions remain capability-gated until tested.

## Capability states

`SUPPORTED` · `HARDWARE REQUIRED` · `PROTOCOL REQUIRED` · `NOT AVAILABLE FOR THIS VEHICLE` · `EXPERIMENTAL`

## Safety model

Read-only diagnostics are separated from Active Test, Write and Flash operations. Any write/flash workflow must verify ECU identity, compatibility, protocol, voltage, stock backup and checksum/signature state, then require explicit user confirmation and create an audit trail.

No immobilizer bypass, emissions defeat, or fabricated OEM-tool parity.

## Current app

Floot production build currently exists at https://bmw.floot.app. Branding and architecture are being migrated to the Hanna & Ada system; production should only be treated as updated after a verified rebuild and republish.

## Documentation

See `docs/ARCHITECTURE.md`, `docs/CAPABILITY_MATRIX.md`, `docs/E39_540I_PROFILES.md`, `docs/CARISTA_BLE.md` and `docs/KDCAN_ANDROID.md`.
