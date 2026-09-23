# R36SX H.OS V1.2 as a wired BMW diagnostic terminal — evidence and decision gates

Status: feasibility research ONLY, 2026-09-18. No device test, USB detection, installation, vehicle communication or release has occurred.

## Owner's actual inventory and constraints

- R36SX, rear label model `R36SX`; visible system screen `R36sx-H.OS - V1.2`.
- Two USB-C sockets photographed, one labelled `DC` and one apparently `OTG`; a 3.5 mm jack.
- `TF1 OS` occupied by original firmware card; separate physical `TF2 GAME` slot; a spare microSD was inserted into TF2, but no visible change in the DOWNLOAD browser.
- DOWNLOAD shows `roms:` and `ARES.nes`, `BARESARK.nes`; it is a ROM browser, NOT evidence of program execution or TF2 detection.
- Owns INPA/ISTA USB interface, 20-pin BMW adapter and USB-A -> USB-C OTG converter. No card reader, computer, additional Bluetooth dongle, confirmed Wi-Fi or available budget. Do not ask again about already-owned items.
- User wants existing Hanna & Ada project, potentially a lightweight console build; first objective is proving standalone cable support WITHOUT connecting to the car.

## Verified external engineering evidence, NOT verified on this owner's device

1. Witali's R36SX/SF3000 reverse-engineering project reports Hichip HC16xx, MIPS 74Kc, ELF32 little-endian MIPS O32, Buildroot 2021.05-rc2 and ~42 MiB visible RAM. Source: https://github.com/Witali/r36sx_disasm . This is NOT an RK3326 ARM R36S/ArkOS handheld. Never flash R36S images.
2. The vendor game frontend `cubegm/rkgame` loads custom MIPS `.so` libretro-like cores, and the research project has run its own homebrew on an R36SX. Homebrew is plausible, not a drop-in iOS/Windows/INPA install. Source: https://github.com/Witali/r36sx_disasm/blob/main/FIRMWARE_FINDINGS.md .
3. The real boot route for the researched console goes through `cubegm/icube.sh`; modifying only `icube_start.sh` will not control cold boot. This is a *research reference* and not permission to edit the owner's stock card. Source: https://github.com/Witali/r36sx_disasm/blob/main/BOOT_ROUTE_FINDINGS.md .
4. Kernel research identifies vendor Linux 4.4.186-release and HC16xx MUSB strings. These DO NOT prove that host mode, usbserial, FTDI, CH341, CP210x or any particular INPA cable is supported in the owner's firmware. Source: https://github.com/Witali/r36sx_disasm/blob/main/LINUX_KERNEL_PORTING.md .
5. Hardware guides for the GB350 clone family caution that TF2 may be non-functional/fake, while ordinary ARM R36S has different TF2 behavior. This is a warning, not confirmed identification of THIS R36SX's TF2 wiring. Source: https://www.r36swiki.com/wiki-sdcard.html . Therefore stop treating TF2 as confirmed usable or advising formatting a card to fix an unobserved defect.

## Existing Hanna & Ada software reality

- `gateway/usb_kline.py` is a Python USB-serial gateway for a different host environment. It is not a MIPS handheld build and needs a real enumerated serial interface plus a supported vehicle protocol. Existing iOS CoreBluetooth code is not a cable driver.
- Running the web UI on Railway or storing logs in Supabase does NOT supply the handheld with USB host drivers, network connectivity, or a route for transferring files. GitHub can store sources and build artifacts, not physically install them on an offline console.
- If the console's USB-C port can enumerate the adapter, the first application must be a tiny self-contained MIPS read-only probe with local status, not full INPA/ISTA or a generic Android APK.

## Gates — stop at first unverified point

### Gate A: non-invasive transfer mechanism

Find and demonstrate ONE actual path from an accessible device to the owner's R36SX storage WITHOUT erasing or writing TF1, e.g. a verified USB mass-storage/device-mode interface, an already-working mounted TF2 readable by the stock system, or a borrowed reader/computer with a full RAW backup. The stock `DOWNLOAD` folder list alone does not meet this gate. The user currently has no reader/PC and stock console networking is unconfirmed. No claim that the transfer path exists yet.

### Gate B: unchanged stock boot / safe execution

With backup and recovery plan, demonstrate one minimal MIPS32 little-endian O32 hello-world homebrew through a documented stock launcher/core route, returning safely to the original UI. This step does not require the car or cable. Do NOT modify kernel/DTB/AVP, `icube.sh`, `rkgame`, or the OS card just to find out whether a slot exists.

### Gate C: USB without a car

Confirm port is actually USB host in this firmware; record USB vendor/product identifiers and serial chip (FTDI/CH340/CP210x/other), enumerate a tty device or prove a working userspace USB transport. The label OTG and an adapter fitting the socket are insufficient. Do not assume a driver is installed. Only then port a minimum *read-only* serial scanner to MIPS and gather logs without any vehicle attachment.

### Gate D: controlled automotive read-only validation

Only after A–C: stationary vehicle, qualified adult/mechanic for physical connections, identify interface/protocol and validate real ECU replies. Keep clear/erase, coding, actuator tests, flashing and tuning disabled. USB enumeration, ELM ATI, or BLE connected never means ECU verified.

## Immediate decision

No new cloud project, paid services, firmware replacement or purchase. Investigate an exact, usable transfer path first. Until Gate A is met we can research and compile off-device, but cannot honestly promise to install on this console. Existing Carista iPhone code remains a separate track; this console idea must not overwrite it.
