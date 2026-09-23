# Legacy protocol evidence contract — Android parity

This module is intentionally **not a diagnostic transmitter**.

`LegacyFrameEvidence.java` mirrors the repository's existing passive DS2/KWP framing rules in a pure-Java Android-compatible form so the native path can validate received bytes consistently.

## Guarantees

- no USB access;
- no port open;
- no serial write;
- no ECU request;
- no DTC erase, coding, actuation or flash;
- checksum/length validity is structural evidence only;
- `ecuVerified` is always `false`.

## Accepted evidence classes

### DS2 candidate
- bounded frame size;
- declared length equals actual length;
- XOR checksum is valid.

### KWP candidate
- `0xB8` header;
- bounded payload length;
- actual length matches payload length;
- XOR checksum is valid;
- source/destination direction is a **hint only** because adapter echo remains possible.

## Promotion rule

A frame may only become real ECU evidence in a later session layer that can bind:
1. one physical USB session,
2. one known request,
3. one matching response,
4. a fresh nonce/session epoch,
5. a reproducible module identity.

Until that layer exists, structurally valid traffic remains unverified.
