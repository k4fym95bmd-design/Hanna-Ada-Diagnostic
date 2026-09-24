// Hanna & Ada: dependency-free, read-only diagnostic core.
// Runs in browsers and Node ESM. No BLE transport, hardware writes, demo data,
// VIN persistence, ECU programming, or implied manufacturer-module support.

export class DiagnosticError extends Error {
  constructor(code, message, raw = '') {
    super(message);
    this.name = 'DiagnosticError';
    this.code = code;
    this.raw = raw; // Diagnostic evidence: never upload without user review.
  }
}

export function cleanELM(raw) {
  return String(raw ?? '')
    .replace(/\0/g, '')
    .replace(/SEARCHING\.\.\./gi, '')
    .replace(/>/g, '')
    .replace(/\r/g, '\n')
    .split('\n').map(line => line.trim()).filter(Boolean);
}

// ATDP is the detected VEHICLE protocol, not the adapter's ATI identity.
// ATDPN identifiers 1-5 are legacy, 6-9 are ISO 15765-4 CAN; 0/A/B/C
// are not accepted as verified generic OBD transport identifiers here.
export function classifyVehicleProtocol(raw) {
  const lines = cleanELM(raw).filter(line => !/^ATDPN?$/i.test(line));
  // A reply with multiple/conflicting observations or an ELM failure cannot
  // verify the vehicle bus, even when one line contains a familiar CAN name.
  if (lines.length !== 1) return 'unknown';
  const text = lines[0].toUpperCase();
  if (/\b(NO DATA|UNABLE TO CONNECT|BUS ERROR|CAN ERROR|BUFFER FULL|STOPPED|ERROR)\b|\?/.test(text)) return 'unknown';
  const can = /\bISO[ -]?15765(?:-4)?\b|\bCAN\b/.test(text);
  const legacy = /\bISO[ -]?9141\b|\bISO[ -]?14230\b|\bKWP\b|\bJ1850\b/.test(text);
  if (can && legacy) return 'unknown';
  if (can) return 'can';
  if (legacy) return 'legacy';
  const numeric = text.match(/^(?:A)?([0-9A-C])$/);
  if (numeric) {
    if ('12345'.includes(numeric[1])) return 'legacy';
    if ('6789'.includes(numeric[1])) return 'can';
  }
  return 'unknown';
}

function assertAdapterOK(raw) {
  if (/\b(NO DATA|UNABLE TO CONNECT|BUS ERROR|CAN ERROR|BUFFER FULL|STOPPED|ERROR)\b|\?/.test(raw.toUpperCase())) {
    throw new DiagnosticError('ADAPTER_ERROR', 'Adapter or ECU reported an error', raw);
  }
}

function hexBytes(text, raw) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !tokens.every(token => /^[0-9a-f]+$/i.test(token) && token.length % 2 === 0)) {
    throw new DiagnosticError('INVALID_HEX', 'Malformed hexadecimal ECU response', raw);
  }
  const bytes = [];
  for (const token of tokens) {
    for (let index = 0; index < token.length; index += 2) bytes.push(parseInt(token.slice(index, index + 2), 16));
  }
  return bytes;
}

function extractLine(line, raw) {
  const tokens = line.trim().split(/\s+/);
  // ATH1-style CAN: 7E8 04 43 01 03 08 ...; 29-bit IDs also supported.
  if (tokens.length >= 3 && /^(?:[0-9a-f]{3}|[0-9a-f]{8})$/i.test(tokens[0]) && /^[0-9a-f]{2}$/i.test(tokens[1])) {
    const bytes = hexBytes(tokens.slice(1).join(' '), raw);
    const pci = bytes[0];
    if ((pci >> 4) !== 0) throw new DiagnosticError('UNSUPPORTED_FRAME', 'Multi-frame ISO-TP needs a dedicated reassembly layer', raw);
    const length = pci & 15;
    if (length < 1 || length > 7 || bytes.length < length + 1) {
      throw new DiagnosticError('TRUNCATED', 'Incomplete CAN single-frame response', raw);
    }
    return { bytes: bytes.slice(1, length + 1), framed: true };
  }
  // Command echo is not evidence of a responding vehicle.
  if (/^(?:03|0100)$/i.test(line.replace(/\s/g, ''))) return null;
  return { bytes: hexBytes(line, raw), framed: false };
}

