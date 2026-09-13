# Hanna & Ada — Architecture

## Product rule
Hanna & Ada is one application with one shared vehicle/session state. Diagnostics, coding, tuning, reports, workshop data and recovery must never create duplicate vehicle profiles.

## Shared session
The canonical session contains:
- VIN and vehicle identity
- model/year/generation
- engine and DME family
- detected ECU inventory
- active VCI and transport
- protocol state
- supply voltage
- DTC snapshot
- live data subscriptions
- stock ECU file metadata
- tuning entitlements
- audit trail

## Application modules
HOME, SCAN, CONTROL UNITS, DTC, LIVE DATA, ACTIVE TEST, SERVICE, ADAPTATIONS, CODING STUDIO, BMW EXPERT, TUNING / MAP STORE, ADVANCED / EXPERT LAB, AI MECHANIC, REPORTS / HISTORY, VCI, WORKSHOP LIBRARY, WIRING LAB, FLASH / RECOVERY, REMOTE GARAGE.

## Transport layers
### iPhone companion
Carista BLE / ELM-style generic OBD-II transport. It is suitable for adapter discovery, ELM initialization, standard OBD PIDs and generic DTC modes where the browser or native BLE layer supports them.

### Android direct BMW
USB Host / OTG with K+DCAN is the primary direct-E39 BMW path. The protocol layer must identify cable/serial capabilities and then implement K-Line, DS2 and BMW KWP jobs per ECU rather than pretending the cable is an ELM327 device.

### Future VCI
Own Hanna & Ada gateway: protected automotive front end, K-Line + CAN, USB-C + BLE/Wi-Fi, authenticated local access, secure boot, signed OTA and explicit write authorization.

## Capability model
Every action is resolved against vehicle + ECU + transport + protocol + implementation state. User-facing states are:
`SUPPORTED`, `HARDWARE REQUIRED`, `PROTOCOL REQUIRED`, `NOT AVAILABLE FOR THIS VEHICLE`, `EXPERIMENTAL`.

## Safety tiers
1. READ
2. ACTIVE TEST
3. WRITE / CODING
4. FLASH

Write/flash requires ECU identity verification, compatibility checks, voltage gate, stock backup, checksum/signature validation where applicable, explicit confirmation and audit logging.

## Data integrity
Never display fabricated VINs, connected states, voltages or live sensor values in operational mode. Demonstration data must be visibly marked `DEMO` and isolated from real sessions.

## Licensing boundary
Third-party open-source projects may inform architecture and protocol research, but code with incompatible commercial licensing must not be copied into the proprietary product without an intentional license strategy.
