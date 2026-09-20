# Hanna & Ada Diagnostics — shared Claude / ChatGPT handoff plan

Last reconciled: 2026-09-21 (Europe/Berlin). This document supersedes the 2026-09-20 plan claiming Floot could not be inspected or modified. It records **observed implementation**, **outstanding work**, and **verification limits**. Re-read the current file/project before changing code; avoid overwriting a collaborator's newer work.

## Canonical project boundaries

- One existing Floot app: project `396c32bd-4ec9-47b3-bb71-29d6458d9511`, production https://bmw.floot.app. Its React/Capacitor code and publication are NOT automatic GitHub mirrors.
- One source repository: `k4fym95bmd-design/Hanna-Ada-Diagnostic`, main. GitHub has independent static browser UI, portable JS diagnostic core, Swift iOS client, and experimental local USB/K-line gateway. Do not deploy the standalone GitHub shell over Floot or assume GitHub code is installed on iPhone.
- Netlify is separate; automated production deploy-on-push was disabled by PR #16 because Netlify rejected deployments for exhausted account credits (HTTP 403). Do not trigger known-failing deployments just to check the app.
- No duplicate Floot app, database, Supabase project, dashboard, vehicle profile or canonical vehicle session. Preserve user-selected blue/red/graphite design, navigation, BMW E39 540i V8 profile and the canonical tuning catalog: Stage 1–3 plus distinct M5 Character/Booster; no Stage 4.

## Verified Floot progress (completed in a later editing session)

On the existing project, the following paths were inspected and edited: `helpers/caristaBle.tsx`, `helpers/webObdBle.tsx`, `helpers/obdRead.tsx`, `helpers/obdSession.tsx`, their corresponding Jasmine specs and `pages/_index.tsx`. This is a different implementation from `public/obd-runtime.js` in GitHub.

- BLE: serialize one ELM command per channel, prevent stale responses being attributed to the next request, require reconnection after uncertain timeout/write failure, and prefer explicitly recognized UART GATT profiles instead of arbitrary writable services. The browser path has a strict read-only command allowlist. Physical compatibility of the user's exact Carista adapter is still unverified.
- Generic ECU verification: Mode 01 PID `0100` requires valid ECU data; accept multiple **complete** `41 00` responders and union bitmaps, while rejecting truncated/error replies. Raw `0100` is included when verification fails. ATI only identifies the adapter, not the vehicle ECU.
- DTC: protocol-aware decoding uses ATDPN/ATDP evidence for CAN versus legacy; Mode 03, 07 and 0A parsing refined. `NO DATA`, unrecognized protocol and incomplete responses must NEVER render as verified zero faults. Note that acceptance tests must continue guarding the separate CAN/legacy corner cases.
- UI/session: connection epochs invalidate stale asynchronous results, scans/live/DTC should not overlap on one adapter, partial scans are labeled partial, and unverified BMW-specific modules stay unavailable.
- Read-only safety: Mode 04 clearing was disabled at transport/session/UI boundaries; no active test, ECU write, coding, tuning write or flashing should be exposed. Coil workflow was changed to avoid automatically calling a clear or overclaiming a coil diagnosis.
- Reports: generation stays in memory by default; saving locally requires a deliberate user action, and the user is warned to review RAW for VIN/identifiers. No automatic cloud upload.
- Verification recorded in Floot: 11 standard Jasmine spec files passed, plus 2 separately invoked hook spec files; TypeScript typecheck clean; checkpoint `af4db906-ea79-450e-a97a-80d8af36f0d1` ('Read-only safety and connection polish'). Publish job `f1ba009f-5fe7-40ba-bdc0-926600400715` succeeded; production URL returned HTTP 200 and the server-rendered app title was correct. **HTTP 200 does not validate interactive iPhone BLE, UI screenshots, or ECU communication.** Screenshot capture was pending because no Floot preview/editor window was open.
- Latest observed Floot publish status: free plan, published, no mobile/native build, 2/2 native builds remaining for the current period. Do not spend native-build credits without a concrete iOS build request and platform readiness.

## GitHub state and reconciliation

