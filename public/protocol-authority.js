// Deterministic ELM327 protocol authority.
// ATDPN is the only source of protocol identity. ATDP is presentation-only.

export class ProtocolAuthorityError extends Error {
  constructor(code, message, raw = '') {
    super(message);
    this.name = 'ProtocolAuthorityError';
    this.code = code;
    this.raw = raw;
  }
}

const VALID_PROTOCOL_ID = /^[1-9A-C]$/;
const VALID_ATDPN_TOKEN = /^(?:[1-9A-C]|A[0-9A-C])$/;
const FAILURE_MARKER = /\b(?:ERROR|NO DATA|UNABLE TO CONNECT|BUS ERROR|CAN ERROR|BUFFER FULL|STOPPED|SEARCHING)\b|\?/i;
const INVALID_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function assertRawReply(raw, label, maxLength) {
  if (typeof raw !== 'string') {
    throw new ProtocolAuthorityError(`${label}_TYPE`, `${label} response must be a string.`);
  }
  if (!raw.trim()) {
    throw new ProtocolAuthorityError(`${label}_EMPTY`, `${label} response is empty.`, raw);
  }
  if (raw.length > maxLength) {
    throw new ProtocolAuthorityError(`${label}_OVERSIZE`, `${label} response exceeds ${maxLength} bytes.`, raw);
  }
  if (INVALID_CONTROL.test(raw)) {
    throw new ProtocolAuthorityError(`${label}_CONTROL_BYTE`, `${label} response contains invalid control bytes.`, raw);
  }
}

function elmLines(raw) {
  return raw
    .replace(/>/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function isAtdpnEcho(line) {
  return /^AT\s*DPN$/i.test(line);
}

function isAtdpEcho(line) {
  return /^AT\s*DP$/i.test(line);
}

export function sanitizeProtocolDescription(atdpRaw) {
  if (atdpRaw == null) return undefined;
  if (typeof atdpRaw !== 'string' || !atdpRaw.trim() || atdpRaw.length > 512 || INVALID_CONTROL.test(atdpRaw)) {
    return undefined;
  }

  const lines = elmLines(atdpRaw).filter(line => !isAtdpEcho(line));
  if (lines.length !== 1 || FAILURE_MARKER.test(lines[0])) return undefined;

  const label = lines[0].replace(/\s+/g, ' ').trim();
  return label || undefined;
}

export function protocolFamilyFromId(protocolId) {
  if (!VALID_PROTOCOL_ID.test(protocolId)) return 'unknown';
  if ('12345'.includes(protocolId)) return 'legacy';
  if ('6789'.includes(protocolId)) return 'can';
  if (protocolId === 'A') return 'j1939';
  return 'custom-can';
}

export function classifyProtocolContract(contract) {
  if (!contract || contract.sourceAuthority !== 'ATDPN' || !VALID_PROTOCOL_ID.test(contract.protocolId)) {
    return 'unknown';
  }
  if ('12345'.includes(contract.protocolId)) return 'legacy';
  if ('6789'.includes(contract.protocolId)) return 'can';
  return 'unknown';
}

export function resolveProtocolAuthority(atdpnRaw, atdpRaw) {
  assertRawReply(atdpnRaw, 'ATDPN', 256);

  const lines = elmLines(atdpnRaw);
  const payload = [];

  for (const line of lines) {
    if (isAtdpnEcho(line)) continue;
    if (FAILURE_MARKER.test(line)) {
      throw new ProtocolAuthorityError('ATDPN_ADAPTER_ERROR', 'ATDPN response contains an adapter error or unresolved search state.', atdpnRaw);
    }
    payload.push(line.toUpperCase());
  }

  if (payload.length !== 1) {
    throw new ProtocolAuthorityError('ATDPN_AMBIGUOUS', 'ATDPN response must contain exactly one protocol token.', atdpnRaw);
  }

  const token = payload[0];
  if (!VALID_ATDPN_TOKEN.test(token)) {
    throw new ProtocolAuthorityError('ATDPN_INVALID_TOKEN', `Invalid ATDPN protocol token: "${token}".`, atdpnRaw);
  }
  if (token === '0' || token === 'A0') {
    throw new ProtocolAuthorityError('ATDPN_UNRESOLVED', 'ATDPN has not resolved an active vehicle protocol.', atdpnRaw);
  }

  let protocolId;
  let isAutoDetected;

  if (token.length === 1) {
    protocolId = token;
    isAutoDetected = false;
  } else {
    protocolId = token.slice(1);
    isAutoDetected = true;
  }

  if (!VALID_PROTOCOL_ID.test(protocolId)) {
    throw new ProtocolAuthorityError('ATDPN_UNKNOWN_PROTOCOL', `Unknown ELM327 protocol ID: "${protocolId}".`, atdpnRaw);
  }

  const descriptionFallback = sanitizeProtocolDescription(atdpRaw);
  return Object.freeze({
    protocolId,
    rawAtdpn: token,
    isAutoDetected,
    ...(descriptionFallback ? { descriptionFallback } : {}),
    sourceAuthority: 'ATDPN',
  });
}
