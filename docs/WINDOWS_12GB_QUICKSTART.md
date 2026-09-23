# Windows laptop quickstart — Hanna & Ada + K+DCAN

This is the fast local path for the new Windows laptop with 12 GB RAM.

## Goal

Run one Hanna & Ada web app plus one local K+DCAN gateway. The gateway enumerates USB serial devices, opens/closes the selected COM port, captures bounded passive RX, and exposes an atomic read-only snapshot. It does not expose raw transmit, DTC erase, coding, actuation or flash routes.

## One-command local start

From PowerShell in the repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-gateway.ps1
```

The script:
- requires Node.js 20+,
- installs npm dependencies when `node_modules` is absent,
- runs `gateway/windows-gateway-doctor.mjs`,
- generates a fresh 256-bit bridge token in memory,
- starts the Hanna & Ada web server on port 3000,
- starts the local bridge on port 8765,
- prints the token for the browser UI.

Default origin is `http://localhost:3000`, intended for the same Windows laptop.

## Cross-device mode

For iPhone/iPad or Android to reach the laptop bridge over LAN, the bridge requires HTTPS with a trusted certificate. Start with a non-loopback host and certificate paths:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-gateway.ps1 `
  -AllowedOrigin "https://bmw.floot.app" `
  -BridgeHost "0.0.0.0" `
  -TlsCert ".\certs\bridge.crt" `
  -TlsKey ".\certs\bridge.key"
```

Do not expose the bridge directly to the public internet. A private network/tailnet with HTTPS is preferred.

## Verification

```powershell
npm run doctor:windows
npm run test:release-critical
```

A 12 GB machine exceeds the project's 8 GB comfort threshold for the lightweight gateway + browser workflow. USB chipset/driver, cable VID:PID, selector wiring and BMW ECU identity remain separate runtime evidence.
