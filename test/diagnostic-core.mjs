import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiagnosticError, classifyVehicleProtocol, decodeStoredDTCs,
  decodeSupportedPIDs, isValidAdapterIdentity, resolveProtocolAuthority,
  createDiagnosticSession, reduceDiagnosticSession
} from '../public/diagnostic-core.js';

function rejectsCode(fn, code) {
  assert.throws(fn, error => error instanceof DiagnosticError && error.code === code);
}

test('ATDP and ATDPN classify the vehicle protocol instead of ATI adapter identity', () => {
  assert.equal(classifyVehicleProtocol('ATDP\rAUTO, ISO 15765-4 CAN (11 bit ID, 500 kbaud)\r>'), 'can');
  assert.equal(classifyVehicleProtocol('ATDPN\rA6\r>'), 'can');
  assert.equal(classifyVehicleProtocol('ATDPN\r8\r>'), 'can');
  assert.equal(classifyVehicleProtocol('ATDP\rISO 9141-2\r>'), 'legacy');
  assert.equal(classifyVehicleProtocol('ATDP\rISO 14230-4 KWP (5 baud init)\r>'), 'legacy');
  assert.equal(classifyVehicleProtocol('ATDPN\rA3\r>'), 'legacy');
  assert.equal(classifyVehicleProtocol('ATI\rELM327 v1.5\r>'), 'unknown');
  assert.equal(classifyVehicleProtocol('ATDP\rAUTO\r>'), 'unknown');
});

test('CAN headers-on count, PCI length and padding decode P0308 correctly', () => {
  const result = decodeStoredDTCs('03\r7E8 04 43 01 03 08 AA AA AA\r>', 'can');
  assert.deepEqual(result.codes, ['P0308']);
  assert.equal(result.responderCount, 1);
  assert.equal(result.protocol, 'can');
  assert.equal(result.status, 'verified');
});

test('a valid CAN frame is sufficient evidence even when ATDP is unknown', () => {
  assert.deepEqual(decodeStoredDTCs('7E8 04 43 01 03 08 00 00 00\r>').codes, ['P0308']);
});

test('CAN headers-off count, trailing zero padding and zero-fault replies', () => {
  assert.deepEqual(decodeStoredDTCs('43 01 03 08 00 00 00\r>', 'can').codes, ['P0308']);
  assert.deepEqual(decodeStoredDTCs('43 01 03 08\r>', 'can').codes, ['P0308']);
  assert.deepEqual(decodeStoredDTCs('43 00\r>', 'can').codes, []);
  assert.deepEqual(decodeStoredDTCs('43 00 00 00 00\r>', 'can').codes, []);
  assert.deepEqual(decodeStoredDTCs('7E8 02 43 00 FF FF FF FF FF\r>').codes, []);
});

test('same ambiguous headers-off bytes are decoded by verified protocol, not parity', () => {
  const legacy = '43 01 33 00 00 00 00\r>';
  const can = '43 01 03 08 00 00 00\r>';
  assert.deepEqual(decodeStoredDTCs(legacy, 'legacy').codes, ['P0133']);
  assert.deepEqual(decodeStoredDTCs(can, 'can').codes, ['P0308']);
  rejectsCode(() => decodeStoredDTCs(legacy), 'PROTOCOL_REQUIRED');
  rejectsCode(() => decodeStoredDTCs(can), 'PROTOCOL_REQUIRED');
  rejectsCode(() => decodeStoredDTCs('43 00\r>'), 'PROTOCOL_REQUIRED');
});

test('legacy padded DTCs and explicit empty two-byte pairs', () => {
  assert.deepEqual(decodeStoredDTCs('43 03 08 00 00\r>', 'legacy').codes, ['P0308']);
  assert.deepEqual(decodeStoredDTCs('43 00 00 00 00\r>', 'legacy').codes, []);
});

test('all responders must be complete; decoded faults are unique and sorted', () => {
  const result = decodeStoredDTCs('7E8 04 43 01 03 08 00 00 00\r7E9 04 43 01 01 33 00 00 00\r7EA 04 43 01 03 08 00 00 00\r>', 'can');
  assert.deepEqual(result.codes, ['P0133', 'P0308']);
  assert.equal(result.responderCount, 3);
  rejectsCode(() => decodeStoredDTCs('43 01 03 08\r43 02 03 08\r>', 'can'), 'TRUNCATED');
  rejectsCode(() => decodeStoredDTCs('43 03 08 00 00\r43 03\r>', 'legacy'), 'TRUNCATED');
});

