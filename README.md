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
- No VANOS feature set

### TU — 1999–2003
- Engine: M62TUB44
- DME: Bosch ME7.2
- Transmission: ZF 5HP24 / EGS where fitted
- Relevant transport: K-Line / DS2 / BMW KWP2000 / generic OBD-II
- VANOS-related functions only where implemented and verified

## Tuning / Map Store — canonical catalog

Stages **1–3** are the core catalog. Stages **4–7** are advanced custom engineering tiers. **M5 Character / Booster remains a separate premium product and is not Stage 4.**

- **Stage 1 — Road Performance** — €89 / VIN — UP TO +50 hp / +80 Nm
- **Stage 2 — Sport Hardware** — €149 / VIN — UP TO +80 hp / +130 Nm
- **Stage 3 — Track / Forced Induction** — €249 base — UP TO +120 hp
- **M5 Character / Booster** — €179 — separate premium vehicle-specific calibration product

Optional add-ons: M5 Character Booster +€49, Exhaust Pack +€39 where compatible, Throttle Sport+ +€29, Custom Dyno +€199.

A tuning entitlement is bound to user + VIN + ECU HW/SW + stock hash + product. A purchase does not bypass safety gates. Flash remains blocked until ECU identity, exact compatibility, backup, checksum/signature state, required protocol/VCI, stable voltage and explicit confirmation are all valid.

The M5 Character / Booster package must never blindly install an S62/M5 binary into an M62/M62TU ECU.

See `docs/TUNING_CATALOG.md` and the machine-readable `config/tuning-products.json`.

## Platform roles

### Windows laptop / K+DCAN gateway
Canonical physical cable host. The local gateway owns USB enumeration, one cable session, passive RX and atomic read-only snapshots. The gateway exposes no arbitrary TX, DTC erase, coding, actuation or flash route.

### iPhone / iPad
Uses the Windows laptop gateway for the physical K+DCAN cable. The web UI remains the same; iOS does not claim direct generic K+DCAN USB access.

### Android
Prefers native USB Host when the local Android module verifies support. WebUSB is discovery-only; the Windows gateway is the fallback for the full shared session model.

## Capability states

`SUPPORTED` · `HARDWARE REQUIRED` · `PROTOCOL REQUIRED` · `NOT AVAILABLE FOR THIS VEHICLE` · `EXPERIMENTAL`

## Safety model

Read-only diagnostics are separated from Active Test, Write and Flash operations. Any write/flash workflow must verify ECU identity, compatibility, protocol, voltage, stock backup and checksum/signature state, then require explicit user confirmation and create an audit trail.

No immobilizer bypass, emissions defeat, or fabricated OEM-tool parity.

## Runnable tuning catalog

The repository now includes a minimal Railway-ready Node service:

- `server.mjs`
- `public/index.html`
- `config/tuning-products.json`
- `package.json`

Run with:

```bash
npm start
```

Endpoints:

- `/` — Hanna & Ada Tuning / Map Store UI
- `/api/tuning-products` — canonical catalog JSON
- `/health` — service health check

This catalog UI intentionally keeps WRITE locked until a real, validated ECU session satisfies the full safety preflight.

## Current app

Floot production build currently exists at https://bmw.floot.app. Branding and architecture are being migrated to the Hanna & Ada system; production should only be treated as updated after a verified rebuild and republish.

## Documentation

See `docs/ARCHITECTURE.md`, `docs/CAPABILITY_MATRIX.md`, `docs/E39_540I_PROFILES.md`, `docs/CARISTA_BLE.md`, `docs/KDCAN_ANDROID.md` and `docs/TUNING_CATALOG.md`.


## Fast Windows setup

For the 12 GB Windows laptop path:

- `npm run doctor:windows`
- `npm run start:windows`
- `npm run test:release-critical`

See `docs/WINDOWS_12GB_QUICKSTART.md` and `docs/UNIVERSAL_PLATFORM_ARCHITECTURE.md`.
