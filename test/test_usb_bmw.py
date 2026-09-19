import unittest
import threading
from unittest.mock import patch
from types import SimpleNamespace

from gateway.bmw_frames import (
    BmwFrameError, IDENTITY_PROFILES, ds2_decode, ds2_encode, kwp_decode,
    kwp_encode, parse_identity,
)
from gateway.usb_kline import UsbKline, UsbKlineError, main


class FakeSerial:
    is_open = True

    def __init__(self, reply=b"", echo=True, short_write=False):
        self.reply = reply
        self.echo = echo
        self.short_write = short_write
        self.buffer = bytearray()
        self.sent = []

    def reset_input_buffer(self):
        self.buffer.clear()

    def write(self, request):
        self.sent.append(bytes(request))
        self.buffer.extend((request if self.echo else b"") + self.reply)
        return len(request) - (1 if self.short_write else 0)

    def read(self, count):
        result = bytes(self.buffer[:count])
        del self.buffer[:count]
        return result

    def flush(self):
        pass


class BmwCodecTests(unittest.TestCase):
    def test_documented_ds2_egs_identity(self):
        self.assertEqual(ds2_encode(0x32, b"\x00"), bytes.fromhex("32 04 00 36"))
        self.assertEqual(ds2_encode(0x32, bytes.fromhex("0b 03")), bytes.fromhex("32 05 0b 03 3f"))

    def test_documented_kwp_me72_identity(self):
        self.assertEqual(kwp_encode(0x12, b"\xa2"), bytes.fromhex("b8 12 f1 01 a2 f8"))

    def test_ds2_rejects_corrupt_size_address_and_checksum(self):
        good = ds2_encode(0x32, b"\xa0" + b"1423953")
        self.assertEqual(ds2_decode(good, 0x32).payload[0], 0xA0)
        for bad in (good[:-1], good[:1] + b"\x04" + good[2:], good[:-1] + b"\x00"):
            with self.assertRaises(BmwFrameError):
                ds2_decode(bad, 0x32)
        with self.assertRaises(BmwFrameError):
            ds2_decode(good, 0x12)

    def test_kwp_rejects_bad_destination_source_and_length(self):
        good = kwp_encode(0xF1, b"\xe2" + b"7506366", source=0x12)
        self.assertEqual(kwp_decode(good, 0x12).payload[0], 0xE2)
        with self.assertRaises(BmwFrameError):
            kwp_decode(good, 0x32)
        with self.assertRaises(BmwFrameError):
            kwp_decode(good[:3] + b"\x01" + good[4:], 0x12)
        with self.assertRaises(BmwFrameError):
            kwp_decode(good[:-1] + b"\x00", 0x12)

    def test_negative_ack_or_non_identity_never_verifies(self):
        egs = IDENTITY_PROFILES["egs-gs8602"]
        for reply in (ds2_encode(0x32, b"\xff" + b"1423953"), ds2_encode(0x32, b"\xa0\x00\x00")):
            with self.assertRaises(BmwFrameError):
                parse_identity(egs, reply)
        dme = IDENTITY_PROFILES["dme-me72"]
        with self.assertRaises(BmwFrameError):
            parse_identity(dme, kwp_encode(0xF1, b"\x7f\xa2\x11" + b"7506366", source=0x12))