test('reject truncated, corrupt, multi-frame, count mismatch and protocol mismatch', () => {
  rejectsCode(() => decodeStoredDTCs('7E8 04 43 01 03\r>', 'can'), 'TRUNCATED');
  rejectsCode(() => decodeStoredDTCs('7E8 10 0A 43 03 01 33\r>', 'can'), 'UNSUPPORTED_FRAME');
  rejectsCode(() => decodeStoredDTCs('7E8 04 43 01 03 08 00\r>', 'legacy'), 'PROTOCOL_MISMATCH');
  rejectsCode(() => decodeStoredDTCs('43 02 03 08 00\r>', 'can'), 'TRUNCATED');
  rejectsCode(() => decodeStoredDTCs('43 01 03 08 01\r>', 'can'), 'TRUNCATED');
  rejectsCode(() => decodeStoredDTCs('43 GG\r>', 'can'), 'INVALID_HEX');
  rejectsCode(() => decodeStoredDTCs('NO DATA\r>', 'can'), 'ADAPTER_ERROR');
  rejectsCode(() => decodeStoredDTCs('03\r>', 'can'), 'NO_ECU_RESPONSE');
  rejectsCode(() => decodeStoredDTCs('43\r>', 'can'), 'TRUNCATED');
});

test('Mode 01 multiple responder bitmap union and fail-closed incomplete response', () => {
  const pids = decodeSupportedPIDs('0100\rSEARCHING...\r7E8 06 41 00 80 00 00 00\r7E9 06 41 00 00 00 00 01\r>');
  assert.deepEqual(pids.pids, [1, 32]);
  assert.equal(pids.responderCount, 2);
  rejectsCode(() => decodeSupportedPIDs('41 00 80 00 00 00\r41 00 80 00\r>'), 'TRUNCATED');
  rejectsCode(() => decodeSupportedPIDs('0100\r>'), 'NO_ECU_RESPONSE');
});

test('session does not label BLE or ATI as ECU, accepts only valid PID 0100', () => {
  let state = createDiagnosticSession();
  state = reduceDiagnosticSession(state, { type: 'BLE_CONNECTED', epoch: 0 });
  assert.equal(state.stage, 'BLE');
  state = reduceDiagnosticSession(state, { type: 'ADAPTER_IDENTIFIED', identity: 'ELM327', epoch: 0 });
  assert.equal(state.stage, 'ADAPTER');
  assert.equal(state.dtcs, null);
  state = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', raw: 'NO DATA\r>', epoch: 0 });
  assert.equal(state.stage, 'ADAPTER');
  assert.equal(state.lastErrorCode, 'ADAPTER_ERROR');
  state = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', raw: '41 00 80 00 00 00\r>', epoch: 0 });
  assert.equal(state.stage, 'ECU');
  assert.deepEqual(state.pids, [1]);
});

