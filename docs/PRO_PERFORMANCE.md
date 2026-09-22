# Hanna & Ada · PRO PERFORMANCE (22.09.2026)

**Development branch only. Not a production/Floot deployment or proof of a physical BMW connection.** This builds on the EXISTING application, VCI view and `window.HannaAdaOBD` session. It does not replace Claude's or Floot's work, start another project, install a second database or create a new vehicle session.

## Performance architecture

- Legacy `obd-runtime.js` calls `readAll()` for 12 sequential PID/voltage requests each 2.5-second live timer. Slow adapters can saturate the bus and delay interactive commands. An empty supported-PID discovery also permits speculative requests in the legacy path.
- `public/live-performance-core.js` uses a single bus owner and reads at most **four** items in one cycle: RPM and coolant only when confirmed by the PID bitmap; up to two other channels rotate. Adapter voltage is separately requested and DOES NOT establish BMW ECU access.
- Adaptive idle delay stays within 600–2400 ms, based solely on valid numeric response latency; it is NOT a proven improvement percentage, refresh rate or physical benchmark. The controller serializes reads, rejects overlapping snapshots and waits for its current read to settle before a DTC read.
- **Sample integrity hardening:** a successful Promise is not necessarily a successful measurement. Only finite JavaScript numbers are counted in `reads`, `completed` and latency. `null`, `undefined`, NaN, infinity and strings count separately as `noData`; thrown transport errors count in `errors`. Three consecutive no-data or transport failures stop polling. A valid zero is accepted and resets that failure streak.
- The UI now displays `poprawne`, `NO DATA` and `błędy` as separate metrics. Snapshot completion below attempted is labeled **incomplete** rather than successful. Stale results from an invalidated session do not accrue metrics.
- Hidden/left view does not launch fresh background PID requests. No new BLE adapter, database, vehicle session, arbitrary command, coding, erase, actuation or flash is introduced.

## Files and evidence

Source files: `public/live-performance-core.js`, `public/live-performance-runtime.js`, `public/live-performance.css`. These load ONCE into the standalone existing `public/index.html` after its original `obd-runtime.js`.

`npm run test:performance` now syntax-checks both modules and runs `test/live-performance-core.mjs`, `test/live-performance-quality.mjs`, and `test/live-performance-wiring.mjs`. Adapted old mocks return finite numbers, consistent with the real transport contract; six extra regressions cover null, invalid numerical values, repeated no-data, valid zero, mixed failure modes, and stale pending responses. Matching local isolated Node source: **15/15 core + quality cases passed**; earlier wiring tests were checked independently. This is NOT complete repository CI, a physical benchmark, Android Chrome E2E, or actual BMW ECU evidence. GitHub Actions failed before running any job steps on previous runs; investigate repository Actions status, quotas/runner messages rather than changing application logic at random.

## Still required for release

1. Reconcile with CURRENT Floot `pages/_index.tsx`, `helpers/obdSession.tsx`, `helpers/obdRead.tsx` and tests after the 22 September action quota clears. The standalone GitHub web entrypoint and live Floot code are distinct; never overwrite Floot blindly.
2. Run full repository CI and browser integration tests. Collect hardware latency/throughput from a real supported adapter before proposing a performance percentage. Check true read-only protocol evidence and reliable ECU identity.
3. Check pending-command cleanup on BLE disconnect in the original runtime; scheduler only prevents fresh reads and stale metrics and does not cancel already dispatched hardware reads. Clear stale displayed live values on disconnect in the canonical runtime.
4. Genuine BMW E39 cable reads need verified USB-serial driver plus BMW K-Line/DS2/KWP transport framing and ECU identification. WebUSB enumeration, open/close and COM port opening do not constitute this. Keep all vehicle write operations locked.

Do not merge, release or claim an achieved 240% improvement on the strength of isolated scheduling tests alone.
