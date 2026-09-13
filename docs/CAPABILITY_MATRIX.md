# Capability Matrix

Hanna & Ada must resolve every function against the actual vehicle, ECU, adapter, transport and implementation status.

| Area | Carista BLE / iPhone | K+DCAN / Android | Status rule |
|---|---|---|---|
| Adapter identification | Yes, where BLE transport works | USB serial identification | SUPPORTED only after real adapter response |
| Generic OBD PID discovery | Yes | Yes if generic OBD stack is available | SUPPORTED |
| Generic live data | Standard Mode 01 PIDs | Standard Mode 01 PIDs | SUPPORTED per PID bitmap |
| Generic stored DTC | Mode 03 | Mode 03 | SUPPORTED |
| Pending DTC | Mode 07 | Mode 07 | SUPPORTED where ECU supports it |
| Permanent DTC | Mode 0A | Mode 0A | SUPPORTED where ECU supports it |
| Clear generic DTC | Explicit confirmation only | Explicit confirmation only | WRITE gate |
| BMW module scan | Not assumed | Target via K-Line/DS2/KWP | PROTOCOL REQUIRED until verified |
| DME/EGS expert jobs | Not assumed | Target | EXPERIMENTAL until verified on ECU family |
| Active tests | Not assumed | ECU/protocol dependent | HARDWARE/PROTOCOL REQUIRED |
| Adaptations | Not assumed | ECU/protocol dependent | WRITE gate |
| Coding | No generic claim | ECU/protocol dependent | WRITE gate + backup |
| Flash/recovery | No | Dedicated verified transport only | FLASH gate |
| Raw CAN sniffing | No generic claim | Not guaranteed by K+DCAN | HARDWARE REQUIRED for true passive monitor |
| ENET / DoIP | Separate hardware | Separate hardware | HARDWARE REQUIRED |
| J2534 | Separate hardware | Separate hardware | HARDWARE REQUIRED |

## User-facing states
- `SUPPORTED`
- `HARDWARE REQUIRED`
- `PROTOCOL REQUIRED`
- `NOT AVAILABLE FOR THIS VEHICLE`
- `EXPERIMENTAL`

## Rules
1. Never infer BMW-specific support because ATI returns an ELM version.
2. Never show a connected ECU state until a valid ECU response has been parsed.
3. Never expose write/coding/flash buttons solely because the screen exists.
4. Any simulated values must be marked `DEMO` and must never enter reports as measured values.
5. Vehicle profile and ECU identity take precedence over model-name assumptions.
