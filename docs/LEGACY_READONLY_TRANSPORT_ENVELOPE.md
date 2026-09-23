# Read-only legacy transport envelope

`LegacyReadOnlyEnvelope` is the bounded receive-side container for one future legacy BMW request.

It deliberately contains **no transmit API and no command bytes**.

## Preconditions

The underlying `KdcanTransportSession` must already be:
- active;
- on the expected epoch;
- physical port open;
- `PORT_CONFIGURED`.

Opening an envelope consumes the one-request slot through `bindRequest(...)`.

## Bounds

Each envelope has:
- one request id;
- one protocol: DS2 or KWP;
- one epoch;
- one deadline;
- one maximum response size.

Protocol-specific hard maximums:
- DS2: 255 bytes;
- KWP: 197 bytes.

## Failure behavior

The request is aborted and the envelope becomes terminal on:
- timeout;
- response overflow;
- invalid frame structure/checksum;
- explicit cancellation.

A valid frame is then passed to the existing correlation gate, which still rejects request mismatch and KWP adapter echo.

## Safety properties

Even a fully correlated frame leaves:
- `ecuVerified = false`;
- `writesEnabled = false`.

The envelope does not expose:
- serial `write()`;
- DTR manipulation;
- DTC erase;
- coding;
- actuation;
- firmware flashing.

Actual BMW request bytes remain a separate future gate.
