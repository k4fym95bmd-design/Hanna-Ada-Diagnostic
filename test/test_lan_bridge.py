"""Only fake transport is used: no ECU, serial adapter or network egress required."""
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from gateway.lan_bridge import LocalBridge
from gateway.usb_kline import UsbKlineError


TOKEN = "test-only-token-with-more-than-thirty-two-characters"


class FakeTransport:
    _connected = True

    def __init__(self):
        self.verified_modules = {}
        self.calls = []
        self.fail = False
        self.open_calls = 0
        self.open_fail = False

    def open(self):
        self.open_calls += 1
        if self.open_fail:
            raise UsbKlineError("Device unavailable")
        if not self._connected:
            self.verified_modules.clear()
        self._connected = True

    def snapshot(self):
        return {
            "state": "USB_OPEN_NOT_ECU_VERIFIED" if self._connected else "USB_DISCONNECTED",
            "moduleIds": sorted(self.verified_modules),
            "codecs": ["bmw-ds2", "bmw-kwp"],
            "arbitraryWritesEnabled": False,
        }

    def probe(self, profile):
        self.calls.append(profile)
        if self.fail:
            self._connected = False
            self.verified_modules.clear()
            raise UsbKlineError("No valid vehicle reply")
        return {"status": "VERIFIED_ONLINE", "moduleId": "egs", "identity": "EXAMPLE_ONLY"}


class LocalGatewayTests(unittest.TestCase):
    def setUp(self):
        self.transport = FakeTransport()
        self.server = LocalBridge(("127.0.0.1", 0), TOKEN, self.transport)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = "http://127.0.0.1:%d" % self.server.server_port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, body=None, token=TOKEN, content_type="application/json"):
        headers = {"Content-Type": content_type}
        if token is not None:
            headers["Authorization"] = "Bearer " + token
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.url + path, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_rejects_plain_http_listener_exposed_on_lan(self):
        with self.assertRaises(ValueError):
            LocalBridge(("0.0.0.0", 0), TOKEN, self.transport)

    def test_unauthenticated_requests_never_touch_vehicle(self):
        self.assertEqual(self.request("GET", "/v1/status", token=None)[0], 401)
        self.assertEqual(self.request("POST", "/v1/identity", {"profile": "egs-gs8602"}, token="wrong")[0], 401)
        self.assertEqual(self.transport.calls, [])

    def test_status_is_usb_only_not_automatically_an_ecu(self):
        status, payload = self.request("GET", "/v1/status")
        self.assertEqual(status, 200)
        self.assertEqual(payload["state"], "USB_OPEN_NOT_ECU_VERIFIED")
        self.assertFalse(payload["arbitraryWritesEnabled"])
        self.assertEqual(payload["moduleIds"], [])

    def test_only_a_reviewed_identity_profile_can_be_transmitted(self):
        for body in ({"profile": "dsc"}, {"profile": "egs-gs8602", "command": "FF"}, [], {"profile": 32}):
            self.assertEqual(self.request("POST", "/v1/identity", body)[0], 400)
        self.assertEqual(self.transport.calls, [])
        status, data = self.request("POST", "/v1/identity", {"profile": "egs-gs8602"})
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "VERIFIED_ONLINE")
        self.assertEqual(self.transport.calls, ["egs-gs8602"])

    def test_wrong_path_content_type_and_big_body_are_rejected(self):
        self.assertEqual(self.request("POST", "/v1/raw", {"profile": "egs-gs8602"})[0], 404)
        self.assertEqual(self.request("POST", "/v1/identity", {"profile": "egs-gs8602"}, content_type="text/plain")[0], 415)
        oversized = {"profile": "egs-gs8602", "padding": "x" * 150}
        self.assertEqual(self.request("POST", "/v1/identity", oversized)[0], 413)
        self.assertEqual(self.transport.calls, [])

    def test_reconnect_after_failed_probe_opens_usb_without_sending_ecu_commands(self):
        self.transport.fail = True
        self.assertEqual(self.request("POST", "/v1/identity", {"profile": "egs-gs8602"})[0], 502)
        self.assertEqual(self.request("GET", "/v1/status")[1]["state"], "USB_DISCONNECTED")
        status, data = self.request("POST", "/v1/connect", {})
        self.assertEqual(status, 200)
        self.assertEqual(data["state"], "USB_OPEN_NOT_ECU_VERIFIED")
        self.assertEqual(data["moduleIds"], [])
        self.assertEqual(self.transport.open_calls, 1)
        self.assertEqual(self.transport.calls, ["egs-gs8602"])

    def test_connect_requires_authentication_and_forbids_remote_port_selection(self):
        self.assertEqual(self.request("POST", "/v1/connect", {}, token=None)[0], 401)
        for body in ({"port": "COM8"}, {"profile": "egs-gs8602"}, [], None):
            self.assertIn(self.request("POST", "/v1/connect", body)[0], (400, 413))
        self.assertEqual(self.transport.open_calls, 0)
        self.assertEqual(self.transport.calls, [])

    def test_reconnect_unavailable_port_returns_failure(self):
        self.transport._connected = False
        self.transport.open_fail = True
        status, data = self.request("POST", "/v1/connect", {})
        self.assertEqual(status, 503)
        self.assertEqual(data, {"state": "USB_UNAVAILABLE"})
        self.assertEqual(self.transport.calls, [])

    def test_transport_error_never_claims_success(self):
        self.transport.fail = True
        status, data = self.request("POST", "/v1/identity", {"profile": "egs-gs8602"})
        self.assertEqual(status, 502)
        self.assertEqual(data["state"], "ECU_NOT_VERIFIED")
        self.assertNotIn("VERIFIED_ONLINE", str(data))


if __name__ == "__main__":
    unittest.main()

