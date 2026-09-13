# K+DCAN / Android BMW Path

Android is the direct-USB BMW platform for Hanna & Ada. K+DCAN is a raw USB serial transport, not an ELM327 adapter, so the application must implement the BMW transport/protocol layer explicitly.

## Hardware requirements

- Android 11+ preferred, Android 13/14 target
- USB Host / OTG
- reliable USB-C host mode
- charge-while-host preferred for workshop use
- support for common USB serial chipsets such as FTDI, PL2303, CP210x, CH340/341 and CDC/ACM through an appropriate Android serial layer
- stable power and cable connection before any write/flash workflow

## BMW transport target

- ISO9141 / K-Line
- BMW DS2
- BMW KWP2000 / BMW-FAST where applicable
- D-CAN where supported by vehicle/interface

Protocol support is ECU and model-year dependent. The app must not assume every K+DCAN cable has the same chipset, pin routing or capabilities.

## E39 considerations

Some E39 years/modules may require different diagnostic connector routing, including pins 7/8 behavior and, on relevant vehicles, the under-hood 20-pin diagnostic connector. The application should surface this as a hardware/connection requirement rather than silently failing.

## Session pipeline

1. Detect USB device and serial chipset.
2. Request Android USB permission.
3. Open serial transport with verified parameters.
4. Identify vehicle transport and ECU address.
5. Execute a read-only identity/job probe.
6. Promote functions from `PROTOCOL REQUIRED` to `SUPPORTED` only after verified responses.
7. Keep write/coding/flash actions behind higher safety gates.

## BMW Expert target

- ECU list and addressing
- ECU identity
- fault memory and detailed faults
- status/analog values
- job explorer / Tool32-style job runner concepts
- active tests where verified
- adaptations and service procedures where verified
- coding only with backup and explicit confirmation

## Flash / recovery

Flash is a separate highest-risk capability. It requires ECU identity, exact software/hardware compatibility, stable voltage, stock backup, checksum/signature validation where applicable, dry-run/precheck, explicit confirmation, audit trail and a tested recovery route.

## Limitations

A K+DCAN interface is not automatically a passive CAN sniffer and must not be advertised as unrestricted raw CAN monitoring hardware. True passive CAN/advanced bus monitoring may require dedicated VCI hardware.
