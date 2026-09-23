# Legacy port configuration plan gate

This layer binds a resolved DS2/KWP serial profile to one active K+DCAN transport epoch.

It is intentionally a **plan**, not a hardware operation.

## Required conditions

A plan is created only when:
- the transport session is active;
- the epoch matches exactly;
- the physical serial port is already open;
- no diagnostic request is currently bound;
- the serial profile is present;
- communication parameters resolve successfully;
- parity and baud data are internally consistent.

## Hard blocks

- stale epoch;
- disconnected session;
- closed port;
- request already in flight;
- unresolved/invalid profile;
- parity mismatch;
- invalid baud.

## Safety boundary

A successful plan still has:
- `applied = false`;
- `ecuVerified = false`;
- `writesEnabled = false`.

No `UsbSerialPort.setParameters()`, DTR manipulation, read or write occurs in this layer.
