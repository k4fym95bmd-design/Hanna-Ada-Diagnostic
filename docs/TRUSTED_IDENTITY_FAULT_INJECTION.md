# Trusted identity fault-injection matrix

The read-only identity chain now includes a deterministic 1000-step stress test.

Injected conditions include:
- request-id replay;
- one-token-at-a-time violations;
- KWP possible echo;
- stale epoch events;
- conflicting module identity;
- cancelled attempts;
- raw-TX material injected into the event envelope;
- attempts to create a third request after identity reached 2/2.

After every transition the global invariants are asserted:
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`;
- `txBytesExposed=false`;
- `writeLike=false`.

The test intentionally covers evidence/control-plane behavior only. It does not transmit to a vehicle.
