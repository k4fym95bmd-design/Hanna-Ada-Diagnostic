# Hanna & Ada · PRO PERFORMANCE (22.09.2026)

**Development branch only. Not a production/Floot deployment or proof of a physical BMW connection.** This builds on the EXISTING application, VCI view and `window.HannaAdaOBD` session. It does not replace Claude's or Floot's work, start another project, install a second database or create a new vehicle session.

## What changed

- The legacy `obd-runtime.js` calls `readAll()` for 12 PID/voltage reads sequentially on each 2.5-second live timer. On a slow adapter, that batch can occupy the bus long enough that controls contend with it. It also queries unsupported PIDs if supported-PID discovery yielded no entries.
- `public/live-performance-core.js` is a small transport-independent, read-only scheduler: max **four** sequential reads per cycle, RPM and coolant as the fast group when *actually supported*, up to two rotating lower-frequency PIDs, always with a strict verified support gate. Voltage is adapter-level and does not prove an ECU PID.
- Adaptive idle delay is bounded to 600–2400 ms based on observed latency; this is **not** a claimed sampling frequency or benchmark improvement. After three consecutive exceptions it stops, rather than retrying indefinitely.
- One bus owner: no parallel snapshot, PID polling or DTC command. Existing DTC button stops the new poller and waits for any in-flight operation before invoking the original DTC reader.
- When the VCI page is left or hidden, no new background reads start. On stop/disconnect, a result from an old session is not credited to metrics. It is not possible to cancel a USB/BLE operation already in progress simply by clearing a UI timer.
- Existing status is extended with observed reads/cycles/errors and average command latency. No VIN, DTC, ECU identity or live values are generated.

## Files

`public/live-performance-core.js` + `public/live-performance-runtime.js` + `public/live-performance.css`, loaded ONCE by the existing `public/index.html`, after its original `obd-runtime.js`. No additional BLE session, no new API endpoint, no write mode.

Regression: `npm run test:performance` executes syntax checks and `test/live-performance-core.mjs` plus `test/live-performance-wiring.mjs`. Matching local Node 22 source was tested: **11/11** tests passed. GitHub Actions has failed before starting any steps on previous attempts, so full repository CI is **NOT** marked green.

## Still required before production

1. Reconcile with the CURRENT Floot `pages/_index.tsx`, `helpers/obdSession.tsx`, `helpers/obdRead.tsx`, and tests after Floot metered actions become available. The repo's standalone `public/index.html` is a separate web entrypoint, NOT the live Floot source. Don't paste it over Floot's page.
2. Validate browser integration with real DOM and current project state. No hardware benchmark, USB chipset/protocol proof, or iOS/Android native validation has occurred.
3. Check BLE pending-command cancellation on disconnect in the existing runtime; the scheduler only prevents new reads and stale metrics, and cannot cancel an already dispatched transport read. Reset stale live widgets on disconnect in the canonical runtime.
4. Actual BMW E39 cable reads still require a compatible physical interface and separately validated K-Line/DS2/KWP framing/ECU identity. WebUSB enumeration or COM open alone is not that protocol. Keep writes, coding, actuation, erase and flash disabled.

Do not confuse local synthetic scheduling tests with measured vehicle diagnostics throughput. Merge/release only after CI, manual browser integration and appropriate physical read-only testing.
