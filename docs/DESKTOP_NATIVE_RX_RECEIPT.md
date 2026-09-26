# Desktop PRO native receive receipt

A metadata request token is no longer enough to consume an identity attempt.

When a read-only request is active, the Rust host records physical `READ_BYTES` from the configured serial port and creates a monotonic native receive receipt.

## Properties

- receipt is created only after at least one real byte is read;
- fragmented reads for the same active request reuse the same receipt;
- accumulated bytes cannot exceed the allowlisted response cap;
- broker consume requires exact epoch + request-id + native receipt;
- successful consume increments `evidencedAttemptCount`;
- cancellation or timeout does not increment evidenced attempts;
- read I/O failure closes the port and resets the broker fail-closed.

## Identity provenance

The trusted identity event must match:
- the same epoch;
- the same request-id;
- the same protocol;
- the native receive receipt;
- the exact frameHex sequence produced by the shared passive parser.

Local attestation requires at least two **evidenced** native attempts, not merely two planned attempts.

This still does not expose TX, coding, actuation or flash capability.
