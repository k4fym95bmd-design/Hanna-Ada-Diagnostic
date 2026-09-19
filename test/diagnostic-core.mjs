import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiagnosticError, classifyVehicleProtocol, decodeStoredDTCs,
  decodeSupportedPIDs, createDiagnosticSession, reduceDiagnosticSession
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
  rejectsCode(() => decodeStoredDTCs('43 02 03 08 00 00\r>', 'can'), 'TRUNCATED');
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
  state = reduceDiagnosticSession(state, { type: 'PROTOCOL_RESPONSE', raw: 'ATDP\rISO 15765-4 CAN\r>', epoch: 0 });
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
