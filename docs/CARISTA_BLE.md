# Carista BLE / iPhone Companion

Carista BLE is the iPhone-friendly generic OBD-II companion path in Hanna & Ada. It is not treated as a full BMW E39 diagnostic interface unless BMW-specific transport support is independently proven.

## Connection state machine

`DISCONNECTED → BLE → ADAPTER → ECU`

A session is considered ECU-ready only after a valid vehicle response is parsed. An `ATI` response alone confirms adapter communication, not vehicle communication.

## ELM initialization

Recommended initialization sequence:

- `ATZ`
- `ATE0`
- `ATL0`
- `ATS0`
- `ATH0`
- `ATAT1`
- `ATSTFF`
- `ATSP0`
- `ATI`
- `0100`
- `ATDP`

The first `0100` response must contain at least one valid Mode 01 supported-PID bitmap before the UI moves to ECU-connected state.

### Multi-ECU `0100` handling

A valid vehicle may return more than one `41 00` response to a single `0100` request because multiple ECUs can answer the functional OBD-II query. The parser must therefore accept one or more valid `41 00` frames rather than treating multiple replies as ambiguous.

For supported PIDs 01–20:

- every `41 00` frame used must contain at least four bitmap payload bytes;
- the four-byte bitmaps from all valid `41 00` replies are combined with bitwise OR (set union);
- command echo `0100`, `SEARCHING...`, headers/addresses, and unrelated otherwise-valid frames are ignored;
- `NO DATA`, `ERROR`, `UNABLE TO CONNECT`, truncated `41 00`, or the absence of any valid `41 00` still fails verification;
- the stricter single-response behavior for ordinary live PID reads remains unchanged;
- when `0100` verification fails, the diagnostic error includes the raw `0100` adapter response so the next vehicle test exposes the actual transport reply.

Regression coverage includes a single `41 00`, two valid `41 00` replies, echo plus two replies, and truncated/missing valid replies.

## Generic OBD-II scope

- supported PID discovery
- Mode 01 live data
- Mode 03 stored DTC
- Mode 07 pending DTC
- Mode 0A permanent DTC where supported
- Mode 04 clear only after explicit confirmation
- RAW TX/RX transcript
- explicit parsing of `NO DATA`, `UNABLE TO CONNECT`, bus-init errors and other adapter states

Target live values include RPM, coolant temperature, intake-air temperature, MAF, throttle, STFT and LTFT where declared by the ECU.

## iPhone browser path

Safari does not itself provide the Web Bluetooth path used by this prototype. A compatible Web Bluetooth browser/extension may be required. Compatibility with the specific Carista adapter must be verified at the vehicle.

## Safety and truthfulness

1. Never label the ECU connected because Bluetooth connected.
2. Never infer BMW K-Line access from `ELM327 v1.5` or another ATI string.
3. Preserve the RAW transcript for diagnosis of adapter/protocol failures.
4. Never synthesize sensor values when the ECU returns no data.
5. Generic OBD clear/write actions require explicit user confirmation.
