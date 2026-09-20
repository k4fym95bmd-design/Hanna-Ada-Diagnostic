# Hanna & Ada Diagnostics — shared Claude / ChatGPT handoff plan

Last reconciled: 2026-09-21 (Europe/Berlin). This is the **single existing** cross-agent plan; re-read current repository, issue and Floot versions before modifying work from another collaborator. Do not create a parallel app, dashboard, database or project.

## Canonical boundaries

- Floot React/Capacitor project `396c32bd-4ec9-47b3-bb71-29d6458d9511`, published at https://bmw.floot.app, is the existing user-facing application. Floot does NOT automatically synchronize with GitHub.
- Source repository `k4fym95bmd-design/Hanna-Ada-Diagnostic` contains an independent static browser shell, portable diagnostic core, Swift iOS client and prototype USB/K-line gateway. These are distinct runtimes, NOT alternative live copies of Floot. Preserve the blue/red/graphite design, navigation and BMW E39 V8 profile.
- Netlify project `5eec6c26-090e-4e0c-8a05-d8518bcc0995` serves a separate older static deployment. Netlify returned HTTP 403 for credit exhaustion; PR #16 disabled automated deploy-on-push. A later read-only project check showed the existing deployment remains `ready`, not that GitHub changes were deployed. Do not trigger a speculative deploy.
- No new Supabase, Railway, Replit, Vercel, Netlify or Floot app can create an iPhone Bluetooth API or the BMW vehicle-side electrical connection. Do not borrow the other projects' databases or credentials.
- Canonical tuning catalog remains Stage 1–3 plus **separate** M5 Character / Booster, never Stage 4. Current vehicle-modifying features are gated/disabled.

## Floot implementation verified in prior editing session

Existing files inspected and modified: `helpers/caristaBle.tsx`, `helpers/webObdBle.tsx`, `helpers/obdRead.tsx`, `helpers/obdSession.tsx`, their Jasmine specs, and `pages/_index.tsx`. This is NOT `public/obd-runtime.js` in the GitHub static shell.

- Serialize BLE/ELM traffic, invalidate uncertain timeout/write channels, require reconnect, accept only explicit candidate UART GATT profiles, and enforce the browser read-only command allowlist. Actual firmware UUIDs remain unknown until captured from the owner's adapter.
- Validate real, complete PID `0100` replies, union multiple complete `41 00` responder bitmaps, reject truncated/error replies, and show reviewed RAW on failure. ATI alone never verifies an ECU.
- Decode DTC based on ATDPN/ATDP vehicle protocol (CAN count versus ISO 9141/KWP legacy pairs); do not show `NO DATA`, unknown protocol, partial response or a timeout as verified zero faults.
- Use connection epochs and operation serialization, label partial scans honestly, keep unverified BMW modules locked, and keep Mode 04 and vehicle-changing operations disabled in UI, session and transport. Do not infer a bad coil from a P030x code alone.
- Reports remain in memory by default; saving locally is opt-in. RAW/VIN/identifiers require user review, with no automatic cloud upload.
- Recorded Floot verification: **11 default Jasmine spec files PASS + 2 explicit hook spec files PASS**, clean typecheck, checkpoint `af4db906-ea79-450e-a97a-80d8af36f0d1`. Publish job `f1ba009f-5fe7-40ba-bdc0-926600400715` succeeded and production returned HTTP 200. This proves hosting/build readiness, NOT a functioning BLE session, screenshot quality or ECU communication.
- Latest read-only status: published on a free Floot plan, no native mobile build, 2 native build slots remaining. A fresh `list_files` call was **refused at 2026-09-20T23:12:50Z** by the 100-action daily limit; tool reported reset `2026-09-21T00:00:00Z` (02:00 Germany). Retry only after reset or a newly confirmed plan change; do not infer current source or modify files blindly. Screenshot job previously awaited the user opening the preview/editor.

## GitHub changes verified after the former handoff

