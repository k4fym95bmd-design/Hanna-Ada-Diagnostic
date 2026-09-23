# Unified evidence contract

Hanna & Ada uses one stage vocabulary across Windows, Android, iOS and the browser UI.

Version: **1**

`NO_CABLE -> USB_SEEN -> HARDWARE_BOUND -> PORT_OPEN -> RX_ACTIVITY -> FRAME_CANDIDATE -> READ_ONLY_IDENTITY_VERIFIED`

## Hard rule

Generic transport code is allowed to advance only through `FRAME_CANDIDATE`.

`READ_ONLY_IDENTITY_VERIFIED` is reserved for a future dedicated local read-only identity validator that correlates a fresh response to the same physical hardware binding, session and request epoch. Browser state, VID:PID, COM path, an open serial port, passive bytes or checksum-valid DS2/KWP frames cannot reach that state.

Any disconnect, hardware identity drift, session expiry, serial error or loss of required USB identity resets evidence instead of carrying it into a new session.

All stages keep write, erase, coding, actuation and flash capability disabled.
