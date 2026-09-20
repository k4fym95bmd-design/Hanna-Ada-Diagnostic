# iPhone connection reality check (2026-09-21)

## Hardware and runtime facts

- The published Floot page (`https://bmw.floot.app`) is a web deployment. Publishing it and receiving HTTP 200 does **not** install a native CoreBluetooth bridge or prove vehicle connectivity.
- Safari on iOS 27 does not natively expose Web Bluetooth (`navigator.bluetooth`), according to the Web Bluetooth compatibility table: https://caniuse.com/web-bluetooth . Browser-only BLE requires a separately verified compatible browser/extension and permissions; do not assume this is present on the owner's iPhone.
- An installed, signed native iOS app using CoreBluetooth is a separate distribution/runtime path. The Swift client under `ios-native/` and Floot React source are not automatically one app. Confirm the actual installed application and permission strings before field testing.
- Official Carista documentation distinguishes the Carista OBD and Carista EVO models. Only EVO is documented as supporting Carista's BMW E-series K-line customizations/service functions; this does **not** prove compatibility with this project's code or the owner's particular adapter: https://carista.com/pages/faqs . Generic OBD capability and BMW manufacturer-specific module access are separate milestones.
- A BMW E39 round 20-pin vehicle connector requires verified physical/electrical compatibility. Cloud services cannot replace a vehicle-side interface or provide direct access to the iPhone's Bluetooth radio.

## No-purchase, read-only field acceptance

1. Identify what is **actually installed and running**: Safari page, compatible Web Bluetooth extension/browser, Floot native build, or independently signed Swift build. Do not treat one as another.
2. Record permission and runtime capability (whether `navigator.bluetooth` exists for a browser, or actual CoreBluetooth authorization in a native app); if unavailable, stop at PLATFORM_UNSUPPORTED instead of saying the adapter is broken.
3. Only on a stationary vehicle and with an appropriate verified connector, capture stages BLE discovery → real GATT service/characteristics → notification subscription → ATI adapter identity → complete positive Mode 01 PID 0100 → ATDPN/ATDP vehicle protocol → read-only live/DTC result. Do not ask for a moving-vehicle test.
4. Preserve exact error stage and RAW transcript locally for review. Logs may contain VIN and device identifiers; never upload without the owner's review. `NO DATA`, malformed replies, timeouts and uncertain protocol must never show 'zero faults'.
5. Verify disconnect/reconnect resets epoch and pending requests before declaring ECU ONLINE. Do not enable Mode 04, actuation, coding, tuning writes, security access or flash as part of connectivity testing.

## Decision tree

- `navigator.bluetooth` missing in Safari: **web platform unsupported**; no change to PID parser, GATT UUID guesses, Supabase, Netlify or Railway can fix the missing browser API.
- BLE discovery works but services missing: obtain observed GATT UUID evidence; vendor examples are candidates, not proof.
- Adapter ATI responds, PID 0100 fails: investigate physical connection and ECU/protocol response without treating ATI as vehicle evidence.
- Valid PID 0100, DTC fails: check ATDPN/ATDP and service-specific framing; fail closed and retain reviewed RAW.

Related source and implementation plan: `docs/FLOOT_TRANSFER_PLAN.md`, issues #4, #15, #20; native Swift PR #19 is merged. No physical hardware connection is claimed by this document.
