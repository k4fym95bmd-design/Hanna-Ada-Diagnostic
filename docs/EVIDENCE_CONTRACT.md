# Unified evidence contract

Hanna & Ada uses one stage vocabulary across Windows, Android, iOS and the browser UI.

Version: **1**

`NO_CABLE -> USB_SEEN -> HARDWARE_BOUND -> PORT_OPEN -> RX_ACTIVITY -> FRAME_CANDIDATE -> READ_ONLY_IDENTITY_VERIFIED`

## Hard rule

Generic transport code is allowed to advance only through `FRAME_CANDIDATE`.

`READ_ONLY_IDENTITY_VERIFIED` is reserved for a future dedicated local read-only identity validator that correlates a fresh response to the same physical hardware binding, session and request epoch. Browser state, VID:PID, COM path, an open serial port, passive bytes or checksum-valid DS2/KWP frames cannot reach that state.

Any disconnect, hardware identity drift, session expiry, serial error or loss of required USB identity resets evidence instead of carrying it into a new session.

## Platform semantics

- **Windows bridge:** `USB_SEEN` requires enumeration of the selected device. `HARDWARE_BOUND` requires a session-bound USB identity. `PORT_OPEN` requires the same bound device to remain present while the local serial port is open.
- **Android native USB Host:** the same vocabulary is used, but transport evidence must come from the local Android USB stack and current session.
- **iOS ExternalAccessory:** seeing an `EAAccessory` is **not** treated as `USB_SEEN`. ExternalAccessory does not by itself prove that the observed accessory is this K+DCAN USB-serial adapter or that iOS exposes a compatible serial transport. The canonical USB evidence stage therefore remains `NO_CABLE` until transport-specific local proof exists.
- **Browser/WebUSB/WebSerial:** permission, VID:PID, or an open browser port are transport evidence only and never ECU identity evidence.

All stages keep write, erase, coding, actuation and flash capability disabled.
