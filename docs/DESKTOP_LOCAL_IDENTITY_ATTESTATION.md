# Desktop PRO local identity attestation

Two correlated module-identity candidates are intentionally not enough by themselves.

The final read-only identity gate now requires a native Tauri attestation from the same configured transport epoch.

## Native attestation checks

The Rust host requires:
- transport coordinator configured and open;
- native serial owner configured and open;
- exact same epoch;
- exact same DS2/KWP protocol;
- native request broker idle;
- at least two native request attempts recorded;
- no raw serial-write capability exposed.

The attestation includes a monotonic native sequence number.

## Finalizer

`finalizeReadOnlyIdentity(...)` requires:
- a repeated correlated identity candidate (2/2);
- `localAttestationRequired=true`;
- matching native epoch/protocol attestation.

Only then does it emit:

`READ_ONLY_IDENTITY_VERIFIED`

This is deliberately narrower than ECU verification. Even after successful finalization:
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`.
