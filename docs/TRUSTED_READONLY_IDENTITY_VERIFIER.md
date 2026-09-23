# Trusted read-only identity verifier

`TrustedIdentityVerifier` is the confirmation gate above the metadata-only request registry and module identity candidate assessment.

It requires **two independent, matching read-only identity attempts** before producing `READ_ONLY_IDENTITY_VERIFIED`.

## Required invariants

Both accepted attempts must have:
- the same physical transport epoch;
- the same registry operation;
- the same protocol;
- the same module family;
- different request IDs;
- correlated request/response evidence;
- a non-echo KWP reply when KWP is used;
- the same sanitized module identity.

## Rejections

The verifier blocks:
- stale epoch;
- registry/plan mismatch;
- request-ID replay;
- echo or uncorrelated response;
- malformed/unsafe identity.

If the second eligible attempt reports a different identity, confirmation state is reset.

## Important boundary

`READ_ONLY_IDENTITY_VERIFIED` means only that the module identity was reproduced consistently through the read-only evidence chain.

It still returns:
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`.

No raw TX material or write operation is introduced by this verifier.
