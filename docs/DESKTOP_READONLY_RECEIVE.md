# Desktop PRO — bounded receive-only transport

The desktop native host now has a receive-only serial primitive for an already-bound, already-configured transport epoch.

## Preconditions

The coordinator must report:
- the same epoch;
- transport open;
- port configured.

The native owner must hold the same configured serial port.

## Bounds

- no write API exists;
- timeout: 10–5000 ms;
- DS2 response cap: 255 bytes;
- BMW KWP2000 response cap: 197 bytes;
- one read returns one bounded byte array;
- timeout returns an empty `READ_TIMEOUT` result;
- unexpected I/O failure closes the native port and clears open/configured state.

## Evidence rule

Received bytes are raw transport evidence only.

A successful read always returns:
- `ecuVerified=false`;
- `writesEnabled=false`.

A later parser/correlation layer must establish framing, checksum, direction, request correlation and module identity before any ECU state can be promoted.
