# Read-only request registry and identity-candidate gate

The request registry is intentionally metadata-only.

It records which read-only operation is conceptually allowed for a module family, but it does **not** contain:
- raw serial bytes;
- a generic command string;
- arbitrary TX payload;
- write/coding/actuation/flash operations.

Current metadata profiles:
- E39 DME ME7.2 module identity → BMW KWP2000.
- E39 legacy module identity → DS2.

Each instantiated request plan is bound to:
- one transport epoch;
- one request id;
- one protocol;
- one response-size limit;
- one timeout.

The separate module-identity evidence gate requires:
- same epoch;
- same protocol;
- FRAME_CANDIDATE transport evidence;
- matching request id;
- non-echo KWP direction when applicable;
- sanitized module identity.

Even after all of those conditions pass, the result is only:
`CORRELATED_IDENTITY_CANDIDATE`.

It still returns:
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`.

A future trusted host-side verifier must supply independently validated request/response evidence before the canonical evidence contract may advance to READ_ONLY_IDENTITY_VERIFIED.