function codeFromPair(a, b) {
  const family = ['P', 'C', 'B', 'U'][(a >> 6) & 3];
  return family + ((a >> 4) & 3).toString(16).toUpperCase() +
    (a & 15).toString(16).toUpperCase() + b.toString(16).padStart(2, '0').toUpperCase();
}

// A response must carry protocol evidence: ATDP/ATDPN, or an explicit CAN
// single-frame header. Unknown unframed data must never become a guessed DTC.
export function decodeStoredDTCs(raw, protocol = 'unknown') {
  const lines = cleanELM(raw);
  const evidence = lines.join('\n');
  assertAdapterOK(evidence);
  if (!['can', 'legacy', 'unknown'].includes(protocol)) {
    throw new DiagnosticError('PROTOCOL_REQUIRED', 'Unsupported vehicle protocol classification', evidence);
  }
  const found = new Set();
  let responders = 0;
  let usedCANFrame = false;
  for (const line of lines) {
    const frame = extractLine(line, evidence);
    if (!frame) continue;
    const { bytes, framed } = frame;
    // A service marker embedded inside another PID's data is not a positive
    // DTC response. Require 43 at the start of the actual frame payload.
    if (bytes[0] !== 0x43) continue;
    if (framed && protocol === 'legacy') throw new DiagnosticError('PROTOCOL_MISMATCH', 'CAN frame conflicts with detected legacy vehicle protocol', evidence);
    if (!framed && protocol === 'unknown') throw new DiagnosticError('PROTOCOL_REQUIRED', 'Unframed DTC data requires verified protocol evidence', evidence);
    responders++;
    usedCANFrame ||= framed;
    const payload = bytes.slice(1);
    let pairs;
    if (framed || protocol === 'can') {
      if (!payload.length) throw new DiagnosticError('TRUNCATED', 'Missing CAN DTC count', evidence);
      const count = payload[0];
      const end = 1 + count * 2;
      if (payload.length < end || payload.slice(end).some(byte => byte !== 0)) {
        throw new DiagnosticError('TRUNCATED', 'CAN DTC count or padding is inconsistent', evidence);
      }
      pairs = payload.slice(1, end);
    } else {
      if (payload.length < 2 || payload.length % 2) {
        throw new DiagnosticError('TRUNCATED', 'Incomplete legacy DTC byte pair', evidence);
      }
      pairs = payload;
    }
    for (let index = 0; index < pairs.length; index += 2) {
      if (pairs[index] !== 0 || pairs[index + 1] !== 0) found.add(codeFromPair(pairs[index], pairs[index + 1]));
    }
  }
  if (!responders) throw new DiagnosticError('NO_ECU_RESPONSE', 'No positive Mode 03 ECU response', evidence);
  return Object.freeze({ status: 'verified', protocol: usedCANFrame ? 'can' : protocol,
    responderCount: responders, codes: Object.freeze([...found].sort()) });
}

// Validating the complete bitmap, not BLE discovery or ATI, proves a generic
// Mode 01 response was received. Multiple ECUs are unioned; any truncated
// responder rejects the entire read rather than hiding it.
export function decodeSupportedPIDs(raw) {
  const lines = cleanELM(raw);
  const evidence = lines.join('\n');
  assertAdapterOK(evidence);
  const bitmap = [0, 0, 0, 0];
  let responders = 0;
  for (const line of lines) {
    const frame = extractLine(line, evidence);
    if (!frame) continue;
    const bytes = frame.bytes;
    // A 41 00 sequence inside another PID's data is not a PID 0100 response.
    if (bytes[0] !== 0x41 || bytes[1] !== 0x00) continue;
    if (bytes.length < 6) throw new DiagnosticError('TRUNCATED', 'Incomplete Mode 01 PID bitmap', evidence);
    for (let i = 0; i < 4; i++) bitmap[i] |= bytes[2 + i];
    responders++;
  }
  if (!responders) throw new DiagnosticError('NO_ECU_RESPONSE', 'No verified Mode 01 PID bitmap', evidence);
  const pids = [];
  for (let i = 0; i < 32; i++) if (bitmap[Math.floor(i / 8)] & (1 << (7 - i % 8))) pids.push(i + 1);
  return Object.freeze({ status: 'verified', responderCount: responders, pids: Object.freeze(pids) });
}

