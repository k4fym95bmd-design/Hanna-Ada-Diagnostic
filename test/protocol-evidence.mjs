import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiagnosticError, classifyVehicleProtocol, resolveProtocolAuthority,
  protocolKindFromAuthority, decodeSupportedPIDs, decodeStoredDTCs,
  createDiagnosticSession, reduceDiagnosticSession,
} from '../public/diagnostic-core.js';
import { diagnoseConnection } from '../public/connection-doctor.js';

const observed = Object.freeze({
  bluetoothPowered: true,
  adapterSeen: true,
  bleConnected: true,
  gattDiscovered: true,
  notificationsActive: true,
  adapterReply: 'ATI\rELM327 v2.2\r>',
  pid0100Reply: '41 00 80 00 00 00\r>',
  protocolReply: 'ATDPN\rA3\r>',
  protocolDescriptionReply: 'ATDP\rAUTO, ISO 9141-2\r>',
});

function rejectsDiagnosticCode(operation, code) {
  assert.throws(operation, error => error instanceof DiagnosticError && error.code === code);
}

test('ATDPN is the sole protocol identity authority', () => {
  const autoCan = resolveProtocolAuthority(
    'ATDPN\rA6\r>',
    'ATDP\rAUTO, ISO 15765-4 CAN (11/500)\r>',
  );
  assert.deepEqual(autoCan, {
    protocolId: '6',
    rawAtdpn: 'A6',
    isAutoDetected: true,
    descriptionFallback: 'AUTO, ISO 15765-4 CAN (11/500)',
    sourceAuthority: 'ATDPN',
  });
  assert.equal(protocolKindFromAuthority(autoCan), 'can');

  const fixedLegacy = resolveProtocolAuthority('ATDPN\r3\r>', 'ATDP\rISO 9141-2\r>');
  assert.equal(fixedLegacy.protocolId, '3');
  assert.equal(fixedLegacy.isAutoDetected, false);
  assert.equal(fixedLegacy.sourceAuthority, 'ATDPN');
  assert.equal(protocolKindFromAuthority(fixedLegacy), 'legacy');

  const vendorProtocol = resolveProtocolAuthority('ATDPN\rA\r>');
  assert.equal(vendorProtocol.protocolId, 'A');
  assert.equal(vendorProtocol.isAutoDetected, false);
  assert.equal(protocolKindFromAuthority(vendorProtocol), 'unknown');
});

test('invalid or ambiguous ATDPN never gets rescued by ATDP text', () => {
  for (const raw of [
    '',
    'ATDPN\r?\r>',
    'ATDPN\rSEARCHING...\r>',
    'ATDPN\rERROR\r>',
    'ATDPN\rA6\r3\r>',
    'ATDPN\r0\r>',
    'ATDPN\rA0\r>',
    'ATDPN\rA10\r>',
  ]) {
    assert.throws(
      () => resolveProtocolAuthority(raw, 'ATDP\rAUTO, ISO 15765-4 CAN\r>'),
      DiagnosticError,
      raw,
    );
  }

  const validWithBrokenLabel = resolveProtocolAuthority('ATDPN\rA6\r>', 'ATDP\rERROR\r>');
  assert.equal(validWithBrokenLabel.protocolId, '6');
  assert.equal(validWithBrokenLabel.descriptionFallback, undefined);
  assert.equal(validWithBrokenLabel.sourceAuthority, 'ATDPN');
});

test('broad ATDP classifier remains display-only and cannot become authority', () => {
  assert.equal(classifyVehicleProtocol('ATDP\rAUTO, ISO 15765-4 CAN\r>'), 'can');
  assert.equal(classifyVehicleProtocol('ATDP\rISO 9141-2\r>'), 'legacy');
  assert.equal(classifyVehicleProtocol('ATDP\rCAN ERROR\r>'), 'unknown');
  assert.equal(classifyVehicleProtocol('ATDP\rISO 15765-4 CAN\rISO 9141-2\r>'), 'unknown');
});

