# Trusted correlation session executor

`TrustedCorrelationSession` sits between the metadata-only read-only request registry and the two-attempt identity verifier.

It still does **not transmit bytes**.

## Responsibilities

- one active request token maximum;
- request IDs are single-use for the entire session;
- a consumed, failed or cancelled token cannot be reused;
- every response attempt consumes the active token;
- all plans are bound to one immutable transport epoch;
- the verifier requires two independent matching attempts.

## Why consume on failure

Echo, malformed correlation or identity failure must not allow the same request token to be replayed until a favorable result appears. A new attempt requires a new request ID.

## Safety boundary

The executor exposes:
- request metadata;
- epoch;
- correlation/confirmation state.

It does not expose:
- request bytes;
- arbitrary TX;
- coding;
- actuation;
- flash.

Even after `READ_ONLY_IDENTITY_VERIFIED`:
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`.
