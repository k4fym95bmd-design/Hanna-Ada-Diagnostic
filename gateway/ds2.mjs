// BMW DS2 transport framing, independent of USB and of any ECU-specific command.
// Frame: destination, total length, payload, XOR of preceding bytes.
// This is NOT ISO 9141 emissions OBD or a claim of confirmed ECU support.
export class Ds2Error extends Error {
  constructor(message) { super(message); this.name = 'Ds2Error'; }
}

export function checksum(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Ds2Error('Expected Uint8Array');
  return bytes.reduce((sum, byte) => sum ^ byte, 0);
}

export function encodeFrame(destination, payload) {
  if (!Number.isInteger(destination) || destination < 0 || destination > 255) throw new Ds2Error('Invalid destination address');
  if (!(payload instanceof Uint8Array) || payload.length < 1 || payload.length > 252) throw new Ds2Error('Invalid DS2 payload');
  const frame = new Uint8Array(payload.length + 3);
  frame[0] = destination;
  frame[1] = frame.length;
  frame.set(payload, 2);
  frame[frame.length - 1] = checksum(frame.subarray(0, -1));
  return frame;
}

export function decodeFrame(frame, expectedDestination = null) {
  if (!(frame instanceof Uint8Array) || frame.length < 4 || frame.length > 255) throw new Ds2Error('Invalid DS2 frame size');
  if (frame[1] !== frame.length) throw new Ds2Error('DS2 frame length mismatch');
  if (frame[frame.length - 1] !== checksum(frame.subarray(0, -1))) throw new Ds2Error('DS2 checksum mismatch');
  if (expectedDestination !== null && frame[0] !== expectedDestination) throw new Ds2Error('Unexpected ECU address');
  return Object.freeze({ address: frame[0], payload: Uint8Array.from(frame.subarray(2, -1)) });
}

// A frame from an ECU is not proof of success unless it is addressed correctly,
// has a valid checksum and begins with a positive acknowledgement (0xA0).
export function decodePositiveResponse(frame, expectedAddress) {
  const result = decodeFrame(frame, expectedAddress);
  if (result.payload[0] === 0xA1) throw new Ds2Error('ECU busy');
  if (result.payload[0] === 0xA2) throw new Ds2Error('ECU rejected parameter');
  if (result.payload[0] === 0xFF) throw new Ds2Error('ECU rejected command');
  if (result.payload[0] !== 0xA0) throw new Ds2Error('Unrecognized ECU response status');
  if (result.payload.length < 2) throw new Ds2Error('Positive response contains no payload');
  return Uint8Array.from(result.payload.subarray(1));
}
