# Hanna & Ada Diagnostics PRO — Desktop Architecture

Status: canonical desktop architecture for PR #35.

## Product shape

Hanna & Ada is one diagnostic product with three hosts:

```
                         CANONICAL DIAGNOSTIC CORE
                  session / evidence / DS2 / KWP / live
                               |
             +-----------------+------------------+
             |                 |                  |
        Desktop PRO         Android            Web
       Tauri 2 / Rust     Native USB Host   Browser fallback
       PRIMARY HOST       Mobile service      Limited host
             |
       Windows USB/serial
             |
          K+DCAN
```

The hosts do not maintain independent vehicle truth. One evidence contract decides whether transport, protocol and ECU identity are actually verified.

## Why Tauri 2

The current UI is already static HTML/CSS/JavaScript, so Tauri can embed the existing `public/` assets instead of creating another frontend.

The desktop host provides:
- normal installed application lifecycle;
- offline operation;
- native OS access behind explicit commands;
- Windows NSIS/MSI packaging;
- a small IPC contract instead of exposing raw system APIs.

## Native boundary

The frontend may ask for high-level diagnostic operations. It must never receive a generic command such as:
- execute arbitrary process;
- open arbitrary device path;
- write arbitrary serial bytes;
- access arbitrary files.

Current Tauri capability is intentionally only `core:default`.

The first commands are informational:
- `desktop_host_status`;
- `desktop_safety_policy`.

## Desktop transport plan

The future native transport must mirror the Android evidence ladder:

```
HOST_READY
→ USB_SERIAL_DETECTED
→ PORT_OPEN
→ PORT_CONFIGURED
→ ONE_READONLY_REQUEST_BOUND
→ RESPONSE_BOUNDED
→ FRAME_STRUCTURAL
→ RESPONSE_CORRELATED
→ MODULE_IDENTITY_CANDIDATE
→ ECU_VERIFIED (future gate)
```

No lower state implies a higher state.

## Offline-first rule

Core vehicle diagnosis must not depend on internet access.

Cloud services may later synchronize reports, backups or metadata, but loss of network cannot invalidate an active local diagnostic session.

## Windows packaging

The Tauri configuration targets both:
- `nsis` → setup executable;
- `msi` → Windows Installer package.

Release signing is a separate production gate and is not claimed by the current scaffold.

## Sources used for the desktop decision

- Tauri architecture: https://v2.tauri.app/concept/architecture/
- Calling Rust from frontend: https://v2.tauri.app/develop/calling-rust/
- Capabilities: https://v2.tauri.app/security/capabilities/
- Windows installer: https://v2.tauri.app/distribute/windows-installer/


## Native serial inventory

Desktop PRO now exposes a narrow `desktop_list_serial_ports` command backed by Rust `serialport::available_ports()`.

The IPC result is intentionally sanitized:
- port name;
- transport kind;
- USB VID/PID when available;
- manufacturer/product strings when available;
- a cautious USB-family candidate hint.

Explicitly excluded:
- USB serial number;
- raw serial handle;
- open/write capability;
- any ECU or BMW verification claim.

Known VID/PID values are hints only. They can label FTDI/CP210X/CH34X/PL2303 candidates but never prove a K+DCAN cable or ECU session.


## Candidate binding and epoch

Selecting a port does not open it.

Desktop PRO now binds one currently enumerated serial candidate into an in-memory coordinator:
- each bind increments a monotonic `epoch`;
- clearing the selection increments the epoch again;
- a port must exist in the current sanitized inventory before it can be bound;
- the bound snapshot always keeps `transportOpen=false`, `configured=false`, `ecuVerified=false` and `writesEnabled=false`.

This prevents a future native transport from inheriting evidence from an older cable selection or reconnect.
