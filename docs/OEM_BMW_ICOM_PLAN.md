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
- `test/oem-icom-profile.mjs`: regression tests that prevent ICOM reachability from being treated as ECU verification.\n- `gateway/icom-readonly-evidence.mjs`: strict read-only evidence validator for a future local ICOM adapter.\n- `gateway/icom-evidence-store.mjs`: bounded in-memory single-session evidence cache with TTL expiry; no disk persistence.\n- `test/icom-readonly-evidence.mjs` and `test/icom-evidence-store.mjs`: stale-session, simulation, duplicate-module, expiry and write-lock regressions.
- Existing cable/VCI application remains the only app; no new database or vehicle session is created.

## Integration architecture

1. **OEM topology profile** — complete in this branch: ICOM Next A, LAN transport, ICOM Next C for legacy 20-pin path.
2. **Discovery/transport adapter** — not implemented. Do not scan a LAN or assume proprietary BMW service ports without a documented interface.
3. **Session evidence adapter** — defensive core is now implemented. Evidence must match the active session, declare `ICOM Next A`, remain read-only, contain no simulation marker and provide unique verified module identities. The in-memory store expires evidence automatically so stale ECU identity falls back to unverified.
4. **Protocol abstraction** — normalize ICOM-backed read-only results into the same Hanna & Ada evidence model already used by cable/bridge transports.
5. **Release validation** — verify on supported hardware with a real transcript, then run the complete repository suite and the existing Floot project checks.

## Safety/capability boundary

The OEM profile is deliberately **read-only**. It does not expose arbitrary ICOM commands, diagnostic writes, DTC erasure, coding, actuator control, security access or flashing. Merely seeing an ICOM on the network must never mark an ECU online.

The current branch therefore improves the architecture and UI truthfulness without pretending that Hanna & Ada already speaks the proprietary ICOM transport.

## OEM software and workshop baseline

Official BMW documentation separates the E39 workflow into two layers:

- **ISTA** — diagnosis, fault-code diagnosis, test plans, repair information, technical data and wiring information.
- **ISTA/P** — control-module programming for **BMW E-series**.
- **ICOM Next A** — BMW-recommended VCI; PC-to-ICOM communication is by wired LAN.
- **ICOM Next C** — legacy-vehicle adapter used where the vehicle has the older BMW diagnostic connector.
- **ICOM firmware** — maintained through the ISTA connection manager using the current BMW firmware packages.
- **Programming power** — an external stable vehicle power supply is mandatory. BMW explicitly warns that an ordinary battery charger is not equivalent to a programming power supply.

Current official AOS/TIS requirements used as the baseline:
- minimum **100 Mbit/s LAN** for vehicle diagnosis/programming,
- stable IP address during the session,
- use the current BMW AOS requirements rather than pinning Hanna & Ada to one ISTA release.

Additional official references:
- BMW AOS/TIS site information: https://bmwtechinfo.bmwgroup.com/assets/site_information.pdf
- BMW AOS/TIS system requirements: https://bmwtechinfo.bmwgroup.com/assets/system_requirements.pdf

## Target E39 540i OEM station

Mandatory baseline:
1. Supported Windows workshop PC.
2. Genuine **ICOM Next A**.
3. **ICOM Next C** when the actual E39 uses the legacy 20-pin connector.
4. Wired 100 Mbit/s-or-better LAN.
5. Legal BMW AOS access for the applicable market.
6. ISTA for diagnosis/test plans.
7. ISTA/P for E-series programming.
8. Stable external vehicle power supply before any programming operation.

Optional family members:
- **ICOM Next B** — MOST adapter; not part of the base E39 540i path unless a supported vehicle/operation actually requires MOST.
- **ICOM Next D** — motorcycle adapter; outside this project's E39 scope.

## Hanna & Ada role beside OEM tools

The design goal is **companion, not counterfeit dealer software**:

- keep one Hanna & Ada vehicle session,
- validate read-only evidence bound to that session,
- archive/import OEM reports as external evidence,
- compare OEM results with our verified K+DCAN/Carista read-only observations,
- never mark ECU verified from ICOM reachability alone,
- never claim that Hanna & Ada performed an ISTA/ISTA-P write,
- never take over the active ISTA session,
- keep coding/write/flash locked until separately designed, documented and hardware-validated.

## Acceptance checklist

Read-only station:
- [ ] ICOM Next A is detected by legal ISTA Connection Manager.
- [ ] If the car physically has the legacy connector, ICOM Next C is in the path.
- [ ] PC↔ICOM uses stable wired LAN.
- [ ] ICOM firmware is current according to the active BMW package.
- [ ] ISTA identifies the vehicle/control units.
- [ ] Hanna & Ada only accepts evidence tied to the current session.
- [ ] Disconnect/session change invalidates stale evidence.

E-series programming:
- [ ] ISTA/P is used.
- [ ] External vehicle power supply is connected and stable.
- [ ] Wired network remains stable.
- [ ] Programming occurs outside Hanna & Ada's write path.
- [ ] Result may be stored as an audit/report, but not misrepresented as a Hanna & Ada write.

## Genuine-hardware verification

Do not treat housing appearance alone as proof of authenticity. Prefer traceable sourcing and verify the received unit through the legal BMW toolchain. A suspect device should not be 'fixed' by bypassing protections or installing unknown firmware; inability to participate in official firmware management is itself a red flag.

