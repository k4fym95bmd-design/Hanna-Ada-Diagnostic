# Connection Doctor — real evidence, no simulated success

Portable implementation: `public/connection-doctor.js`, tested by `test/connection-doctor.mjs` in the standard `npm test` suite. This code currently diagnoses *observations supplied by a transport*; it does not establish BLE or ECU access and is not yet wired into Floot.

## Observation contract

```js
import { diagnoseConnection } from './connection-doctor.js';
const diagnosis = diagnoseConnection({
  bluetoothPowered: true,
  adapterSeen: true,
  bleConnected: true,
  gattDiscovered: true,
  notificationsActive: true,
  adapterReply: actualATIResponse,
  pid0100Reply: actualPID0100Response,
  protocolReply: actualATDPNResponse,
  transportError: null,
});
```

Supply only actual responses from the CURRENT session. Never set a true stage from a button click, a selected device name, an adapter marketing claim, a saved screenshot, or demonstration fixtures. Clear observations on disconnect and increment the session epoch. When a command times out, disconnect and clear the command channel before accepting subsequent responses: otherwise a delayed old response can be misattributed to a new command.

Triage stages: `BT_UNAVAILABLE`, `ADAPTER_NOT_FOUND`, `BLE_NOT_CONNECTED`, `GATT_NOT_FOUND`, `NOTIFY_NOT_READY`, `TRANSPORT_ERROR`, `ADAPTER_UNVERIFIED`, `ECU_NOT_PROBED`, `ECU_RESPONSE_INVALID`, `PROTOCOL_UNVERIFIED`, `GENERIC_OBD_VERIFIED`. A clean ATI string cannot establish ECU access. A valid `41 00` PID bitmap establishes only generic emissions OBD. ATDPN/ATDP helps prevent false DTC decoding for headers-off CAN versus older K-line protocols. Never automatically reuse a previous session's protocol, PIDs or DTCs.

The summary intentionally excludes RAW hex, VIN, device UUID and adapter identity; raw traces should only be exported after user review. `bmwModulesVerified` and `writesEnabled` always remain false. The actual 1999 E39 under-hood 20-pin connector, pin population and physical module transport must be verified separately.

## Existing web-runtime issue to resolve before release

`public/obd-runtime.js` currently checks the `0100` reply using a regular expression instead of strict `decodeSupportedPIDs`, and its generic raw terminal only blocks command `04` rather than using a read-only command allowlist. `public/diagnostic-core-v2.js` also falls back to a permissive DTC parser and may report no faults when parsing fails. **Do not label the current web-runtime path hardware-verified.** Replace those paths with the verified diagnostic core and explicit read-only command policy before any field release; integrate into Floot separately, without copying this standalone shell over the existing UI.

## Validation gate

CI green verifies parser logic, not physical Carista firmware, native CoreBluetooth characteristics or BMW wiring. Vehicle testing should capture discovery, selected GATT UUIDs, first handshake reply, PID 0100, ATDPN and the first failed command. Do not publish a raw transcript without reviewing sensitive identifiers.