- PR #19 merged, fixing native Swift protocol-aware Mode 03 at code/test level; issue #13 closed. Physical Carista/E39 validation still outstanding.
- PR #21 merged as `85fd1154ea5e7f6f3ccfcac5066ff44205622857`: Connection Doctor rejects standalone or mixed ATI `ERROR` rather than promoting adapter/ECU online. Post-merge main CI run `35544016049` **success**. Do not treat this PR as open anymore.
- PR #23 merged as `08efa308a62c6203f9f7aa32471edea4c9965e82`: portable core rejects `CAN ERROR`, conflicting ATDP lines, error-contaminated positive PID/DTC evidence and `ADAPTER_IDENTIFIED('ERROR')`. New `test/protocol-evidence.mjs` is in `npm test`. PR CI `35544173824` success; post-merge main CI `35544207406` **success**. These corrections exist in GitHub, NOT automatically in Floot.
- Added `docs/IOS_BLE_REALITY_CHECK.md`, grounded in https://caniuse.com/web-bluetooth and https://carista.com/pages/faqs . Safari on iOS 27 lacks native Web Bluetooth; a web page cannot directly connect without a **separately verified** compatible bridge/browser. A signed native CoreBluetooth app is a different release. Official Carista OBD and Carista EVO have different documented E-series K-line capabilities; neither proves compatibility with this specific code or vehicle connector.
- Issue #4: multi-responder Floot parser code fix and tests done, real hardware acceptance still open. Issue #15: partial transfer done; complete regression parity, single canonical session and hardware test pending. Issue #20: *independent GitHub legacy* `public/obd-runtime.js` still has unsafe/permissive raw commands, a regex-only ECU-online decision and late-response races; do not close because Floot or portable core is fixed.
- PR #7 experimental local USB/K-line gateway and PR #9 draft R36SX probe remain unmerged/unvalidated and are not installed in Floot. Do not deploy a separate gateway, overwrite the current app or claim BMW OEM-module compatibility.

## Exact next execution order

1. **Read-before-write:** refresh current main/PRs/issues and the single Floot project's tree/version after its quota resets. Read Floot `floot-overview` guide and batch-read current `helpers/diagnosticCore.tsx` if present, `obdRead`, `obdSession`, `caristaBle`, `webObdBle`, `vciRouter`, `pages/_index.tsx` and corresponding specs. Preserve current user-selected design and working flow. Never overwrite newer Claude work.
2. **Platform gate first:** determine whether the owner's actual iPhone is running Safari, a verified Web Bluetooth browser/extension, a Floot native build or a separately signed Swift client. An absent `navigator.bluetooth` is `PLATFORM_UNSUPPORTED`, **not** an adapter, GATT or ECU failure. Follow `docs/IOS_BLE_REALITY_CHECK.md`; do not spend a native build credit without an explicit build request and readiness.
3. **Regression parity, no duplicate parser:** compare `test/diagnostic-core.mjs` **and** `test/protocol-evidence.mjs` with existing Floot Jasmine coverage: CAN count, ISO 9141, mixed `ERROR`, conflicting ATDP, multi-ECU PID `0100`, truncated second responder, no-data, epoch/reconnect and verified empty versus not scanned. Import only missing *pure typed* functionality into the single canonical Floot parser/session; no new DB, shadow state, duplicate dashboard or `@ts-nocheck`.
4. **Read-only hardware evidence:** actual iPhone/adapter/BMW observed at rest by a competent operator: platform support → BLE discovery → observed GATT services/characteristics → notifications → ATI identity → complete PID `0100` positive reply → ATDPN/ATDP → a supported read-only DTC/live response → safe disconnect/reconnect. Capture the **first failed stage**, timestamp, and reviewed RAW. No synthetic VIN, DTC, voltage or measurements. Do not infer manufacturer-specific modules from generic emissions OBD.
5. **Safety/UX audit:** one transport lock and epoch for all requests, safe timeout/disconnect, no old RX accepted after reconnect, every ONLINE label based on actual ECU evidence, explicit `null` for not scanned and `[]` only for verified no faults. Keep Mode 04, actuation, adaptations, coding, tuning writes, immobilizer actions and flashing unavailable. Review any source files for misleading enabled buttons and stale data.
6. **Release:** after changes run Floot typecheck, 11 standard specs and 2 explicit hook specs; visually inspect live preview when an editor window exists, checkpoint, publish the **existing** Floot project, await job success and check production. For native iOS independently verify signed build/distribution and Bluetooth permission; no claim of TestFlight from an unsigned IPA.

## Completion and hardware boundary

A successful CI run, SSR/HTTP 200, ATI reply or example UUID does NOT prove iPhone→Carista→BMW connectivity. The 1999 E39 round 20-pin connection requires verified physical/electrical/protocol compatibility; no cloud host can replace this. Close #4/#15 only with real reviewed read-only field evidence and completed software parity; keep #20 separate. Protect vehicle data and never upload RAW without the owner's review.
