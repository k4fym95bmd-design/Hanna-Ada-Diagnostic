# Hanna & Ada — mobile workshop fusion (22 September 2026)

This is an implementation specification within the EXISTING `Hanna-Ada-Diagnostic` repository. The existing Floot app `396c32bd-4ec9-47b3-bb71-29d6458d9511` at https://bmw.floot.app is the user-facing product; it is not automatically synced with GitHub. Follow `docs/FLOOT_TRANSFER_PLAN.md`, issue #15 and currently open native PRs before integration. Do not make another app, database, vehicle session, backend or dashboard.

## Three professional reference systems — independent original implementation

These are complementary reference products, **not a provable worldwide top-three ranking**, and their licensed code, diagrams, vehicle databases, assets, branding and diagnostic protocols are NOT copied.

1. **Autel MaxiSYS Ultra S2** — official product documents describe topology visualization, PID grouping, multi-PID comparison, graphing and min/max/average reference sampling, plus split-screen diagnostic views. Take away: evidence-qualified data groups and optional chart summaries, never invented live points or a BMW module topology. Sources: https://www.autel.com/mk3/4272.jhtml and https://www.autel.com/u/cms/www/202503/17015759km0r.pdf .
2. **LAUNCH X-431 PAD VII / PAD 7** — official documentation describes color-coded topology, pre/post reports, intelligent diagnostics, module expansion and communication/status views. Take away: explicit scan stage and a two-snapshot difference report restricted to the same verified vehicle and protocol. Source: https://en.cnlaunch.com/products-detail/i-223.html and https://en.cnlaunch.com/news-detail/i-115.html .
3. **Bosch ESI[tronic] with KTS 560/590** — official documentation describes guided troubleshooting, experience-based repair, live data, wiring and maintenance information. Take away: an evidence-dependent NEXT STEP and a future user-licensed repair-document entry point; no access to Bosch's subscription data, electrical diagrams or validated repair outcomes is implied. Source: https://www.boschaftermarket.com/afr/en/diagnostic/ecu-diagnosis/esitronic/ .

## Added portable core

`public/workshop-fusion.js` is PURE and read-only. It is **not a Bluetooth driver** and is not yet wired into Floot. It offers:

- `buildWorkshopDashboard(canonicalSession)` — the single canonical epoch-protected session is its input, never a second connection/session. Bluetooth-only and adapter-only states cannot show ECU online. Show observed generic OBD evidence only. `bmwModulesVerified=false` and `writesEnabled=false` always. The `topologyStatus` means an **evidence map**, not real vehicle ECU network topology.
- Read-only grouped PID eligibility: engine/ignition context, air/fuel, motion. Include only PIDs that the ECU has positively advertised. This is not proof of a broken coil or of a healthy component.
- `compareVerifiedDtcScans(before,after,{sameVehicleConfirmed:true})` — requires two verified generic-OBD snapshots with matching nonempty local vehicle reference, confirmed protocol and ordered timestamps. Reports newly seen/persisting/no-longer-seen codes. Does NOT copy vehicle keys into output, prove repairs, change fault memory or conflate unscanned with zero codes.
- `summarizeLivePid(samples)` — accepts a bounded series of verified, time-ordered finite samples; returns count/min/max/mean and duration, with `referenceRange:null`. No random/demo graph masquerading as live data, calibration, OEM normal ranges or automatic mechanical diagnosis.
- `nextStep` guides only the read-only sequence CONNECT → ATI → complete PID 0100 → protocol evidence → generic DTC read. This is a workflow prompt, not an automotive repair instruction, OEM database or automatic diagnosis.

## One mobile product, honest platform capability

- Floot existing React/Capacitor UI remains the canonical mobile product. Use the existing `helpers/diagnosticCore.tsx`, `obdRead.tsx`, `obdSession.tsx`, `caristaBle.tsx`, `webObdBle.tsx` and ONE page `pages/_index.tsx`. Port the pure functions with types or adapt them into an existing helper only after reviewing newer changes. Do not replace or copy the separate `public/obd-runtime.js` into Floot; issue #20 records known unsafe legacy behavior.
- Android: existing standalone Android 5 minimum SDK 21 module is a separate probe; check each OS/API/device transport capability rather than claiming every Android device supports BLE, USB host or the vehicle adapter. Modern Bluetooth permission models differ from older Android releases; avoid broad permissions and avoid automatic scanning.
- iOS: Safari does not provide the same Web Bluetooth path as Android Chromium; a signed native Capacitor/CoreBluetooth build and supported BLE adapter have different gates. An unsigned IPA or a website returning HTTP 200 proves neither. Do not claim support for every historical iOS version without checking the actual deployment target and device hardware.
- Full BMW E39 20-pin K-line/DS2/KWP, DME/EGS proprietary modules, oscilloscope, J2534, coding, actuation, tuning write and flashing remain **not verified or disabled**. Generic emissions OBD is not OEM coverage. The later desktop and cable phase must reuse the core after hardware/electrical validation.

## Floot integration steps after quota resets

1. Refresh Floot version and GitHub main/PR #34/current issue #15 first; do not overwrite newer Claude work.
2. Add ONLY missing pure functionality into the existing canonical session and current dashboard. Preserve graphite/electric blue/red theme. Display actual connection stages, group eligibility, explicit no-data and verified data badges. No speculative green indicators.
3. Store reports only after explicit local action and user review of RAW/VIN. Use existing data model. Never auto-upload vehicle information or run scans automatically.
4. Add Jasmine coverage for all 7 regression scenarios in `test/workshop-fusion.mjs`, plus session epoch/disconnect and responsive phone/tablet UI tests. Run Floot typecheck, all default specs and hook specs; inspect real preview before checkpoint and publishing the existing app.
5. Run native Android build + iOS signed build gates separately when available. Do not spend native build credits without an explicit release request. Physical car/adaptor validation remains a separate later gate, not a requirement for this software-only phase.

## Test/release truth

Seven isolated Node 22 unit tests for the pure helper passed in the assistant working environment. That is NOT the repository-wide CI, a native APK/IPA build, a Floot publish, a verified live vehicle session or a claim of product parity. GitHub `npm test` must run on the eventual PR and the Floot port must be independently tested and published. The Floot connector refused build actions on 2026-09-22, reporting reset 2026-09-23 00:00 UTC. Do not claim its current production changed because this GitHub branch exists.
