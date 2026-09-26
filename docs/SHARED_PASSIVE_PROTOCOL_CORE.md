# Shared passive legacy protocol core

Hanna & Ada now uses one pure JavaScript framing core for passive BMW DS2/KWP receive evidence.

`public/passive-legacy-rx.js` contains the canonical:
- `PassiveDs2Decoder`;
- `PassiveKwpDecoder`.

Consumers:
- Node/gateway passive serial listeners;
- Desktop PRO receive evidence;
- future browser-safe evidence surfaces.

The shared module has no USB access, serial handle, TX API or ECU-verification authority.

Desktop PRO feeds bounded native `READ_BYTES` results into `DesktopReceiveEvidenceSession`, which can advance the canonical transport evidence contract only as far as `FRAME_CANDIDATE`.

A checksum-valid DS2/KWP frame, including a possible KWP echo, still returns:
- `ecuVerified=false`;
- `writesEnabled=false`;
- `flashEnabled=false`.

Module identity and request correlation remain separate later gates.
