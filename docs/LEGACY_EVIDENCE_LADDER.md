# Legacy evidence ladder

The Android K+DCAN path now uses explicit evidence promotion levels:

1. `USB_ENUMERATED` — a USB device exists.
2. `SERIAL_FAMILY_KNOWN` — FTDI/CP210X/CH34X/PL2303/CDC-ACM identified.
3. `PORT_OPEN` — one physical serial session is active.
4. `FRAME_STRUCTURAL` — DS2/KWP length/checksum structure is valid.
5. `RESPONSE_CORRELATED` — fresh session + epoch + request id + non-echo frame match.
6. `MODULE_IDENTITY_CANDIDATE` — correlated response includes a sanitized identity token.
7. `ECU_VERIFIED` — **not implemented yet**.

No lower level implies a higher one.

The new `LegacyEvidenceCorrelation` gate explicitly rejects:
- stale/mismatched sessions;
- stale epochs;
- closed/unbound transports;
- response/request mismatches;
- invalid frames;
- adapter echo;
- unsafe identity strings.

Even `MODULE_IDENTITY_CANDIDATE` keeps `ecuVerified=false` and `writesEnabled=false`.
