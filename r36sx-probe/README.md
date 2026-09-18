# Hanna & Ada Diagnostics — R36SX native prototype 0.1

**Engineering prototype / NO INSTALL YET / no vehicle connection.**

This lightweight original C Libretro core uses 640×480 RGB565, button callbacks and the MIPS32 little-endian shared-library format seen in *a researched* R36SX/SF3000 H.OS firmware. It displays three status screens: system, hardware assumptions and explicit USB/ECU *not tested*. It does not access a USB port, serial device or car; does not erase/clear faults or modify files/firmware.

## Build and local verification

`make CC=clang` requires a Clang with MIPS target and LLD; outputs `libemu_hannaada.so`. On another host `make smoke` builds the same source as a host library and runs ABI/frame/input smoke assertions. Confirm the ELF with `readelf -h libemu_hannaada.so` (MIPS, little endian, shared object), and check `readelf -Ws` exports expected `retro_*` functions. A successful cross-build or smoke test does **not** validate operation on the owner's H.OS 1.2.

## Safe rollout gates

1. Confirm that the spare microSD is readable by the old phone and that R36SX can read that particular card/slot. Seeing existing NES files in DOWNLOAD does not prove TF2 works.
2. Safely back up the original TF1 system card in full, or identify a proven non-invasive loading path. No flashing, formatting TF1, overwriting vendor `rkgame`, `icube.sh`, `cores/config.xml`, or adding launcher overrides before a verified backup and recovery method.
3. After a safe loader is demonstrated, validate UI/buttons and return to the stock menu **without the car connected**.
4. Then develop a separate read-only USB enumeration probe and confirm host controller + VID/PID + kernel serial driver on the actual firmware. Only thereafter consider automotive read-only access with adult mechanic assistance.

**Do not copy this `.so` into a normal ROM folder and expect it to open.** The researched platform requires a compatible launcher/core configuration, which has not been validated or prepared for this user's stock OS. GitHub/Floot can compile/host files; neither can install them on an offline console.

Reference: upstream independently researched ABI/loader and homebrew examples: https://github.com/Witali/r36sx_disasm/tree/main/homebrew/libretro_button_demo . This is a new original prototype based on the documented libretro callback interface, not bundled vendor firmware or source files.
