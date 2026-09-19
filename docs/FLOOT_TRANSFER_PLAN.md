# Hanna & Ada — Floot transfer package (2026-09-20)

## Canonical targets, NOT automatic mirrors

- Existing Floot project: `396c32bd-4ec9-47b3-bb71-29d6458d9511`, published at `https://bmw.floot.app`.
- Source repository: `k4fym95bmd-design/Hanna-Ada-Diagnostic` (`main` after CI and merge).
- Separately hosted Netlify static project is not the Floot deployment. GitHub `main` merges do not update Floot automatically.
- The Floot editor returned a **daily 100-build-action limit** while preparing this package. File tree and exact helper/page names in the current Floot project could not be refreshed. Do not claim integration or invent destination file names until read access works again.

## What can be transferred without an ECU, adapter or paid database

| Priority | Source | Destination after inspection | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | `public/diagnostic-core.js` | A single Floot helper module, typed for its TS compiler | Parser tests pass; no separate duplicate protocol parser or vehicle session; source remains read-only. |
| 2 | `test/diagnostic-core.mjs` | Floot Jasmine spec for the imported helper (translate Node test/assert syntax) | Same legacy/CAN, incomplete-response, unknown-protocol and epoch regressions pass. |
| 3 | Existing Floot connection/VCI screen | Existing page/component, not a newly invented second dashboard | Display `DISCONNECTED → BLE → ADAPTER → ECU` only from real transport events; `ATI` cannot mark ECU online. |
| 4 | Existing Floot DTC / live data screens | Existing views bound to shared vehicle session | Show actual decoded values with source, timestamp and protocol; `null` means not read, never zero faults. |
| 5 | Existing reports area | Existing screen, optional local-only export initially | RAW transcript user-review warning (VIN/identifiers); never silently send to cloud or mix sample data with measurements. |

Do **not** provision a fresh Supabase/Floot database just to move this core. Persisting user-specific vehicle histories requires a separate approved design for consent, isolation and retention. Other Supabase projects belong to FORGE/ZleceniaRadar and must not be reused. No external deployment can supply iPhone Bluetooth access or BMW's missing physical K-Line interface.

## Core API already committed to GitHub

```js
import { classifyVehicleProtocol, decodeStoredDTCs, decodeSupportedPIDs,
  createDiagnosticSession, reduceDiagnosticSession } from './diagnostic-core.js';

const protocol = classifyVehicleProtocol('ATDP\rISO 9141-2\r>'); // legacy
const pids = decodeSupportedPIDs('41 00 80 00 00 00\r>'); // verified ECU reply
const faults = decodeStoredDTCs('43 03 08 00 00\r>', protocol); // P0308
```

API is pure/read-only and does not open a BLE connection. The host must supply real `ATDP` or `ATDPN` vehicle-protocol evidence, never derive the protocol from `ATI` or vehicle model. Unknown unframed Mode 03 responses return a protocol error, not a made-up DTC or a clean bill of health. A fully framed CAN single reply can be decoded using its own frame evidence. ISO-TP multi-frame replies are deliberately rejected until reassembly is implemented. Do not claim complete ISO-TP/BMW coverage.

`reduceDiagnosticSession` is a pure state reducer. Give each real transport event the active `epoch`; `DISCONNECTED`/`RESET` increments it. The UI must not dispatch synthetic `BLE_CONNECTED` or `ADAPTER_IDENTIFIED` events outside an explicitly labeled DEMO mode. A real PID `0100` response is required for `ECU` state. When a DTC request fails, `dtcs` becomes `null`, *not* `[]`.

## One bounded Floot transfer session (when it allows edits)

1. `list_files(projectId)`; inspect existing connection, DTC, report and test files together via **one** `read_files` call. Check current version and preserve user's chosen branding, navigation, and existing working screens.
2. Read `get_guides('floot-overview')` before first edit. Choose the existing shared session/transport state as canonical. Compare API names and types; do not overwrite screens with GitHub's standalone static shell.
3. Convert the dependency-free ESM code into a strictly typed Floot helper (`.tsx` if its virtual file rules require it); preserve algorithm/test fixtures. Do not use a permanent `@ts-nocheck` escape hatch.
4. Make one modest `apply_patch` for helper + tests, then a second small patch to connect existing read-only UI. Pass `expected_version` and refresh on conflicts. Reuse one ECU/session state, not duplicate vehicle profiles.
5. Run Floot `typecheck` and `run_tests`, then verify UI via preview if an editor is connected. Create one named checkpoint after a coherent verified change.
6. Publish only after verification and when explicitly appropriate. Check existing publish status and native-build allowance first; a browser UI cannot magically become a native CoreBluetooth application.

## Not part of this transfer and not hardware-verified

- `ios-native/Sources/*` uses Apple CoreBluetooth and Swift/Xcode. It cannot simply be pasted into browser JS/Floot React or assumed to work in Safari. A real native runtime/bridge and signed distribution are separate.
- E39 1999 BMW-specific module diagnosis needs a verified electrical K-Line/DS2 interface, correct diagnostic connector, and actual ECU replies. Generic emission PID 0100 does not unlock EGS/ABS/airbag/etc.
- Active tests, adaptations, coding, tuning writes and flash/recovery stay gated. No synthetic VIN, DTC count, RPM, voltage, or connection state in operational mode.
- Issue #13 concerns the native iOS decoder: importing the new JavaScript core into Floot does not by itself fix the separate Swift parser. Both implementations need separate tests before the hardware release.

## Verification gate

The GitHub portable module is considered ready to transfer only when `npm test` and its PR CI are green. Floot integration is a distinct milestone requiring its own typecheck/tests and, separately, an actual iPhone + Carista + vehicle field test. A successful iOS simulator build or unsigned IPA is not a signed/TestFlight release or hardware validation.