- Main's last independently checked CI: run `35477391425`, success at commit `d55a6ce6f34f4a585777c3b3a7c8aee1b6da5c22`. Recheck main before relying on this hash.
- PR #19 fixed native Swift unframed CAN/legacy Mode 03 code-level parsing; issue #13 was closed **for code/tests**. A real hardware transcript is still needed; do not reopen it merely because field verification is outstanding.
- PR #21 (`hardening/ati-error-validation`) fixes Connection Doctor accepting ATI `ERROR` as identity, and has a successful PR CI run `35495009502`; it was observed open/unmerged at plan refresh. Recheck status; merge only after current checks/review, and do not copy its older 'Floot still inaccessible' paragraph as present fact.
- Issue #4 originally described a multi-responder PID `0100` failure. The Floot parser fix and regression tests have now been applied; leave a **field-test acceptance** item until the owner's actual adapter/vehicle confirms it. Do not represent a code fix as hardware proof.
- Issue #15 is PARTIALLY implemented, not automatically done. Existing Floot helper/UI paths have been audited, edited, tested and published. Still compare the portable GitHub core's 12 regression scenarios against the existing Floot Jasmine coverage and prove there is one canonical parser/session rather than layering duplicates. No fresh DB, no wholesale overwrite.
- Issue #20 remains specific to the independent GitHub `public/obd-runtime.js` legacy browser path; fixes in Floot DO NOT close it. Do not turn on Netlify deployments while credits are blocked.
- PR #7 (USB K-line/DS2/KWP gateway and independent Swift client) and draft PR #9 (R36SX read-only hardware probe) are experimental and unmerged. Neither is installed in Floot or proven on the vehicle.

## Exact next execution order for Claude or ChatGPT

1. **Refresh before writing.** Fetch current main SHA, PR #21 state/checks, issues #4/#15/#20 and Floot `list_files` version + publish status. Floot's previous daily quota was a temporary historical blocker, NOT evidence that the latest published app is inaccessible. If quota is active again, avoid guessing code changes.
2. **Align planning records without duplicate work.** Record the completed Floot parser/transport/UI/report fixes in issue #15 and issue #4; leave acceptance gates open. If PR #21 is still open with green checks, review and merge the ATI error regression separately, then refresh main.
3. **Verify exact behavior before importing core.** Batch-read Floot `helpers/diagnosticCore.tsx` (if present), `obdRead`, `obdSession`, `caristaBle`, `webObdBle`, `vciRouter`, `pages/_index.tsx` and their tests. Compare the 12 `test/diagnostic-core.mjs` cases against Floot, especially multi-ECU PID `0100`, CAN count byte, ISO 9141, truncated secondary responder, `NO DATA`, unknown protocol, and stale reconnect callbacks. Import ONLY missing pure, strictly typed functions into the existing canonical helper; do not create a second session or redundant decoder.
4. **Field evidence is the release gate.** On the user's iPhone, verify the actual runtime (supported Web Bluetooth browser versus native CoreBluetooth build), then collect only user-reviewed evidence of scan → GATT UUID/characteristics → notification subscription → ATI identity → valid `0100` ECU reply → ATDPN/ATDP → read-only DTC/live response. Label the first failed stage accurately. Do not assert Carista compatibility from known example UUIDs, ATI, HTTP 200, or passing simulator CI. No real car access is available to the coding agent.
5. **Safety and session audit.** Check that timeouts/disconnect invalidate the epoch and UART, no late notification can resurrect ONLINE, every vehicle request shares a single lock, all visible status labels follow transport evidence, Mode 04 and other modifying commands remain disabled at the lowest transmission boundary, and pending/unread DTC is `null`/unverified rather than `[]`/clean.
6. **Quality and release.** Run Floot typecheck, all 11 standard specs and the 2 explicitly selected hook specs, inspect the live preview/screenshot when a Floot window is open, then checkpoint. Republish only verified Floot changes; confirm job succeeded and a production smoke check. Treat a native signed iOS/TestFlight release as a separate milestone that requires valid distribution credentials and a requested build; do not conflate a browser site with iOS app installation.

## Product and hardware restrictions

1999 BMW E39 with a round 20-pin diagnostic connector may require a physically and electrically compatible K-line/DS2 interface and USB host. A photographed K+DCAN cable, a cloud backend, an iPhone BLE adapter, or a successful generic OBD `0100` does NOT establish BMW-specific DME/EGS/ABS/module access. Keep BMW module writes, immobilizer operations, actuations, resets, coding, and flashing unavailable until actual hardware, protocol, authorization, safety and validation gates are fulfilled. Avoid fabricating VIN, DTCs, RPM, voltage, measurements, or an online ECU state. Share diagnostic transcripts only with the owner's review because they may contain vehicle identifiers.

## Done definition

A green GitHub/Floot CI run plus a published HTTP 200 URL proves **software/build readiness only**. Connection may be called verified only after a real iPhone + actual Carista adapter + actual BMW read-only transcript demonstrates a complete positive ECU reply and safe disconnect/reconnect behavior. Record evidence and update issues then; never claim 'finished car diagnostics' from mock data, CI or publication alone.
