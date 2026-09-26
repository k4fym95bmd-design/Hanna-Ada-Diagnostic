# Desktop PRO native read-only request broker

The Tauri host now owns a metadata-only request broker above the configured serial transport.

## Broker invariants

- one active request maximum;
- operation ID must be in the native allowlist;
- protocol, timeout and response cap must exactly match the allowlisted operation;
- request ID is single-use for the current epoch;
- maximum 32 attempts per epoch;
- configured transport and native serial owner must both match the same epoch;
- native serial protocol must match the request protocol;
- close, clear or rebind resets broker state.

Current allowlisted operations:
- `e39-dme-me72-module-identity` → KWP2000_BMW / 750 ms / 197 bytes;
- `e39-legacy-module-identity` → DS2 / 750 ms / 255 bytes.

## Deliberate non-feature

The broker does not contain, accept or expose request bytes.

It manages only request metadata/control state. There is still no generic serial-write command exposed to the frontend.

All broker snapshots keep:
- `txBytesExposed=false`;
- `writeLike=false`;
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`.
