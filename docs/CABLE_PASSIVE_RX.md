# Hanna & Ada — physical cable receive path (draft)

## What is connected in this branch

The EXISTING VCI page has a new `ODCZYTAJ PASYWNY RX` button inside its Windows bridge tab (`public/cable-rx-panel.js`). It calls the EXISTING local, token-protected Windows bridge at `GET /v1/rx` using the URL/token already entered in that tab. The bridge attaches `gateway/passive-ds2-rx.mjs` to the selected serial port's receive events after it has opened the port. It does **not** transmit any vehicle request, open a separate app, create a cloud vehicle session, store secrets, log payloads to disk or expose a raw command route.

The RX endpoint supplies the current 40-character bridge session ID, `portOpen`, cumulative byte count, rejected frame candidates and up to **16** checksum-valid candidate frames. Each frame is limited by DS2's single-byte total length (up to 255 bytes). The UI checks `/v1/status` again to reject results from a changed session; only a real user click fetches samples. Disconnect/close removes the port listener and discards captured frames. Authorization and exact allowed Origin are enforced as on the bridge's existing routes. LAN access still needs trusted HTTPS; never expose this local bridge on a public cloud host.

## What the evidence means

| Evidence | What is supported | What is NOT supported |
|---|---|---|
| USB device detected | USB descriptor visible | Appropriate cable wiring, ECU access |
| Serial port opened | OS driver opened a COM device | Vehicle protocol available |
| Passive RX bytes | Some bytes appeared on serial input | They came from an ECU |
| DS2 length/XOR frame | Bytes match one known framing pattern | Response to our request, genuine ECU identity |
| Actual ECU identified | **NOT IMPLEMENTED** | No read-DTC, coding, clearing, live engine PID claim |

No vehicle TX endpoint exists: `POST /v1/transmit` returns 404. A DS2-looking frame may be a USB echo, unrelated traffic or coincidental bytes. The bridge and parser always return `ecuVerified: false`. The parser works on byte chunks in memory, rejects overlarge chunks, resynchronizes after noise, and caps retained frames. The passive mode may see **zero bytes even with perfectly functioning hardware**, because many ECUs only answer a request.

## Research, still requiring target validation

- [pBmwScanner for BMW E38/E39](https://github.com/gigijoe/pBmwScanner): an external Python reference for BMW DS2 and KWP2000, with ME7.2/GS8.60.2 listed as tested. Not imported wholesale and not proof about this vehicle.
- [DS2 frame description](https://github.com/kmalinich/node-bmw-ref/blob/master/ds2/protocol.txt): module address, total frame length, payload, XOR checksum. Used only for framing, not to issue ECU commands.
- [OBD32 protocol analysis](https://github.com/emdzej/ediabasx-docs/blob/main/reference/interfaces/obd32-protocols.md): shows separate BMW DS2 and KWP physical settings. The present bridge still opens 9600 with default parity solely for USB port testing, **not a validated BMW serial configuration**. Third-party sources differ on line parity; choose hardware parameters only after verifying the actual K+DCAN chipset, adapter/20-pin path and the intended ECU/protocol.

## Release gates before claiming BMW cable diagnostics

1. Determine the actual USB chipset VID:PID and serial driver of the user's cable, and check any relevant connector/line bridging without assuming that a generic USB-to-OBD cable covers every BMW module.
2. Implement and test an *allowlisted, reviewed, read-only* DS2/KWP identity request/response layer for the specific ECU and selected hardware. Echo filtering, timeouts, checksum, protocol-specific framing, bounded TX, cancellation and epoch ownership must be verified independently.
3. Confirm an actual response from the correct physical ECU rather than a port open or echoed request. Only then advance the canonical VCI session and support module-specific read-only functions.
4. Run complete repository tests and Floot tests, inspect preview, then migrate compatible code into the **existing** Floot project. This draft GitHub branch is **not** live at `https://bmw.floot.app`.

No DTC erasure, coding, actuation or flashing is available through the passive cable route.