class UsbSessionTests(unittest.TestCase):
    def test_requires_a_real_opened_device_and_allowlisted_probe(self):
        connection = UsbKline("FAKE", serial_obj=FakeSerial())
        with self.assertRaises(UsbKlineError):
            connection.probe("egs-gs8602")
        connection.open()
        with self.assertRaises(UsbKlineError):
            connection.probe("dsc")

    def test_echo_then_real_ds2_identity(self):
        reply = ds2_encode(0x32, b"\xa0" + b"1423953" + b"\xff")
        fake = FakeSerial(reply, echo=True)
        connection = UsbKline("FAKE", serial_obj=fake)
        connection.open()
        self.assertFalse(connection.verified_modules)
        result = connection.probe("egs-gs8602")
        self.assertEqual(result["moduleId"], "egs")
        self.assertEqual(result["identity"], "1423953")
        self.assertEqual(fake.sent, [bytes.fromhex("32 04 00 36")])
        self.assertIn("egs", connection.verified_modules)
        connection.close()
        self.assertFalse(connection.verified_modules)

    def test_no_echo_kwp_identity(self):
        reply = kwp_encode(0xF1, b"\xe2" + b"7506366\xff", source=0x12)
        fake = FakeSerial(reply, echo=False)
        connection = UsbKline("FAKE", serial_obj=fake)
        connection.open()
        self.assertEqual(connection.probe("dme-me72")["identity"], "7506366")
        self.assertEqual(fake.sent, [bytes.fromhex("b8 12 f1 01 a2 f8")])

    def test_corrupted_checksum_drops_all_verified_modules(self):
        good = ds2_encode(0x32, b"\xa0" + b"1423953")
        fake = FakeSerial(good)
        connection = UsbKline("FAKE", serial_obj=fake)
        connection.open()
        connection.probe("egs-gs8602")
        fake.reply = good[:-1] + bytes((good[-1] ^ 1,))
        with self.assertRaises(BmwFrameError):
            connection.probe("egs-gs8602")
        self.assertFalse(connection.verified_modules)
        self.assertFalse(connection._connected)

    def test_timeout_clears_session(self):
        connection = UsbKline("FAKE", serial_obj=FakeSerial(reply=b"", echo=False), timeout=0.1)
        connection.open()
        with self.assertRaises(UsbKlineError):
            connection.probe("egs-gs8602")
        self.assertFalse(connection._connected)

    def test_short_usb_write_is_not_success(self):
        fake = FakeSerial(reply=b"", short_write=True)
        connection = UsbKline("FAKE", serial_obj=fake)
        connection.open()
        with self.assertRaises(UsbKlineError):
            connection.probe("egs-gs8602")
        self.assertFalse(connection.verified_modules)

    def test_owned_port_can_reopen_after_error_without_reusing_old_evidence(self):
        good = ds2_encode(0x32, b"\xa0" + b"1423953")
        class OwnedSerial(FakeSerial):
            def close(self):
                self.is_open = False
        first, second = OwnedSerial(good), OwnedSerial(good)
        backend = SimpleNamespace(Serial=unittest.mock.Mock(side_effect=[first, second]),
                                  EIGHTBITS=8, PARITY_EVEN="E", STOPBITS_ONE=1)
        with patch.dict("sys.modules", {"serial": backend}):
            connection = UsbKline("FAKE")
            connection.open()
            connection.probe("egs-gs8602")
            first.reply = good[:-1] + bytes([good[-1] ^ 1])
            with self.assertRaises(BmwFrameError):
                connection.probe("egs-gs8602")
            self.assertFalse(first.is_open)
            connection.open()
            self.assertEqual(connection.snapshot()["moduleIds"], [])
            self.assertEqual(second.sent, [])
            self.assertEqual(connection.probe("egs-gs8602")["identity"], "1423953")
            connection.close()

    def test_waiting_probe_rechecks_connection_before_writing(self):
        fake = FakeSerial(ds2_encode(0x32, b"\xa0" + b"1423953"))
        connection = UsbKline("FAKE", serial_obj=fake)
        connection.open()
        started = threading.Event()
        errors = []
        def worker():
            started.set()
            try:
                connection.probe("egs-gs8602")
            except Exception as error:
                errors.append(error)
        with connection._lock:
            thread = threading.Thread(target=worker)
            thread.start()
            self.assertTrue(started.wait(1))
            connection.close()
        thread.join(2)
        self.assertFalse(thread.is_alive())
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], UsbKlineError)
        self.assertEqual(fake.sent, [])

    def test_snapshot_invalidates_evidence_if_port_has_closed(self):
        fake = FakeSerial(ds2_encode(0x32, b"\xa0" + b"1423953"))
        connection = UsbKline("FAKE", serial_obj=fake)
        connection.open()
        connection.probe("egs-gs8602")
        fake.is_open = False
        state = connection.snapshot()
        self.assertEqual(state["state"], "USB_DISCONNECTED")
        self.assertEqual(state["moduleIds"], [])

    def test_dry_run_makes_no_hardware_claim(self):
        self.assertEqual(main(["--probe", "egs-gs8602", "--dry-run"]), 0)


if __name__ == "__main__":
    unittest.main()

