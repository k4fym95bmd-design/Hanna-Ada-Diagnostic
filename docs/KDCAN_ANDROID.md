# K+DCAN / Android BMW Path

**Specific user tablet, Lenovo TAB3 7 Essential TB3-710F (ZA0R0040GB): see [`TB3_710F_USB_FEASIBILITY.md`](TB3_710F_USB_FEASIBILITY.md). USB host/OTG and cable chipset are not verified. Its original Android 5.0 is below the current Capacitor 8 minimum Android 7.0; do not promise an installable native build or spend a native build on this target without confirming platform support. The existing Floot PWA does not have a raw USB K+DCAN transport.**

Android is the prospective direct-USB BMW platform for Hanna & Ada, not a validated hardware route. K+DCAN is a raw USB serial transport, not an ELM327 adapter, so the application must implement the BMW transport/protocol layer explicitly.

## Hardware requirements

- Android 11+ preferred, Android 13/14 target; check the selected Capacitor version's **actual minimum SDK** before building for any older device.
- USB Host / OTG, *verified on the exact tablet* by enumeration; the Android version and micro-USB connector alone cannot prove it.
- reliable USB host port (USB-C on newer target tablets; existing TB3-710F has micro-USB for charge/data, with OTG unverified)
- charge-while-host preferred for workshop use, but not assumed
- support for common USB serial chipsets such as FTDI, PL2303, CP210x, CH340/341 and CDC/ACM through an appropriate Android serial layer after identifying the actual cable
- stable power and cable connection before any vehicle protocol work

## BMW transport target

- ISO9141 / K-Line
- BMW DS2
- BMW KWP2000 / BMW-FAST where applicable
- D-CAN where supported by vehicle/interface

Protocol support is ECU and model-year dependent. The app must not assume every K+DCAN cable has the same chipset, pin routing or capabilities.

## E39 considerations

Some E39 years/modules may require different diagnostic connector routing, including pins 7/8 behavior and, on relevant vehicles, the under-hood 20-pin diagnostic connector. The application should surface this as a hardware/connection requirement rather than silently failing.

## Session pipeline

1. Detect actual tablet USB host capability and enumerate USB device (no vehicle command).
2. Identify attached device and serial chipset; request Android USB permission.
3. Open serial transport with verified parameters.
4. Identify vehicle transport and ECU address through a validated **read-only** protocol implementation.
5. Execute a read-only identity/job probe.
6. Promote functions from `PROTOCOL REQUIRED` to `SUPPORTED` only after verified responses.
7. Keep write/coding/flash actions disabled in the present unvalidated application.

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

Flash is a separate highest-risk capability and **not implemented/enabled** in the current unvalidated app. It requires independent engineering, ECU identity, exact software/hardware compatibility, stable voltage, stock backup, checksum/signature validation where applicable, dry-run/precheck, explicit confirmation, audit trail and a tested recovery route.

## Limitations

A K+DCAN interface is not automatically a passive CAN sniffer and must not be advertised as unrestricted raw CAN monitoring hardware. True passive CAN/advanced bus monitoring may require dedicated VCI hardware. A remotely hosted web app cannot directly see a physical USB port on a tablet.
