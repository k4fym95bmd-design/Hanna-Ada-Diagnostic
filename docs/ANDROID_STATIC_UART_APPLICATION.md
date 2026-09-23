# Static UART configuration application

The Android physical bridge can now apply a previously verified legacy serial plan to the already-open USB serial port.

## Applied settings

Only evidence-backed static UART settings are applied:
- baud rate from the resolved communication parameter;
- 8 data bits;
- 1 stop bit;
- parity EVEN for DS2 or NONE for BMW KWP2000.

## DTR boundary

DS2's DTR behavior is retained as `dtrPendingForSend`, but **configuration does not toggle DTR**.

That distinction matters: public reference behavior uses DTR as part of DS2 send behavior, so it belongs to the later request/transport stage rather than static port setup.

## Failure behavior

Any exception from `setParameters()` closes the physical handles and invalidates the transport session. No uncertain partially-configured session is kept alive.

## Still absent

- no serial read;
- no serial write;
- no BMW request;
- no ECU verification;
- no DTC clear/coding/actuation/flash.
