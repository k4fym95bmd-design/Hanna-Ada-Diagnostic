const FRAME_HEX_RE = /^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;
const SCALE_PER_SECOND = 0.0027756;

function fromHex(frameHex) {
  if (typeof frameHex !== 'string' || !FRAME_HEX_RE.test(frameHex)) {
    throw new TypeError('Invalid ME7.2 roughness frame');
  }
  return frameHex.split(' ').map(value => Number.parseInt(value, 16));
}

function xorChecksum(bytes) {
  return bytes.reduce((value, byte) => value ^ byte, 0);
}

function signedBe16(msb, lsb) {
  const raw = (msb << 8) | lsb;
  return raw & 0x8000 ? raw - 0x10000 : raw;
}

export function parseMe72CylinderRoughnessFrame(frameHex) {
  const bytes = fromHex(frameHex);
  if (bytes.length < 24) throw new TypeError('ME7.2 roughness response too short');
  if (bytes[0] !== 0xB8 || bytes[1] !== 0xF1 || bytes[2] !== 0x12) {
    throw new TypeError('ME7.2 roughness response header mismatch');
  }

  const payloadLength = bytes[3];
  if (bytes.length !== payloadLength + 5) {
    throw new TypeError('ME7.2 roughness response length mismatch');
  }

  const expectedChecksum = xorChecksum(bytes.slice(0, -1));
  if (bytes.at(-1) !== expectedChecksum) {
    throw new TypeError('ME7.2 roughness response checksum mismatch');
  }

  const payload = bytes.slice(4, 4 + payloadLength);
  if (payload.length < 19
      || payload[0] !== 0x62
      || payload[1] !== 0x40
      || payload[2] !== 0x03) {
    throw new TypeError('ME7.2 roughness 0x4003 positive response required');
  }

  const cylinders = [];
  for (let index = 0; index < 8; index++) {
    const offset = 3 + index * 2;
    const raw = signedBe16(payload[offset], payload[offset + 1]);
    cylinders.push(Object.freeze({
      cylinder: index + 1,
      raw,
      valuePerSecond: raw * SCALE_PER_SECOND,
    }));
  }

  return Object.freeze({
    parserId: 'e39-me72-roughness-4003-v1',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
    dataIdentifier: '0x4003',
    units: 's^-1',
    scale: SCALE_PER_SECOND,
    cylinders: Object.freeze(cylinders),
    referenceVerified: true,
    hardwareVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}

export function deriveMe72CylinderRoughnessFromEvidence(receiveEvidence) {
  if (!receiveEvidence || typeof receiveEvidence !== 'object'
      || receiveEvidence.protocol !== 'KWP2000_BMW'
      || receiveEvidence.stage !== 'FRAME_CANDIDATE'
      || !Array.isArray(receiveEvidence.frames)) {
    throw new TypeError('ME7.2 roughness frame evidence required');
  }

  const matches=[];
  for(const frame of receiveEvidence.frames){
    if(frame?.directionHint !== 'possible-reply' || typeof frame.frameHex !== 'string') continue;
    try {
      matches.push(parseMe72CylinderRoughnessFrame(frame.frameHex));
    } catch {
      // Other KWP replies may coexist in the same bounded receive window.
    }
  }
  if(matches.length !== 1){
    throw new TypeError('Exactly one ME7.2 roughness response required');
  }
  return matches[0];
}
