# Exact cable target: K+DCAN USB Interface (INPA Compatible)

Target hardware is the exact generic switched cable shown in the user-supplied photo. The project now treats it as a first-class target, but **does not infer its internal chipset or switch wiring from appearance**.

## What the photo proves

- label: `K+DCAN USB Interface (INPA Compatible)`;
- USB cable + OBD diagnostic interface form factor;
- a physical two-position switch is present.

It does **not** prove FTDI/CH340/CP210x, it does not prove that one switch position bridges any specific pins, and it does not prove BMW ECU access.

## Implementation path for this cable

1. **Enumerate USB** on Windows and record VID:PID + manufacturer string.
2. **Choose the correct USB-serial driver** from actual VID:PID evidence.
3. **Open the COM port only** and confirm stable open/close/disconnect handling.
4. **Identify the E39 connector path**:
   - if the car has the round BMW 20-pin diagnostic connector, use a verified 20-pin ↔ OBD-II adapter for the legacy diagnostic path;
   - otherwise use the 16-pin path and verify which modules are actually reachable.
5. **Treat switch position A/B as unknown** until the exact cable is verified. The app stores a measured switch result instead of hard-coding a guess.
6. After the transport is stable, add a bounded **read-only BMW handshake** and require a real module identity before the UI can claim ECU verified.
7. Only after real-car read-only evidence: DTC read, live values and module inventory. Coding / erase / actuation / flash remain separate gated work.

## Acceptance gates

- Cable visible in Windows with concrete VID:PID.
- Correct driver loaded; no Device Manager warning.
- COM port opens and closes repeatedly without stale ownership.
- USB disconnect invalidates the session.
- Switch meaning recorded from evidence, not folklore.
- Correct physical connector/adapter for this E39 confirmed.
- One BMW module returns a reproducible identity in read-only mode.
- No write, coding or flash endpoint is exposed by the Hanna & Ada cable bridge.

## Next engineering step

Build the K+DCAN-specific Windows transport on top of the existing local bridge, then add a narrowly scoped read-only BMW identification request for the E39. Keep INPA/EDIABAS as the reference implementation for comparison on the same cable and car; Hanna & Ada must match real responses before expanding the feature set.
