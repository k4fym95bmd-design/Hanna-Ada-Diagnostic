# Android physical USB session bridge v0.6

`AndroidKdcanUsbBridge` is the first component in Hanna & Ada that binds the real Android USB stack to the fail-closed K+DCAN session controller.

## What it does

1. Requires Android USB permission.
2. Finds a supported USB-serial driver.
3. Requires exactly one serial port.
4. Creates a fresh logical session + epoch.
5. Opens the real `UsbDeviceConnection` and `UsbSerialPort`.
6. Marks the transport session as `PORT_OPEN`.
7. On close, detach, lifecycle destruction or any open failure, closes handles and invalidates the session.

## What it deliberately does not do

- no `setParameters()`;
- no baud-rate choice;
- no read;
- no write;
- no BMW/ELM/INPA/EDIABAS command;
- no DS2/KWP request;
- no ECU verification;
- no DTC erase/coding/actuation/flash.

This separates **physical transport proof** from **vehicle protocol proof**.

## Fail-closed rules

- permission missing → no session;
- driver missing → no session;
- zero or multiple serial ports → no session;
- failed Android device open → session invalidated;
- failed serial-port open → handles closed + session invalidated;
- USB detach → handles closed + session invalidated;
- Activity destroy → handles closed + session invalidated;
- successful open test is immediately closed and invalidated in the current UI.

A future read-only BMW transport must reuse this bridge/session boundary instead of opening a second independent port.
