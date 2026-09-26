# Legacy BMW serial profile evidence

Hanna & Ada now models the legacy serial layer from public reference behavior without copying the reference implementation.

## DS2

Reference concept:
- concept id: `0x0006`;
- minimum communication parameter count: 8;
- baud rate source: communication parameter index 1;
- parity: `EVEN`;
- DS2 has special DTR behavior: DTR is used for send when adapter echo is absent.

Important: this means Hanna & Ada must **not hard-code one universal DS2 baud rate**.

## KWP2000 BMW

Reference concept:
- concept id: `0x010C`;
- minimum communication parameter count: 33;
- baud rate source: communication parameter index 1;
- parity: `NONE`.

DTR behavior for this profile is deliberately left `NOT_ESTABLISHED_HERE` rather than guessed.

## Current boundary

`LegacySerialProfile` only resolves metadata. It does not:
- open USB;
- call `setParameters()`;
- read or write serial data;
- send BMW commands;
- verify an ECU;
- enable writes.

The physical bridge remains transport-only. A later stage may apply a resolved profile only after the exact vehicle/module communication parameters are established.
