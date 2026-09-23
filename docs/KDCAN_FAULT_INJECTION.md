# K+DCAN fault-injection matrix

The Android transport state machine now has a deterministic stress test in addition to scenario tests.

`KdcanTransportFaultTest` runs 1500 state transitions including:

- repeated session begin/rebind;
- port-open attempts;
- duplicate or out-of-order request binding;
- response correlation without a matching token;
- disconnect at arbitrary points;
- watchdog expiry;
- deliberately stale epochs;
- deliberately wrong session IDs.

## Global invariants checked after every transition

- `ecuVerified == false`
- `writesEnabled == false`
- inactive session implies `portOpen == false`
- inactive session implies `requestBound == false`
- each valid rebind advances the epoch
- disconnect purges all transient evidence

The test is deterministic, so any regression reproduces with the same sequence.
