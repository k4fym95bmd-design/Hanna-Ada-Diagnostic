# Hanna & Ada Diagnostics PRO — Desktop Host

This folder is the native desktop host for the existing Hanna & Ada frontend and diagnostic core.

It is **not a second app**. Tauri embeds `../public` from the canonical repository and exposes only a very small native host contract.

## Product target

Primary desktop target: Windows laptop/workshop PC.

Distribution target:
- NSIS setup executable;
- MSI installer.

The diagnostic UI and evidence model remain shared with web/mobile. Native code owns operating-system access; the frontend never receives a raw arbitrary shell or filesystem API.

## Development

From this folder:

```
npm install
npm run dev
```

Production installer build on Windows:

```
npm run build
```

## Current native command surface

- `desktop_host_status`
- `desktop_safety_policy`

There is intentionally no native serial-write command yet.

## Security baseline

The main window receives only `core:default` Tauri capability. No shell plugin, filesystem plugin, arbitrary process execution or remote web origin is enabled.

Next native milestone: a narrow serial device inventory/open-close/configure/read-only receive API that reuses the canonical session/evidence contract.
