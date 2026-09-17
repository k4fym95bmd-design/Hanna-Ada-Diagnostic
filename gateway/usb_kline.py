"""Local USB-serial BMW K-line host, NOT a cloud or iOS USB kernel driver.

Requires an OS-recognized serial device and an electrically correct automotive
K-line interface connected to the vehicle's diagnostic port. Uses pyserial for
OS USB serial driver access. No ADS/L-line switching or coding is supported.
"""

import argparse
import json
import sys
import threading
import time

try:
    from .bmw_frames import (
        BmwFrameError, IDENTITY_PROFILES, encode_identity, parse_identity,
    )
except ImportError:  # also permit python gateway/usb_kline.py
    from bmw_frames import BmwFrameError, IDENTITY_PROFILES, encode_identity, parse_identity


class UsbKlineError(RuntimeError):
    pass


class UsbKline:
    """Exclusive, read-only vehicle session. Inject serial_obj for offline tests."""

    def __init__(self, device, serial_obj=None, timeout=1.5):
        if not isinstance(device, str) or not device:
            raise UsbKlineError("An explicit OS serial port is required")
        if not 0.1 <= timeout <= 10:
            raise UsbKlineError("Timeout must be between 0.1 and 10 seconds")
        self.device = device
        self.timeout = timeout
        self._serial = serial_obj
        self._owns_serial = serial_obj is None
        self._connected = False
        self._lock = threading.Lock()
        self.verified_modules = {}

    def open(self):
        if self._connected:
            return
        if self._serial is None:
            try:
                import serial
            except ImportError as exc:
                raise UsbKlineError("pyserial missing: install pyserial on the local USB host") from exc
            try:
                # Host OS handles FTDI/CH340 USB driver. Explicit 8E1, 9600 baud
                # is the BMW DS2/KWP configuration for the documented profiles.
                self._serial = serial.Serial(
                    self.device, baudrate=9600, bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_EVEN, stopbits=serial.STOPBITS_ONE,
                    timeout=0.05, write_timeout=1.0, exclusive=True,
                )
            except (TypeError, ValueError):
                # Some platform pyserial backends do not accept exclusive.
                raise UsbKlineError("This host cannot guarantee an exclusive serial session")
            except Exception as exc:
                raise UsbKlineError(f"Cannot open USB serial port: {type(exc).__name__}") from exc
        if not getattr(self._serial, "is_open", True):
            raise UsbKlineError("USB serial port is not open")
        self._connected = True
        self.verified_modules.clear()

    def close(self):
        self._connected = False
        self.verified_modules.clear()
        if self._serial is not None and self._owns_serial:
            self._serial.close()
            self._serial = None

    def _read_exact(self, count, deadline):
        chunks = bytearray()
        while len(chunks) < count:
            if time.monotonic() >= deadline:
                raise UsbKlineError(f"USB K-line timeout after {len(chunks)}/{count} bytes")
            try:
                part = self._serial.read(count - len(chunks))
            except Exception as exc:
                raise UsbKlineError("USB serial read failed") from exc
            if part:
                chunks.extend(part)
        return bytes(chunks)

    def _read_frame(self, protocol, deadline):
        if protocol == "bmw-ds2":
            header = self._read_exact(2, deadline)
            length = header[1]
            if not 4 <= length <= 255:
                raise UsbKlineError("Invalid DS2 declared frame size")
            return header + self._read_exact(length - 2, deadline)
        if protocol == "bmw-kwp":
            header = self._read_exact(4, deadline)
            if header[0] != 0xB8:
                raise UsbKlineError("Invalid BMW KWP frame start")
            return header + self._read_exact(header[3] + 1, deadline)
        raise UsbKlineError("Unsupported protocol")

    def probe(self, profile_name):
        if profile_name not in IDENTITY_PROFILES:
            raise UsbKlineError("Only allowlisted read-only BMW ECU identities can be probed")
        if not self._connected:
            raise UsbKlineError("Physical USB K-line port not open")
        profile = IDENTITY_PROFILES[profile_name]
        request = encode_identity(profile)
        with self._lock:
            self.verified_modules.pop(profile.module_id, None)
            deadline = time.monotonic() + self.timeout
            try:
                # Discard stale bytes BEFORE a transaction; never fabricate an RX.
                if hasattr(self._serial, "reset_input_buffer"):
                    self._serial.reset_input_buffer()
                written = self._serial.write(request)
                if written != len(request):
                    raise UsbKlineError("Partial physical write")
                self._serial.flush()
                # A shared K-line often echoes our TX. Accept echo only when it
                # matches every byte; no echo is also possible on some cables.
                first = self._read_frame(profile.protocol, deadline)
                response = self._read_frame(profile.protocol, deadline) if first == request else first
                result = parse_identity(profile, response)
                self.verified_modules[profile.module_id] = result
                return result
            except Exception as exc:
                # Invalidate every identity on bus uncertainty or disconnect.
                self.close()
                if isinstance(exc, (BmwFrameError, UsbKlineError)):
                    raise
                raise UsbKlineError(f"USB transaction failed: {type(exc).__name__}") from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description="BMW E39 USB K-line read-only proof; requires real local USB hardware")
    parser.add_argument("--list", action="store_true", help="List OS-visible serial devices; does NOT verify BMW support")
    parser.add_argument("--port", help="Explicit OS serial device such as /dev/ttyUSB0 or COM3")
    parser.add_argument("--probe", choices=sorted(IDENTITY_PROFILES), help="One approved ECU identity probe; no general scan")
    parser.add_argument("--dry-run", action="store_true", help="Show TX frame without touching a car or asserting a connection")
    args = parser.parse_args(argv)
    if args.list:
        try:
            from serial.tools import list_ports
        except ImportError:
            parser.error("Install pyserial on the local host first")
        for port in list_ports.comports():
            print(f"{port.device}: {port.description} (USB serial visibility only)")
        return 0
    if not args.probe:
        parser.error("Select --probe or --list")
    profile = IDENTITY_PROFILES[args.probe]
    if args.dry_run:
        print(json.dumps({"state": "DRY_RUN_NO_HARDWARE", "moduleId": profile.module_id,
                          "protocol": profile.protocol, "requestHex": encode_identity(profile).hex(" ").upper()}))
        return 0
    if not args.port:
        parser.error("--port is required for a real ECU probe")
    port = UsbKline(args.port)
    try:
        port.open()
        print(json.dumps(port.probe(args.probe)))
        return 0
    except (BmwFrameError, UsbKlineError) as exc:
        print(json.dumps({"state": "NOT_VERIFIED", "error": str(exc)}), file=sys.stderr)
        return 2
    finally:
        port.close()


if __name__ == "__main__":
    raise SystemExit(main())
