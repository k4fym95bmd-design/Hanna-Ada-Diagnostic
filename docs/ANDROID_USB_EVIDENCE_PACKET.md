# Android USB evidence packet v0.5

The next physical milestone is a **sanitized evidence packet** from the user's actual switched K+DCAN cable on Android.

The app exports only:
- Android API level and USB Host declaration;
- USB VID:PID;
- interface count;
- Android USB permission;
- recognized serial-driver family: FTDI / CP210X / CH34X / PL2303 / CDC-ACM / UNKNOWN;
- serial port count.

It deliberately does not export USB paths, serial numbers, arbitrary exception text, VIN, ECU data, location or network data.

## Decision rule

- FTDI is marked only as a **K+DCAN reference candidate**, because the public Android BMW reference path documents standard FTDI-based INPA-compatible adapters.
- Any detected serial family remains transport evidence only.
- BMW DS2/K-Line, module identity, DTCs and live values remain unverified until a separate bounded read-only protocol probe receives a valid ECU response.
- Write, erase, coding, actuation and flash remain disabled.

## Why this matters

One copied report from the actual Android device will tell us whether the photographed cable is really FTDI-family or another USB-serial implementation. That removes the largest hardware uncertainty without requiring Windows or opening the cable.
