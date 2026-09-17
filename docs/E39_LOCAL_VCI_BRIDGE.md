# E39 iPhone local VCI bridge (design / not vehicle verified)

## What software can and cannot bypass

The iPhone app can expose a transport *port*, but a software port cannot create the missing vehicle-side electrical interface, K-line pin routing, or BMW DS2/KWP timing support. A generic ELM327 response to `0100` proves only emissions OBD, **not** that DME extended, EGS, DSC, IKE, LCM, GM/ZKE, EWS, or IHKA have been addressed.

The project must never unlock ECUs because a module exists in a profile, a Bluetooth link is active, `ATDP` says ISO 9141-2, or an adapter brand claims BMW support.

## Practical architecture without a Windows laptop

```text
BMW E39 diagnostic port (20-pin round on relevant early cars; 16-pin on later cars)
    -> verified BMW K-line / DS2-capable physical interface (for example FTDI K+DCAN in K-line mode)
    -> LOCAL gateway host with USB host support (Pi/Android host, not a cloud server)
    -> authenticated local Wi-Fi transport
    -> Hanna & Ada native iOS application
    -> verified read-only BMW ECU identity before marking any module online
```

The host/gateway is not optional for a USB-only FTDI device when the phone cannot directly access its serial driver. A Pi Zero 2 W-class SBC can host a USB serial driver; a compatible Android device with USB OTG is another prospective implementation. This does **not** make a cable connect to the iPhone without the gateway.

An alternative is a purpose-built BLE/Wi-Fi VCI with proven BMW DS2 support and documented application protocol. Carista EVO's BMW K-line features within its own app do not establish third-party raw DS2 protocol availability. OBDLink CX is BLE, **not** a Lightning cable; generic ISO9141 does not prove DS2 module access.

## Vehicle connector selection

BMW's 2001 model-year training material states that E39s built from September 2000 dropped the round 20-pin engine-bay diagnostic connector. Earlier dual-port E39s generally have limited access through the interior 16-pin emissions connector, so the correct under-hood connector and quality 20-to-16-pin adapter may be needed. Identify actual car production date and connector before buying/wiring. Do NOT recommend ad hoc shorting or modifying OBD pins without verified diagram and protection.

Source: BMW training document https://www.shiftbmw.com/wp-content/uploads/2022/11/10-p1-Engine-Management-Sys-Internet-1.pdf .

## Contract for the gateway port (v1 design)

- Device discovery/pairing, unique session ID, authentication and exclusive vehicle bus lock.
- `transport.open` reports USB chipset, routing, supported physical line, firmware version, voltage source and capabilities. All unverified capabilities are false.
- `ecu.probe` performs one *explicitly reviewed, read-only* identity query with ECU- and vehicle-specific timeouts. Only a parsed positive reply from the intended ECU changes the module state to ONLINE.
- `transport.close` stops reads and releases the bus. Disconnection invalidates all live values.
- Raw TX/RX logs and errors with monotonic timestamps, command IDs, timeouts and no synthesized readings.
- No arbitrary raw network-to-bus write endpoint in the initial gateway. Coding, active tests, reset and flashing stay disabled until protocol implementation, safeguards and vehicle testing exist.
- Local transport should use mutually authenticated/encrypted connection or explicit on-device pairing. Do not expose a serial bridge on a public IP or deploy vehicle I/O to Railway/Netlify: cloud hosting has no access to the car's physical port.
- The HTTPS website cannot simply open insecure `ws://` on a LAN; native iOS transport or correctly configured WSS/TLS is required. Apple documentation: https://developer.apple.com/documentation/Security/preventing-insecure-network-connections .

## Implementation sequence

1. Confirm the car's build date / under-hood 20-pin presence and physically inspect cable specifications, connector routing and FTDI authenticity.
2. Implement and test a local gateway transport using a *fake serial interface* (no vehicle commands) and iOS client handshake/authentication.
3. Integrate an appropriately licensed BMW DS2/KWP implementation, not an ELM ASCII command parser. Validate module read-only identities independently on the actual E39; check third-party source licenses before copying code.
4. Unlock the corresponding UI module **individually** only after genuine validated replies; keep all write operations blocked during the initial release.

References: https://github.com/uholeschak/ediabaslib/blob/master/docs/AdapterTypes.md and https://github.com/uholeschak/ediabaslib/blob/master/docs/Replacement_firmware_for_ELM327.md .

## Current status

DESIGN ONLY. No hardware connection, ECU scan, or production deployment is claimed by this file. The normal Carista generic OBD path remains operational and separate.
