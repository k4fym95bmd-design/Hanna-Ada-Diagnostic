# User cable profile — K+DCAN USB Interface (INPA Compatible)

## Visual evidence from the supplied cable photo

The photographed adapter is labeled **K+DCAN USB Interface (INPA Compatible)** and has a visible two-position selector switch.

Those are the only hardware facts treated as verified by appearance. The transparent housing and label do **not** prove the internal USB-to-serial chipset, driver, firmware, switch wiring, BMW protocol support or ECU access.

## What Hanna & Ada now does specifically for this cable

- `public/kdcan-cable-profile.js` stores the exact visible cable label and the fact that a two-position selector exists.
- `public/kdcan-cable-panel.js` adds a card for this cable inside the existing VCI workbench.
- The Windows bridge already returns USB `vendorId` / `productId`; the workbench now preserves those IDs in the selected port option so the cable card can show a chipset-family **hint**.
- The user can record selector position as **position 1**, **position 2**, or **unknown**. Hanna & Ada deliberately does not assign a BMW wiring meaning to either position until the exact adapter is verified.
- `test/kdcan-cable-profile.mjs` prevents VID:PID, label, open USB port or selector position from being treated as ECU verification.\n- `gateway/kdcan-readonly-session.mjs` now binds one observed USB identity to exactly one local session. A different VID:PID, changed port path, stale session ID or expired TTL cannot silently replace the active cable.\n- `test/kdcan-readonly-session.mjs` verifies that port-open state still never implies BMW protocol or ECU identity.

## Evidence ladder for this exact cable

1. Photo label recognized -> cable family hint only.
2. Windows enumerates the USB device -> USB device detected.
3. VID:PID matches a common USB-serial family -> driver/chipset hint only.
4. Serial port opens -> transport port opened.
5. Passive bytes / checksum-valid frame -> still not proof of ECU identity.
6. Matched read-only response from the current session -> only then may a specific module become verified.

At every earlier stage `ecuVerified=false`, `writesEnabled=false`, and `flashEnabled=false`.

## Deliberately not assumed

- No assumption that this unit contains FTDI, CP210x, CH340 or another specific chip from its case.
- No assumption about the electrical meaning of the selector switch.
- No assumption that a generic K+DCAN label guarantees old BMW K-Line/DS2/KWP access.
- No arbitrary raw transmit route, DTC erase, coding, actuator control or flashing.

## Next engineering gate

Capture the actual USB VID:PID and OS driver from this physical adapter through the existing workbench. The single-session USB binding is now implemented; the remaining gap is the verified OS driver plus a real read-only BMW response tied to that same session. Only after a real read-only ECU transcript is available should the protocol-specific identity layer advance the BMW module state.

## Bridge binding now implemented

The Windows bridge now exposes a session-scoped `cableBinding` when the opened COM port has a usable USB VID:PID. The binding is tied to the same bridge session ID and the observed USB identity. If the same COM path suddenly reports a different VID:PID, Hanna & Ada drops the cable binding instead of silently trusting the replacement device. The port can remain physically open while BMW protocol and ECU identity stay unverified.

This still does not create any transmit route. `POST /v1/transmit` remains absent, and the bridge continues to expose only USB enumeration/open/close plus bounded passive RX.