test('Connection Doctor verifies protocol only from ATDPN', () => {
  const diagnosis = diagnoseConnection(observed);
  assert.equal(diagnosis.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(diagnosis.evidence.protocol, 'legacy');
  assert.equal(diagnosis.evidence.protocolId, '3');
  assert.equal(diagnosis.evidence.isAutoDetected, true);
  assert.equal(diagnosis.evidence.sourceAuthority, 'ATDPN');
  assert.equal(diagnosis.writesEnabled, false);

  for (const protocolReply of [
    null,
    '',
    'ATDP\rISO 15765-4 CAN\r>',
    'ATDPN\r?\r>',
    'ATDPN\rERROR\r>',
  ]) {
    const rejected = diagnoseConnection({
      ...observed,
      protocolReply,
      protocolDescriptionReply: 'ATDP\rAUTO, ISO 15765-4 CAN\r>',
    });
    assert.equal(rejected.code, 'PROTOCOL_UNVERIFIED');
    assert.equal(rejected.evidence.protocol, undefined);
    assert.equal(rejected.writesEnabled, false);
  }
});

test('mixed positive ECU data and adapter errors never count as verified reads', () => {
  rejectsDiagnosticCode(() => decodeStoredDTCs('43 00\rERROR\r>', 'can'), 'ADAPTER_ERROR');
  rejectsDiagnosticCode(() => decodeStoredDTCs('ERROR\r43 00\r>', 'can'), 'ADAPTER_ERROR');
  rejectsDiagnosticCode(() => decodeSupportedPIDs('41 00 80 00 00 00\rERROR\r>'), 'ADAPTER_ERROR');
});

test('session reducer stores immutable ATDPN authority and rejects stale callbacks', () => {
  let state = createDiagnosticSession();
  const staleInitial = state;

  state = reduceDiagnosticSession(state, { type: 'BLE_CONNECTED', epoch: 0 });
  state = reduceDiagnosticSession(state, {
    type: 'ADAPTER_IDENTIFIED',
    epoch: 0,
    identity: 'ELM327 v2.2',
  });
  state = reduceDiagnosticSession(state, {
    type: 'PID_RESPONSE',
    epoch: 0,
    raw: '41 00 80 00 00 00\r>',
  });

  state = reduceDiagnosticSession(state, {
    type: 'PROTOCOL_RESPONSE',
    epoch: 0,
    atdpnRaw: 'ATDPN\rA6\r>',
    atdpRaw: 'ATDP\rAUTO, ISO 15765-4 CAN\r>',
  });
  assert.equal(state.protocol, 'can');
  assert.equal(state.protocolAuthority.protocolId, '6');
  assert.equal(state.protocolAuthority.rawAtdpn, 'A6');
  assert.equal(state.protocolAuthority.isAutoDetected, true);
  assert.equal(state.protocolAuthority.sourceAuthority, 'ATDPN');

  const afterAuthority = state;
  const stale = reduceDiagnosticSession(state, {
    type: 'PROTOCOL_RESPONSE',
    epoch: 99,
    atdpnRaw: 'ATDPN\r3\r>',
  });
  assert.equal(stale, afterAuthority);

  state = reduceDiagnosticSession(state, {
    type: 'PID_RESPONSE',
    epoch: 0,
    raw: '41 00 80 00 00 00\r>',
  });
  assert.equal(state.protocol, 'unknown');
  assert.equal(state.protocolAuthority, null);
  assert.equal(state.dtcs, null);

  const invalidProtocol = reduceDiagnosticSession(state, {
    type: 'PROTOCOL_RESPONSE',
    epoch: 0,
    atdpnRaw: 'ATDP\rISO 15765-4 CAN\r>',
  });
  assert.equal(invalidProtocol.protocol, 'unknown');
  assert.equal(invalidProtocol.protocolAuthority, null);
  assert.equal(invalidProtocol.lastErrorCode, 'PROTOCOL_UNRESOLVED');

  const disconnected = reduceDiagnosticSession(staleInitial, { type: 'DISCONNECTED', epoch: 0 });
  assert.equal(disconnected.epoch, 1);
  assert.equal(disconnected.protocolAuthority, null);
});

test('unverified protocol blocks unframed DTC decoding', () => {
  rejectsDiagnosticCode(() => decodeStoredDTCs('43 00\r>', 'unknown'), 'PROTOCOL_REQUIRED');
});
