# Android-first K+DCAN route — no Windows required

## Confirmed reference path

Public EdiabasLib / Deep OBD documentation states that Android can use standard **FTDI-based USB "INPA compatible" D-CAN/K-Line adapters**. Its adapter matrix explicitly lists **BMW-DS2** support for E39 and states that DS2 vehicles require a **pin 7+8 connection** in the adapter path.

That gives Hanna & Ada a practical no-Windows reference architecture:

```
Android phone/tablet
  → USB OTG / USB Host
  → switched K+DCAN USB Interface (INPA Compatible)
  → native USB-serial driver
  → verified pin 7↔8 / switch route
  → if present: verified BMW 20-pin ↔ OBD-II adapter
  → E39 BMW-DS2 / K-Line
  → Hanna & Ada read-only transport
```

## What we trust and what we do not

The photo confirms the switched K+DCAN/INPA form factor and visible label. It does **not** confirm the internal chipset.

Therefore:
- FTDI is the **reference candidate**, not a photo-verified fact.
- CP210x / CH34x / PL2303 remain possible raw USB-serial families.
- ATmega / PLD internals are not treated as facts without PCB or USB evidence.
- Left/right switch meaning is not hard-coded.
- A real ECU response is required before the app may say BMW/ECU verified.

## Clean implementation boundary

EdiabasLib is GPL-3.0. Hanna & Ada should use it as a **reference harness and protocol evidence source**, not by pasting its source into this repository.

For the native Android serial layer, the project can use the MIT-licensed **usb-serial-for-android** library. It supports FTDI FT232-family, CP210x, CH340/CH341 and PL2303 without requiring kernel drivers or root.

## Hardware-first validation sequence

1. Android confirms USB Host/OTG.
2. The cable enumerates and exposes VID:PID.
3. The native USB-serial layer identifies a driver family.
4. The serial port opens/closes repeatedly and survives reconnects.
5. The switch / pin 7↔8 route is verified on the actual cable.
6. If this E39 has the engine-bay round 20-pin socket, verify the 20-pin adapter mapping.
7. Only then permit a bounded **read-only BMW-DS2/K-Line identification probe**.
8. Require a reproducible ECU/module identity before enabling DTC/live-data reads.
9. Erase, coding, actuation and flash remain locked.

## Fastest real-world benchmark

Use Deep OBD on Android as an independent test harness for the same cable and car. If it can identify E39 modules through the FTDI-style K+DCAN route, Hanna & Ada has a known-good hardware baseline to reproduce clean-room.

## Current project files

- `public/android-usb-readiness.js`: Android USB Host / permission / driver evidence gate.
- `public/android-kdcan-route.js`: no-Windows K+DCAN → E39 route policy.
- `public/kdcan-cable-profile.js`: exact photographed cable family.
- `gateway/kdcan-readonly-session.mjs`: binds the physical cable to one fail-closed session.
- `test/android-kdcan-route.mjs`: regression gates for the Android route.
