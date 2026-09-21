# Lenovo TB3-710F (ZA0R0040GB) — Android USB cable feasibility

Status: **HARDWARE UNVERIFIED; NO DIRECT USB VEHICLE CONNECTION IN HANNA & ADA YET**. Updated 2026-09-21. This is an evidence-gated feasibility track for the **existing** Hanna & Ada project, not a second app or session.

## Identified hardware and incompatible assumptions

- The tablet's photographed sales SKU `ZA0R0040GB` identifies a Lenovo TAB3 7 Essential / TB3-710F Wi-Fi. Never copy the photographed device serial number into issues, telemetry or reports.
- Lenovo's product overview/PSREF list Android 5.0, MT8127 quad core, 1 GB RAM, 7-inch 1024×600 screen, Bluetooth 4.0 and a **micro-USB 2.0 port for charging/data sync**. They do **not** positively establish USB host/OTG operation for this SKU. Retail listings conflict; do not claim host support or purchase compatibility from a connector's shape alone.
- Chrome displaying the Floot React markup without styles on the user's photographed tablet is a **web compatibility issue**; solving CSS does not grant USB host, serial driver, or BMW protocol support.
- A current Capacitor 8 app requires **Android 7.0/API 24**; the default Floot mobile build cannot be assumed installable on Android 5.0/API 21. Do not burn one of two monthly native builds merely to test this incompatible target.
- Android's USB host API exists since Android 3.1, but an individual tablet must actually implement `android.hardware.usb.host`, provide host-mode hardware and enumerate attached devices. The host feature is a mandatory gate, not a promise based on Android version alone.

## Shortest safe zero-purchase discrimination test — NOT on the car

1. Inspect Settings > About tablet for the actual Android version and model; confirm the micro-USB socket's physical condition. Photograph the **existing diagnostic cable's connector(s) and printed chipset/model**, not a serial number or any secrets; do not assume it is K+DCAN, ELM327, or Carista from an incomplete picture.
2. Only if the user already has a known-working micro-USB OTG adapter and a low-power USB flash drive, test the flash drive with the tablet and check whether Android's file manager detects it. Compare with the same drive on a known-working USB host if ambiguous. Failure is inconclusive (adapter/power/port/software could be responsible); success is positive evidence of some host operation, **not** a car-cable or protocol test. Do not buy parts solely for this unverified tablet.
3. For the Android app itself, a small native **read-only USB-enumeration-only probe** may check `PackageManager.FEATURE_USB_HOST`, list devices using `UsbManager.deviceList` and show VID:PID/interface descriptors, with user-approved Android USB permission. Do not implement or invoke ECU commands before those results and the cable chipset are known. A website or generic Chrome shortcut is not this native probe.
4. Decide by results: **no USB host** → this tablet cannot directly control a USB K+DCAN cable through an OTG adapter; preserve it as a display/report viewer or use a separate capable USB host (not cloud hosting) if warranted. **USB host proven** → choose and test the cable's actual FTDI/CP210x/CH340/PL2303/etc. driver; `mik3y/usb-serial-for-android` is a candidate for these chipsets, not a guarantee. **USB device enumerates but serial fails** → record error/driver VID:PID/power, do not present the ECU as connected.
5. Only after a working native serial session and properly validated physical adapter/connector path may the independent BMW K-line/DS2/KWP reader be considered. Generic ELM commands do not turn a raw K+DCAN serial adapter into an ELM327. The E39 1999 round under-hood 20-pin access is a separate vehicle-specific hardware question. Continue **read-only**; no fault clearing, actuator operations, coding or flashing.

## Software architecture / implementation acceptance gates

- Keep one canonical diagnostic vehicle/session state. A native Android USB transport should implement a well-defined read-only byte-stream abstraction and report explicit steps: OS host capability → USB enumeration → Android permission → serial chip/port open → vehicle protocol identity → validated ECU read; each stage begins unverified and is never inferred from an earlier stage.
- For the first proof of hardware, log only non-sensitive model/API level, host feature present, device VID:PID and local error codes. Do not auto-upload raw ECU replies, VIN, device serials or user identifiers; obtain explicit review before any sharing.
- Do not route raw USB via Floot, Netlify, Supabase, Railway or any remote server: web hosting has no physical access to the tablet's USB port. Chrome WebUSB / Web Serial polyfills require actual host support and a modern compatible browser; they are not the dependable path on Android 5.0.
- Do not enable an Android USB route in Floot's capability map until a separately built native bridge provides authenticated, permissioned and actually observed read-only serial evidence. The current Floot PWA's Carista BLE route remains separate.
- Tests: simulated host feature `false` must block, empty USB list must block, permission denied must block, unrecognized chipset must block, disconnect invalidates session, and a raw K+DCAN device must **never** be classified as a generic ELM adapter. An offline test pass is not evidence of successful vehicle communication.

## Evidence references (checked 2026-09-21)

- Lenovo support model ZA0R / TB3-710F: https://pcsupport.lenovo.com/ng/en/products/tablets/a-series/tab3-7-essential/za0r/document-userguide/doc_userguide
- Lenovo platform spec, micro-USB charge/data, Android 5.0 and 1 GB: https://psref.lenovo.com/syspool/Sys/PDF/Lenovo_Tablets/TAB3_7_Essential/TAB3_7_Essential_Spec.PDF
- SKU identification: https://www.laptopsdirect.co.uk/a7-10-7-inch-mt8127-1gb-16gb-emmc-android-5.0-za0r0040gb/version.asp
- Android USB host requirement/enumeration/permission: https://developer.android.com/develop/connectivity/usb/host
- Current Capacitor platform version requirements: https://capacitorjs.com/docs/main/reference/support-policy
- USB serial Android supported chip families: https://github.com/mik3y/usb-serial-for-android
- Existing project route architecture: `docs/KDCAN_ANDROID.md`, `docs/E39_1999_20PIN_CHECKLIST.md`, `docs/FLOOT_TRANSFER_PLAN.md`.
