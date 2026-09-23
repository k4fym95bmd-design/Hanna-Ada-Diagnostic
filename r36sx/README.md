# Hanna & Ada — R36SX experimental probe

This is an **experimental, read-only, text-output MIPS32 little-endian program**, not a diagnostic application or firmware/ROM. It does not talk to the car or open a serial port. It prints observed CPU information, USB VID/PID entries from sysfs and USB serial device node names. A device being listed is **not** proof of an INPA cable, compatible driver, host mode or BMW ECU communication.

## Current state

- Source: `r36sx/probe.c`.
- Automated cross-build: `.github/workflows/r36sx-probe.yml`; after a **successful** workflow run, download `hanna-ada-r36sx-experimental-probe` from that run's GitHub Actions artifacts. The included `SHA256SUMS` checks that the binary copied to another device is unchanged.
- Builds a static ELF32 little-endian MIPS32r2 executable (`hanna-ada-r36sx-probe.mipsel`). Host and QEMU smoke tests are not tests on the owner's H.OS V1.2 console.
- **No known stock H.OS app launch method has yet been validated for the owner's device.** This CLI prints to stdout; it does not draw on the console's display. It cannot be launched by renaming it to `.nes` or simply dropping it in `roms`.
- The original `TF1 OS` card must not be overwritten, formatted or used for trial-and-error firmware changes. `TF2 GAME` is not confirmed functional on this model.

## Transfer route (old Android phone)

A phone with a microSD slot can be used to download an artifact through an authenticated GitHub session and copy it to the **spare** microSD, provided its file manager actually shows and can write that card. This proves only file transfer to the spare card, not that R36SX mounts TF2 or runs the file. If the phone requests formatting and the card contains important files, stop. Do not transfer a binary to TF1 before a full verified card backup and a reversible launch procedure exist.

## Strict readiness gates

1. Transfer route and stock-safe launcher verified with independently documented device-specific evidence.
2. A test executable has an observable output route on the actual console (e.g. an approved homebrew display bridge or a safe output capture); do not replace `rkgame`, `icube`, startup scripts, DTB, firmware or game cores without backup/recovery.
3. Verify actual USB host enumeration and serial driver separately **without connecting a car**. This probe does not open or identify chip protocols.
4. Only then design a separate BMW-specific read-only transport test in a stationary vehicle under qualified adult/mechanic supervision. No writing, coding, active tests, ECU flashing, tuning or DTC erasure.

**Relevant research:** `docs/R36SX_HOS12_FEASIBILITY.md` (PR #9) and upstream [Witali/r36sx_disasm](https://github.com/Witali/r36sx_disasm). Do not use R36S/ArkOS ARM firmware on this MIPS R36SX.
