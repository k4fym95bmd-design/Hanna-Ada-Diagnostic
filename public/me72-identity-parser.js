const FRAME_HEX_RE = /^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;

function fromHex(frameHex) {
  if (typeof frameHex !== 'string' || !FRAME_HEX_RE.test(frameHex)) {
    throw new TypeError('Invalid ME7.2 identity frame');
  }
  return frameHex.split(' ').map(value => Number.parseInt(value, 16));
}

function xorChecksum(bytes) {
  return bytes.reduce((value, byte) => value ^ byte, 0);
}

function ascii(bytes, label, expectedLength) {
  if (bytes.length !== expectedLength
      || bytes.some(byte => byte < 0x20 || byte > 0x7E)) {
    throw new TypeError(`Invalid ME7.2 ${label}`);
  }
  const value = String.fromCharCode(...bytes).trim();
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new TypeError(`Invalid ME7.2 ${label}`);
  }
  return value;
}

export function parseMe72IdentityFrame(frameHex) {
  const bytes = fromHex(frameHex);
  if (bytes.length < 32) throw new TypeError('ME7.2 identity response too short');
  if (bytes[0] !== 0xB8 || bytes[1] !== 0xF1 || bytes[2] !== 0x12) {
    throw new TypeError('ME7.2 identity response header mismatch');
  }

  const payloadLength = bytes[3];
  const expectedLength = 4 + payloadLength + 1;
  if (bytes.length !== expectedLength) {
    throw new TypeError('ME7.2 identity response length mismatch');
  }

  const expectedChecksum = xorChecksum(bytes.slice(0, -1));
  if (bytes.at(-1) !== expectedChecksum) {
    throw new TypeError('ME7.2 identity response checksum mismatch');
  }

  const payload = bytes.slice(4, 4 + payloadLength);
  if (payload[0] !== 0xE2) {
    throw new TypeError('ME7.2 identity positive response E2 required');
  }
  if (payload.length < 26) {
    throw new TypeError('ME7.2 identity payload too short');
  }

  const identity = Object.freeze({
    partNumber: ascii(payload.slice(1, 8), 'part number', 7),
    hardwareNumber: ascii(payload.slice(8, 10), 'hardware number', 2),
    codingIndex: ascii(payload.slice(10, 12), 'coding index', 2),
    diagnosticIndex: ascii(payload.slice(12, 14), 'diagnostic index', 2),
    busIndex: ascii(payload.slice(14, 16), 'bus index', 2),
    buildWeek: ascii(payload.slice(16, 18), 'build week', 2),
    buildYear: ascii(payload.slice(18, 20), 'build year', 2),
    supplier: ascii(payload.slice(20, 26), 'supplier', 6),
  });

  const fingerprint = [
    `PN${identity.partNumber}`,
    `HW${identity.hardwareNumber}`,
    `CI${identity.codingIndex}`,
    `DI${identity.diagnosticIndex}`,
    `BI${identity.busIndex}`,
    `BW${identity.buildWeek}`,
    `BY${identity.buildYear}`,
    `SP${identity.supplier}`,
  ].join('-');

  return Object.freeze({
    parserId: 'e39-me72-a2-e2-v1',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
    positiveResponseService: 0xE2,
    identity,
    fingerprint,
    profileVerified: true,
    hardwareVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}

export function deriveMe72IdentityFromEvidence(receiveEvidence) {
  if (!receiveEvidence || typeof receiveEvidence !== 'object'
      || receiveEvidence.protocol !== 'KWP2000_BMW'
      || receiveEvidence.stage !== 'FRAME_CANDIDATE'
      || !Array.isArray(receiveEvidence.frames)
      || receiveEvidence.frames.length < 1) {
    throw new TypeError('ME7.2 frame evidence required');
  }

  const candidates = [];
  for (const frame of receiveEvidence.frames) {
    if (frame?.directionHint !== 'possible-reply' || typeof frame.frameHex !== 'string') continue;
    try {
      candidates.push(parseMe72IdentityFrame(frame.frameHex));
    } catch {
      // Other valid KWP replies may coexist in the same passive evidence batch.
    }
  }

  if (candidates.length !== 1) {
    throw new TypeError('Exactly one ME7.2 identity response required');
  }
  return candidates[0];
}
