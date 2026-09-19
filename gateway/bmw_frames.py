"""BMW E39 wire framing. Original implementation based on publicly documented frames.

DS2: target, total-length, payload, XOR.
BMW KWP2000: 0xB8, target, source, payload-length, payload, XOR.
No generic OBD, arbitrary transmit commands, fault clearing or coding is exposed.
"""

from dataclasses import dataclass


class BmwFrameError(ValueError):
    """Invalid, ambiguous or negative response; never claim an ECU online."""


def _check_byte(value, name):
    if not isinstance(value, int) or not 0 <= value <= 255:
        raise BmwFrameError(f"Invalid {name}")
    return value


def xor_checksum(data):
    result = 0
    for byte in data:
        result ^= _check_byte(byte, "frame byte")
    return result


def _payload(data, limit):
    if not isinstance(data, (bytes, bytearray)) or not 1 <= len(data) <= limit:
        raise BmwFrameError("Payload length outside permitted range")
    return bytes(data)


def ds2_encode(target, payload):
    payload = _payload(payload, 252)
    packet = bytes((_check_byte(target, "DS2 target"), len(payload) + 3)) + payload
    return packet + bytes((xor_checksum(packet),))


def kwp_encode(target, payload, source=0xF1):
    payload = _payload(payload, 255)
    packet = bytes((0xB8, _check_byte(target, "KWP target"), _check_byte(source, "KWP source"), len(payload))) + payload
    return packet + bytes((xor_checksum(packet),))


@dataclass(frozen=True)
class BmwFrame:
    protocol: str
    address: int
    payload: bytes
    raw: bytes


def ds2_decode(raw, expected_address):
    if not isinstance(raw, (bytes, bytearray)) or not 4 <= len(raw) <= 255:
        raise BmwFrameError("DS2 frame missing or too long")
    raw = bytes(raw)
    if raw[1] != len(raw):
        raise BmwFrameError("DS2 declared length differs from received bytes")
    if raw[0] != _check_byte(expected_address, "expected DS2 address"):
        raise BmwFrameError("Reply from unexpected DS2 ECU")
    if xor_checksum(raw[:-1]) != raw[-1]:
        raise BmwFrameError("DS2 checksum mismatch")
    return BmwFrame("bmw-ds2", raw[0], raw[2:-1], raw)


def kwp_decode(raw, expected_source, expected_target=0xF1):
    if not isinstance(raw, (bytes, bytearray)) or not 6 <= len(raw) <= 260:
        raise BmwFrameError("KWP frame missing or too long")
    raw = bytes(raw)
    if raw[0] != 0xB8 or raw[3] + 5 != len(raw):
        raise BmwFrameError("Invalid BMW KWP header or declared length")
    if raw[1] != _check_byte(expected_target, "expected KWP target") or raw[2] != _check_byte(expected_source, "expected KWP source"):
        raise BmwFrameError("KWP reply from unexpected ECU or to unexpected tester")
    if xor_checksum(raw[:-1]) != raw[-1]:
        raise BmwFrameError("KWP checksum mismatch")
    return BmwFrame("bmw-kwp", raw[2], raw[4:-1], raw)


@dataclass(frozen=True)
class IdentityProfile:
    module_id: str
    protocol: str
    address: int
    request: bytes
    expected_positive: int


# These two vehicle-specific identity commands are documented for E39
# M62TU Bosch ME7.2 and the ZF5HP24 GS8.60.2 controller. Never interpret
# this catalog as a claim that either ECU is installed in a given car.
IDENTITY_PROFILES = {
    "dme-me72": IdentityProfile("dme", "bmw-kwp", 0x12, bytes((0xA2,)), 0xE2),
    "egs-gs8602": IdentityProfile("egs", "bmw-ds2", 0x32, bytes((0x00,)), 0xA0),
}


def encode_identity(profile):
    if profile not in IDENTITY_PROFILES.values():
        raise BmwFrameError("Only reviewed, read-only identity commands are permitted")
    if profile.protocol == "bmw-ds2":
        return ds2_encode(profile.address, profile.request)
    return kwp_encode(profile.address, profile.request)


def parse_identity(profile, raw):
    if profile not in IDENTITY_PROFILES.values():
        raise BmwFrameError("Unreviewed identity profile")
    frame = ds2_decode(raw, profile.address) if profile.protocol == "bmw-ds2" else kwp_decode(raw, profile.address)
    if not frame.payload or frame.payload[0] != profile.expected_positive:
        raise BmwFrameError("ECU did not acknowledge the requested identity service")
    # Different software variants return differing layouts. Do not claim a
    # specific part number until a long printable identity segment exists.
    groups = []
    current = bytearray()
    for value in frame.payload[1:]:
        if 0x20 <= value <= 0x7E:
            current.append(value)
        else:
            if len(current) >= 6:
                groups.append(current.decode("ascii"))
            current.clear()
    if len(current) >= 6:
        groups.append(current.decode("ascii"))
    if not groups:
        raise BmwFrameError("Positive status without parsable ECU identity")
    return {"moduleId": profile.module_id, "protocol": profile.protocol,
            "address": f"{profile.address:02X}", "identity": max(groups, key=len)[:128],
            "status": "VERIFIED_ONLINE", "responseHex": raw.hex(" ").upper()}