export function isValidAdapterIdentity(identity) {
  if (typeof identity !== 'string') return false;
  const value = identity.trim();
  if (!value || /^(?:ATI|OK|SEARCHING\.{0,3})$/i.test(value)) return false;
  return !/\b(NO DATA|UNABLE TO CONNECT|BUS ERROR|CAN ERROR|BUFFER FULL|STOPPED|ERROR)\b|\?/.test(value.toUpperCase());
}

export function createDiagnosticSession() {
  return Object.freeze({ epoch: 0, stage: 'DISCONNECTED', protocol: 'unknown',
    protocolSource: null, adapterIdentity: null, pids: null, dtcs: null, lastErrorCode: null });
}

// Pure, epoch-guarded state machine suitable for a Floot React state reducer.
// The transport emits observed events; no operation sends commands or fakes a VIN.
export function reduceDiagnosticSession(session, event) {
  if (event.type === 'RESET' || event.type === 'DISCONNECTED') {
    return Object.freeze({ ...createDiagnosticSession(), epoch: session.epoch + 1 });
  }
  if (event.epoch !== session.epoch) return session; // Drop old BLE/ECU callbacks.
  if (event.type === 'BLE_CONNECTED' && session.stage === 'DISCONNECTED') {
    return Object.freeze({ ...session, stage: 'BLE' });
  }
  if (event.type === 'ADAPTER_IDENTIFIED' && session.stage === 'BLE' &&
      isValidAdapterIdentity(event.identity)) {
    return Object.freeze({ ...session, stage: 'ADAPTER', adapterIdentity: event.identity.trim() });
  }
  if (event.type === 'PID_RESPONSE' && ['ADAPTER', 'ECU'].includes(session.stage)) {
    try {
      const result = decodeSupportedPIDs(event.raw);
      // A fresh ECU probe invalidates protocol/DTC evidence from any earlier
      // probe even when the BLE link and epoch have not changed.
      return Object.freeze({ ...session, stage: 'ECU', pids: result.pids,
        protocol: 'unknown', protocolSource: null, dtcs: null, lastErrorCode: null });
    } catch (error) {
      return Object.freeze({ ...session, stage: 'ADAPTER', pids: null, dtcs: null,
        protocol: 'unknown', protocolSource: null,
        lastErrorCode: error instanceof DiagnosticError ? error.code : 'UNKNOWN_ERROR' });
    }
  }
  if (event.type === 'PROTOCOL_RESPONSE' && session.stage === 'ECU') {
    const authoritative = event.source === 'ATDPN';
    const protocol = authoritative ? classifyVehicleProtocol(event.raw) : 'unknown';
    return Object.freeze({
      ...session,
      protocol,
      protocolSource: protocol === 'unknown' ? null : 'ATDPN',
      dtcs: null,
      lastErrorCode: protocol === 'unknown' ? session.lastErrorCode : null,
    });
  }
  if (event.type === 'DTC_RESPONSE' && session.stage === 'ECU') {
    try {
      const dtcs = decodeStoredDTCs(event.raw, session.protocol);
      return Object.freeze({ ...session, dtcs, lastErrorCode: null });
    } catch (error) {
      return Object.freeze({ ...session, dtcs: null,
        lastErrorCode: error instanceof DiagnosticError ? error.code : 'UNKNOWN_ERROR' });
    }
  }
  return session;
}