test('session unknown protocol rejects raw DTC without inventing zero faults', () => {
  let state = createDiagnosticSession();
  state = reduceDiagnosticSession(state, { type: 'BLE_CONNECTED', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'ADAPTER_IDENTIFIED', identity: 'adapter', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', raw: '41 00 80 00 00 00', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'DTC_RESPONSE', raw: '43 00', epoch: 0 });
  assert.equal(state.dtcs, null);
  assert.equal(state.lastErrorCode, 'PROTOCOL_REQUIRED');
  state = reduceDiagnosticSession(state, { type: 'PROTOCOL_RESPONSE', source: 'ATDP', raw: 'ISO 15765-4 CAN\r>', epoch: 0 });
  assert.equal(state.protocol, 'unknown');
  assert.equal(state.protocolSource, null);
  state = reduceDiagnosticSession(state, { type: 'DTC_RESPONSE', raw: '43 00', epoch: 0 });
  assert.equal(state.dtcs, null);
  assert.equal(state.lastErrorCode, 'PROTOCOL_REQUIRED');
  state = reduceDiagnosticSession(state, { type: 'PROTOCOL_RESPONSE', source: 'ATDPN', raw: 'A6\r>', epoch: 0 });
  assert.equal(state.protocol, 'can');
  assert.equal(state.protocolSource, 'ATDPN');
  assert.deepEqual(state.protocolContract, {
    protocolId: '6',
    rawAtdpn: 'A6',
    isAutoDetected: true,
    sourceAuthority: 'ATDPN',
  });
  state = reduceDiagnosticSession(state, { type: 'DTC_RESPONSE', raw: '43 00', epoch: 0 });
  assert.deepEqual(state.dtcs.codes, []);
  assert.equal(state.lastErrorCode, null);
});

test('disconnect invalidates delayed responses and clears sensitive session data', () => {
  let state = createDiagnosticSession();
  state = reduceDiagnosticSession(state, { type: 'BLE_CONNECTED', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'ADAPTER_IDENTIFIED', identity: 'adapter', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', raw: '41 00 80 00 00 00', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'DISCONNECTED' });
  assert.equal(state.epoch, 1);
  assert.equal(state.stage, 'DISCONNECTED');
  assert.equal(state.adapterIdentity, null);
  assert.equal(state.pids, null);
  assert.equal(state.dtcs, null);
  const stale = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', raw: '41 00 80 00 00 00', epoch: 0 });
  assert.equal(stale, state);
});


test('adapter identity helper rejects echoes and adapter errors but accepts observed identities', () => {
  for (const value of ['ATI', 'OK', 'SEARCHING...', 'ERROR', 'CAN ERROR', 'NO DATA', '?', '']) {
    assert.equal(isValidAdapterIdentity(value), false, value);
  }
  for (const value of ['ELM327 v2.2', 'Carista EVO', 'vLink BLE']) {
    assert.equal(isValidAdapterIdentity(value), true, value);
  }
});


test('protocol reducer requires explicit ATDPN source even when descriptive text is recognizable', () => {
  let state = createDiagnosticSession();
  state = reduceDiagnosticSession(state, { type: 'BLE_CONNECTED', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'ADAPTER_IDENTIFIED', identity: 'ELM327 v2.2', epoch: 0 });
  state = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', raw: '41 00 80 00 00 00\r>', epoch: 0 });

  const atdp = reduceDiagnosticSession(state, {
    type: 'PROTOCOL_RESPONSE', source: 'ATDP', raw: 'ISO 9141-2\r>', epoch: 0,
  });
  assert.equal(atdp.protocol, 'unknown');
  assert.equal(atdp.protocolSource, null);

  const missingSource = reduceDiagnosticSession(state, {
    type: 'PROTOCOL_RESPONSE', raw: 'A3\r>', epoch: 0,
  });
  assert.equal(missingSource.protocol, 'unknown');

  const atdpn = reduceDiagnosticSession(state, {
    type: 'PROTOCOL_RESPONSE', source: 'ATDPN', raw: 'A3\r>', epoch: 0,
  });
  assert.equal(atdpn.protocol, 'legacy');
  assert.equal(atdpn.protocolSource, 'ATDPN');
});


test('ATDPN authority contract normalizes protocol ID and keeps ATDP display-only', () => {
  const auto = resolveProtocolAuthority(
    'ATDPN\rA6\r>',
    'ATDP\rAUTO, ISO 15765-4 CAN (11 bit ID, 500 kbaud)\r>'
  );
  assert.deepEqual(auto, {
    protocolId: '6',
    rawAtdpn: 'A6',
    isAutoDetected: true,
    descriptionFallback: 'AUTO, ISO 15765-4 CAN (11 bit ID, 500 kbaud)',
    sourceAuthority: 'ATDPN',
  });
  assert.equal(Object.isFrozen(auto), true);

  const fixed = resolveProtocolAuthority('6\r>');
  assert.deepEqual(fixed, {
    protocolId: '6',
    rawAtdpn: '6',
    isAutoDetected: false,
    sourceAuthority: 'ATDPN',
  });
});

test('ATDPN authority contract rejects unresolved ambiguous and unsupported identifiers', () => {
  for (const raw of [
    '', '?', 'SEARCHING...\rA6\r>', 'ATDPN\rSEARCHING...\rA6\r>',
    'ATDPN\rERROR\r>', 'ATDPN\rNO DATA\r>', 'ATDPN\r0\r>',
    'ATDPN\rA\r>', 'ATDPN\rB\r>', 'ATDPN\rC\r>',
    'ATDPN\rA6\rA7\r>', 'ATDPN\rAUTO\r>',
  ]) {
    rejectsCode(() => resolveProtocolAuthority(raw), 'PROTOCOL_UNVERIFIED');
  }
});

test('ATDP description errors never contaminate a valid ATDPN authority contract', () => {
  for (const description of ['ATDP\rERROR\r>', 'ATDP\r?\r>', 'ATDP\rCAN ERROR\r>']) {
    const contract = resolveProtocolAuthority('ATDPN\rA3\r>', description);
    assert.equal(contract.protocolId, '3');
    assert.equal(contract.sourceAuthority, 'ATDPN');
    assert.equal(contract.descriptionFallback, undefined);
  }
});


test('ATDPN protocol authority contract normalizes exact protocol identity', () => {
  const automatic = resolveProtocolAuthority('ATDPN\rA6\r>', 'ATDP\rAUTO, ISO 15765-4 CAN\r>');
  assert.deepEqual(automatic, {
    protocolId: '6',
    rawAtdpn: 'A6',
    isAutoDetected: true,
    descriptionFallback: 'AUTO, ISO 15765-4 CAN',
    sourceAuthority: 'ATDPN',
  });
  assert.equal(Object.isFrozen(automatic), true);

  const fixed = resolveProtocolAuthority('6');
  assert.deepEqual(fixed, {
    protocolId: '6',
    rawAtdpn: '6',
    isAutoDetected: false,
    sourceAuthority: 'ATDPN',
  });
});

test('ATDPN authority rejects unresolved ambiguous and unsupported identifiers', () => {
  for (const raw of [
    '', '?', 'SEARCHING...', 'NO DATA', 'ERROR',
    '0', 'A', 'B', 'C', 'A0', 'AA', '10',
    'ATDPN\rA6\rA7\r>',
  ]) {
    rejectsCode(() => resolveProtocolAuthority(raw), 'PROTOCOL_UNVERIFIED');
  }
});

test('ATDP fallback is sanitized for presentation and never creates authority', () => {
  const withDescription = resolveProtocolAuthority('A3', 'ATDP\rISO 9141-2\r>');
  assert.equal(withDescription.protocolId, '3');
  assert.equal(withDescription.descriptionFallback, 'ISO 9141-2');
  assert.equal(withDescription.sourceAuthority, 'ATDPN');

  const tainted = resolveProtocolAuthority('A3', 'ATDP\rCAN ERROR\r>');
  assert.equal('descriptionFallback' in tainted, false);
});
