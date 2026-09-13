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

The first `0100` response must contain a valid Mode 01 PID bitmap before the UI moves to ECU-connected state.

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
