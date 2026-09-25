# Connection Doctor — deterministic read-only evidence contract

Portable implementation: `public/connection-doctor.js`. Protocol authority and parser state live in `public/diagnostic-core.js`; browser wiring lives in `public/diagnostic-core-v2.js` and `public/obd-runtime.js`.

## Protocol authority invariant

`ATDPN` is the single source of truth for the active ELM327 protocol identifier. A valid reply is exactly one protocol token after optional command echo: `1`–`9`, `A`, `B`, `C`, or the auto-search form `A<id>` such as `A6`. The normalized immutable authority contract contains:

- `protocolId`
- `rawAtdpn`
- `isAutoDetected`
- optional `descriptionFallback`
- `sourceAuthority: 'ATDPN'`

`ATDP` is presentation metadata only. It can provide a human-readable label but cannot establish, rescue, override, or contradict protocol authority. Missing, ambiguous, error-tainted, multi-line, or unknown `ATDPN` replies fail closed.

IDs `1`–`5` map to the generic legacy framing used by this decoder; `6`–`9` map to ISO 15765-4 CAN. IDs `A`, `B`, and `C` are retained in the authority contract but remain `unknown` for generic emissions-OBD decoding until a dedicated framing contract exists.

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
  protocolDescriptionReply: optionalATDPResponse,
  transportError: null,
});
```

Only observations from the current connection epoch are valid. Disconnect resets protocol authority, PID evidence, DTC evidence, command buffers, and any pending transaction. A new verified PID 0100 response also invalidates older protocol and DTC evidence.

## Transport fail-safe rules

The browser runtime permits one ELM transaction at a time. Every transaction has a bounded timeout and session epoch. Timeout, write failure, oversized reply, unexpected trailing reply data, or stale-session data taints the channel; no further command is accepted until a disconnect/reconnect cycle clears the transport.

Unsolicited bytes without a live request are discarded instead of being appended to the next command. Reply accumulation is bounded to 64 KiB. The globally exposed bridge is `readOnlyCommand`; the unrestricted initialization transport is private to the module.

The terminal allowlist is restricted to `ATI`, `ATDP`, `ATDPN`, `ATRV`, Mode 01 `01xx`, Mode 03, Mode 07, and Mode 0A. Vehicle coding, actuation, adaptation, DTC clearing, security access, flashing, header changes, and protocol changes are not exposed through the terminal bridge.

## Verification gates

`test/protocol-evidence.mjs` proves the ATDPN authority contract, ATDP non-authority, stale-epoch rejection, invalidation on fresh ECU evidence, and fail-closed DTC behavior. `test/connection-doctor.mjs` covers the connection triage invariants. `test/terminal-readonly-guard.mjs` and `test/web-runtime-wiring.mjs` prove the read-only surface and wiring.

CI runs these protocol invariants explicitly and then executes the entire `npm test` suite. Green CI verifies software invariants only; it does not certify physical adapter firmware, vehicle wiring, BMW-specific module access, or manufacturer-level diagnostics.
