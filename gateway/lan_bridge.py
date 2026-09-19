"""LAN-facing companion for the local USB K-line host.

No cloud transport, arbitrary vehicle writes, coding, or ECU simulation.
Only an OS serial port on THIS machine can reach the vehicle. Bind to loopback
by default. A non-loopback listener requires HTTPS with a trusted certificate.
"""

import argparse
import hmac
import ipaddress
import json
import secrets
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from .bmw_frames import BmwFrameError, IDENTITY_PROFILES
    from .usb_kline import UsbKline, UsbKlineError
except ImportError:  # python gateway/lan_bridge.py
    from bmw_frames import BmwFrameError, IDENTITY_PROFILES
    from usb_kline import UsbKline, UsbKlineError


MAX_BODY = 128


def _loopback(host):
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class LocalBridge(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address, token, transport, tls_context=None):
        if not isinstance(token, str) or len(token) < 32:
            raise ValueError("Bridge bearer token must be at least 32 characters")
        if not _loopback(address[0]) and tls_context is None:
            raise ValueError("LAN access requires TLS; plain HTTP is loopback-only")
        self.token = token
        self.transport = transport
        super().__init__(address, BridgeHandler)
        if tls_context is not None:
            self.socket = tls_context.wrap_socket(self.socket, server_side=True)


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "HannaAdaLocalVCI/1"
    sys_version = ""

    def log_message(self, format, *args):
        # Do not log tokens, requests, VIN, ECU identities, or diagnostic bytes.
        pass

    def _reply(self, status, payload):
        content = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(content)

    def _authorized(self):
        expected = "Bearer " + self.server.token
        received = self.headers.get("Authorization", "")
        if not hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8")):
            self._reply(401, {"state": "UNAUTHORIZED"})
            return False
        return True

    def do_GET(self):
        if not self._authorized():
            return
        if self.path != "/v1/status":
            self._reply(404, {"state": "NOT_FOUND"})
            return
        self._reply(200, self.server.transport.snapshot())

    def do_POST(self):
        if not self._authorized():
            return
        if self.path not in ("/v1/identity", "/v1/connect"):
            self._reply(404, {"state": "NOT_FOUND"})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self._reply(415, {"state": "JSON_REQUIRED"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = -1
        if not 0 < size <= MAX_BODY:
            self._reply(413, {"state": "INVALID_BODY_SIZE"})
            return
        try:
            body = json.loads(self.rfile.read(size).decode("utf-8"))
        except (UnicodeError, ValueError):
            self._reply(400, {"state": "BAD_JSON"})
            return
        if self.path == "/v1/connect":
            # Reopen only the operator-configured port; never accept a remote
            # device path or transmit a diagnostic request during connection.
            if not isinstance(body, dict) or body:
                self._reply(400, {"state": "EMPTY_OBJECT_REQUIRED"})
                return
            try:
                self.server.transport.open()
                status = self.server.transport.snapshot()
            except UsbKlineError:
                self._reply(503, {"state": "USB_UNAVAILABLE"})
                return
            self._reply(200, status)
            return
        if not isinstance(body, dict) or set(body) != {"profile"} or not isinstance(body["profile"], str) or body["profile"] not in IDENTITY_PROFILES:
            self._reply(400, {"state": "PROFILE_NOT_ALLOWLISTED"})
            return
        try:
            result = self.server.transport.probe(body["profile"])
        except (UsbKlineError, BmwFrameError) as exc:
            self._reply(502, {"state": "ECU_NOT_VERIFIED", "error": str(exc)[:180]})
            return
        # The port's parser is the only authority allowed to mark a module online.
        self._reply(200, result)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Authenticated LOCAL USB K-line identity bridge")
    parser.add_argument("--port", required=True, help="OS-visible FTDI serial port, e.g. /dev/ttyUSB0")
    parser.add_argument("--host", default="127.0.0.1", help="LAN IP requires --cert and --key")
    parser.add_argument("--listen-port", type=int, default=8443)
    parser.add_argument("--cert", help="TLS certificate trusted by the iPhone")
    parser.add_argument("--key", help="TLS private key")
    args = parser.parse_args(argv)
    if bool(args.cert) != bool(args.key):
        parser.error("Provide both --cert and --key")
    if not _loopback(args.host) and not args.cert:
        parser.error("LAN listening is forbidden without HTTPS certificate and key")
    if not 1 <= args.listen_port <= 65535:
        parser.error("Invalid port")
    context = None
    if args.cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.cert, args.key)
    transport = UsbKline(args.port)
    transport.open()
    token = secrets.token_urlsafe(32)
    try:
        server = LocalBridge((args.host, args.listen_port), token, transport, context)
        scheme = "https" if context else "http"
        print(f"Local VCI listening on {scheme}://{args.host}:{server.server_port}; token: {token}", flush=True)
        print("Share this token only with your native iPhone app. No remote/cloud forwarding.", flush=True)
        try:
            server.serve_forever()
        finally:
            server.server_close()
    finally:
        transport.close()


if __name__ == "__main__":
    main()

