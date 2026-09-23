# BMW OEM diagnostic baseline — ICOM Next plan

## Verified OEM baseline

BMW's Aftersales Online System lists **ICOM Next** as the recommended vehicle communication interface for diagnosis/programming and states that the computer-to-ICOM link uses a LAN cable. The official ICOM Next user guide identifies **ICOM Next A** as the main diagnostic unit and **ICOM Next C** as the legacy vehicle adapter.

BMW technical training material also documents deletion of the E39 engine-bay 20-pin diagnostic socket from **09/2000**. Earlier E39 vehicles can therefore require the legacy 20-pin path for full BMW diagnostic access rather than relying only on the cabin OBD-II connector.

Official references:
- BMW AOS technical requirements: https://aos-i.bmwgroup.com/technical-requirements
- BMW ICOM Next User Guide: https://bmwtechinfo.bmwgroup.com/equipment_manual/ICOM_Next_User_Guide_ENG.pdf
- BMW emissions/diagnostic connector training: https://bmwtechinfo.bmwgroup.com/obd/obdii_overview_drive_cycle.pdf

## What was added to Hanna & Ada

- `public/oem-icom-profile.js`: OEM ICOM Next evidence model.
- `public/oem-icom-panel.js`: informational card inside the existing cable workbench.
- `test/oem-icom-profile.mjs`: regression tests that prevent ICOM reachability from being treated as ECU verification.
- Existing cable/VCI application remains the only app; no new database or vehicle session is created.

## Integration architecture

1. **OEM topology profile** — complete in this branch: ICOM Next A, LAN transport, ICOM Next C for legacy 20-pin path.
2. **Discovery/transport adapter** — not implemented. Do not scan a LAN or assume proprietary BMW service ports without a documented interface.
3. **Session evidence adapter** — future read-only layer must prove that a response belongs to the current ICOM session and identified BMW module before `ecuVerified` can become true.
4. **Protocol abstraction** — normalize ICOM-backed read-only results into the same Hanna & Ada evidence model already used by cable/bridge transports.
5. **Release validation** — verify on supported hardware with a real transcript, then run the complete repository suite and the existing Floot project checks.

## Safety/capability boundary

The OEM profile is deliberately **read-only**. It does not expose arbitrary ICOM commands, diagnostic writes, DTC erasure, coding, actuator control, security access or flashing. Merely seeing an ICOM on the network must never mark an ECU online.

The current branch therefore improves the architecture and UI truthfulness without pretending that Hanna & Ada already speaks the proprietary ICOM transport.
