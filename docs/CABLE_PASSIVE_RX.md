# Hanna & Ada — physical cable receive path (draft, DS2 + KWP2000)

## Existing app, one COM port, two passive parsers

The existing VCI page exposes `ODCZYTAJ PASYWNY RX` on the Windows bridge tab (`public/cable-rx-panel.js`). It uses the current bridge URL and token to call the atomic `GET /v1/snapshot` endpoint. `gateway/windows-cable-bridge.mjs` attaches exactly **one** receive listener per open serial port using `attachPassiveRx`; the listener now feeds independent DS2 and KWP2000 decoders without a second port, vehicle session or database.

The response includes `frames` (DS2 candidates), `kwpFrames` (KWP candidates), bounded counts and the current bridge session ID. The snapshot contains status and passive RX from one server-side capture, eliminating the former `/v1/rx` + `/v1/status` race. Both decoders reset on close/disconnect, retain at most 16 frames each, reject malformed or oversized input, and never set `ecuVerified` true. The KWP parser checks format `B8 destination source payloadLength payload XOR`; a `possible-reply`/`possible-echo` label is **heuristic only**.

## Important finding for this BMW V8

The external [pBmwScanner E38/E39 project](https://github.com/gigijoe/pBmwScanner) lists Bosch **ME7.2 / M62TU** as tested and routes that ECU through its `KWP2000` class (`me72.py`, not `DS2`). See [reference me72.py](https://github.com/gigijoe/pBmwScanner/blob/master/me72.py), [reference kwp2000.py](https://github.com/gigijoe/pBmwScanner/blob/master/kwp2000.py), and [K-line settings](https://github.com/gigijoe/pBmwScanner/blob/master/k_line.py). This is evidence about the reference implementation, **not proof** of the ECU, USB chipset or protocol in this particular car. Its known example response `B8 F1 12 05 62 40 07 01 90 EA` is included as a fixture; no live response was captured from the user's car.

The DS2-only path in the prior version could not decode this KWP framing. It remains for other modules and as a separately labeled candidate, not a fallback that automatically marks the DME online. A passively received KWP packet may be a local echo or other data; no request/response identity correlation exists yet.

## Strict limitations

- The existing bridge does **not transmit** any vehicle request or enable ECU commands, DTC clearing, coding, actuation, tuning or flashing. `POST /v1/transmit` returns 404. Opening a USB port or seeing a checksum-valid frame does not verify the ECU.
- Hardware serial configuration is still a **port-opening test** (`9600`, Node SerialPort defaults); not a validated BMW KWP/DS2 configuration. Technical sources disagree on parity (including 8N1 vs 8E1). A reviewed implementation must independently establish the actual USB chipset, physical interface, correct K-line connection, ECU type, parity, initialization and timing. Do not infer these from the model year or a VID:PID alone.
- The Windows bridge must run locally. LAN access requires trusted HTTPS and token/Origin checks. Never deploy the bridge to cloud hosting or log raw diagnostic payloads/tokens.
- `GET /v1/snapshot` reads current in-memory samples only when the user taps; passive receive can correctly produce zero bytes without prior ECU requests.
- GitHub draft PR #35 is **not** the published Floot app. Do not claim cable operation on `bmw.floot.app` until the existing Floot project is updated and checked.

## Next release gate

Implement a single **allowlisted read-only KWP2000 identification request** only after exact hardware/ECU settings and physical protocol behavior are validated. The response gate must reject echo, mismatched source/destination, malformed checksum, negative responses, timeouts and stale session epochs; a genuine ECU identification must be parsed from matched response bytes. Test code alone does not substitute for an actual hardware transcript. Preserve one canonical Floot session and keep all write operations locked.
