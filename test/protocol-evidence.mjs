import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiagnosticError, classifyVehicleProtocol, decodeSupportedPIDs,
  decodeStoredDTCs, createDiagnosticSession, reduceDiagnosticSession,
} from '../public/diagnostic-core.js';
import { diagnoseConnection } from '../public/connection-doctor.js';

const observed = {
  bluetoothPowered: true, adapterSeen: true, bleConnected: true,
  gattDiscovered: true, notificationsActive: true,
  adapterReply: 'ATI\rELM327 v2.2\r>',
  pid0100Reply: '41 00 80 00 00 00\r>',
  atdpnReply: 'ATDPN\rA3\r>',
  atdpReply: 'ATDP\rAUTO, ISO 9141-2\r>',
};

function rejectsAdapterError(operation) {
  assert.throws(operation, error => error instanceof DiagnosticError && error.code === 'ADAPTER_ERROR');
}

test('protocol identity requires one clean ATDPN authority reply', () => {
  assert.equal(classifyVehicleProtocol('ATDPN\rA3\r>'), 'legacy');
  assert.equal(classifyVehicleProtocol('ATDPN\rA6\r>'), 'can');
  for (const raw of [
    'ATDPN\rCAN ERROR\r>',
    'ATDPN\rA6\rERROR\r>',
    'ATDPN\rA6\r3\r>',
    'ATDPN\rSEARCHING...\r>',
    'ATDPN\r0\r>',
    'ATDPN\r?\r>',
    'ATDP\rAUTO, ISO 15765-4 CAN\r>',
  ]) assert.equal(classifyVehicleProtocol(raw), 'unknown', raw);
});

test('Connection Doctor never elevates invalid ATDPN or misleading ATDP to verified generic OBD', () => {
  for (const atdpnReply of [
    'ATDPN\rCAN ERROR\r>',
    'ATDPN\rA6\rERROR\r>',
    'ATDPN\rA6\r3\r>',
    'ATDPN\rA0\r>',
  ]) {
    const diagnosis = diagnoseConnection({
      ...observed,
      atdpnReply,
      atdpReply: 'ATDP\rISO 15765-4 CAN\r>',
    });
    assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED');
    assert.equal(diagnosis.evidence.protocol, undefined);
    assert.equal(diagnosis.writesEnabled, false);
  }

  const misleading = diagnoseConnection({
    ...observed,
    atdpnReply: 'ATDPN\r3\r>',
    atdpReply: 'ATDP\rISO 15765-4 CAN\r>',
  });
  assert.equal(misleading.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(misleading.evidence.protocol, 'legacy');
});

test('mixed positive ECU data and an ERROR never counts as verified zero faults or PIDs', () => {
  rejectsAdapterError(() => decodeStoredDTCs('43 00\rERROR\r>', 'can'));
  rejectsAdapterError(() => decodeStoredDTCs('ERROR\r43 00\r>', 'can'));
  rejectsAdapterError(() => decodeSupportedPIDs('41 00 80 00 00 00\rERROR\r>'));
});

test('session reducer refuses ELM ERROR identity and invalidates protocol-tainted DTCs', () => {
  let state = createDiagnosticSession();
  state = reduceDiagnosticSession(state, { type: 'BLE_CONNECTED', epoch: 0 });
  for (const identity of ['ERROR', 'ATI\rELM327 v2.2\rERROR\r>', 'UNABLE TO CONNECT']) {
    assert.equal(reduceDiagnosticSession(state, { type: 'ADAPTER_IDENTIFIED', epoch: 0, identity }), state);
  }
  state = reduceDiagnosticSession(state, { type: 'ADAPTER_IDENTIFIED', epoch: 0, identity: 'ELM327 v2.2' });
  state = reduceDiagnosticSession(state, { type: 'PID_RESPONSE', epoch: 0, raw: '41 00 80 00 00 00\r>' });
  state = reduceDiagnosticSession(state, { type: 'PROTOCOL_RESPONSE', epoch: 0, atdpnRaw: 'ATDPN\rCAN ERROR\r>', atdpRaw: 'ATDP\rISO 15765-4 CAN\r>' });
  assert.equal(state.protocol, 'unknown');
  state = reduceDiagnosticSession(state, { type: 'DTC_RESPONSE', epoch: 0, raw: '43 00\r>' });
  assert.equal(state.dtcs, null);
  assert.equal(state.lastErrorCode, 'PROTOCOL_REQUIRED');
});
