# Hanna & Ada Diagnostics — SINGLE WORKSTREAM

Status: active coordination lock.

## Canonical workstream

All current work for the same Hanna & Ada diagnostic product converges on:

- issue **#15** — coordination
- PR **#35** — integration
- branch `feat/read-only-workshop-fusion-20260922`
- existing Floot product `bmw.floot.app` — separate deployment, not an automatic GitHub mirror

Do not create a second diagnostic app, database, vehicle session, duplicate parser or parallel final branch for overlapping work.

## Consolidated scope

PR #35 is the owner of the combined workstreams:

1. user's switched K+DCAN / INPA-compatible USB cable
2. Android USB Host / OTG path without Windows
3. DS2 + KWP read-only framing/session work
4. native Android USB / Bluetooth Classic / BLE connection surfaces
5. native iOS BLE / ExternalAccessory surfaces
6. browser cable workbench and local bridge experiments
7. OEM ICOM/ISTA reference profile
8. Workshop Fusion plus DTC/live-data quality/performance logic
9. Windows desktop / Tauri 2 PRO host and installer pipeline

## Coordination rules

- Re-read current PR #35 head before every edit.
- Refresh stale SHAs and reconcile; never overwrite newer concurrent work.
- USB identity, open serial port and adapter label are transport evidence only.
- BMW ECU/module status requires a reproducible validated ECU response.
- Erase, coding, actuation and flash stay locked until separate hardware/safety validation.
- Do not claim Floot contains GitHub work until it is deliberately ported, tested and published.

## Superseded parallel workstream

PR #33 native mobile transport work has been copied into PR #35 and is no longer the active integration path.

## Next shared hardware gate

Desktop and Android share the same evidence contract. Either native host may supply the physical transport, but neither may create independent ECU truth.

```
Native host (Windows Desktop PRO or Android USB Host / OTG)
→ switched K+DCAN cable
→ verified USB-serial family
→ verified switch / pin-route evidence
→ E39 connector path (20-pin adapter if applicable)
→ bounded read-only DS2/K-Line identity probe
→ real ECU/module evidence
```

Only after that gate should DTC/live-data coverage be expanded.
