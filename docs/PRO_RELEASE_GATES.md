# Hanna & Ada Diagnostics PRO — Release Gates

A build is not called PRO-ready because it opens a window or finds a COM port.

## Gate A — Desktop host

Required:
- Tauri desktop app builds on Windows;
- existing `public/` UI is embedded locally;
- browser fallback still works;
- host contract tests pass;
- no arbitrary shell/filesystem capability exposed.

## Gate B — Physical transport

Required:
- deterministic USB-serial inventory;
- exact device identity evidence;
- exclusive open/close ownership;
- reconnect creates a new epoch;
- static serial configuration is explicit;
- disconnect purges all request evidence.

## Gate C — Read-only protocol

Required:
- one request outstanding maximum;
- hard timeout and response-size limits;
- echo rejection;
- DS2/KWP structural validation;
- request/response correlation;
- no generic raw-TX endpoint.

## Gate D — ECU evidence

Required:
- reproducible response from the actual module;
- module identity tied to current physical session;
- repeat test after reconnect;
- stale responses cannot promote state.

Only then may UI display `ECU_VERIFIED`.

## Gate E — Workshop quality

Required:
- offline operation;
- deterministic error states;
- redacted logs;
- crash/restart does not restore stale ECU state;
- installer upgrade/uninstall test;
- signed Windows release build before public distribution.

## Locked capabilities

Until separate future validation:
- DTC erase: locked;
- coding: locked;
- actuation: locked;
- flash/programming: locked.

The release process must not silently unlock them.
