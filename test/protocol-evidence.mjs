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
  protocolReply: 'ATDPN\rA3\r>',
};

function rejectsAdapterError(operation) {
  assert.throws(operation, error => error instanceof DiagnosticError && error.code === 'ADAPTER_ERROR');
}

test('protocol identity requires one clean, nonconflicting vehicle-bus reply', () => {
  assert.equal(classifyVehicleProtocol('ATDPN\rA3\r>'), 'legacy');
  assert.equal(classifyVehicleProtocol('ATDP\rAUTO, ISO 15765-4 CAN\r>'), 'can');
  for (const raw of [
    'ATDP\rCAN ERROR\r>',
    'ATDP\rISO 9141-2\rERROR\r>',
    'ATDP\rISO 15765-4 CAN\rISO 9141-2\r>',
    'ATDP\rISO 15765-4 CAN / ISO 9141-2\r>',
    'ATDP\rNO DATA\r>',
    'ATDP\r?\r>',
  ]) assert.equal(classifyVehicleProtocol(raw), 'unknown', raw);
});

test('Connection Doctor never elevates an error-tainted protocol to verified generic OBD', () => {
  for (const protocolReply of [
    'ATDP\rCAN ERROR\r>',
    'ATDP\rISO 9141-2\rERROR\r>',
    'ATDP\rISO 15765-4 CAN / ISO 9141-2\r>',
  ]) {
    const diagnosis = diagnoseConnection({ ...observed, protocolReply });
    assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED');
    assert.equal(diagnosis.evidence.protocol, undefined);
    assert.equal(diagnosis.writesEnabled, false);
  }
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
  state = reduceDiagnosticSession(state, { type: 'PROTOCOL_RESPONSE', epoch: 0, raw: 'ATDP\rCAN ERROR\r>' });
  assert.equal(state.protocol, 'unknown');
  state = reduceDiagnosticSession(state, { type: 'DTC_RESPONSE', epoch: 0, raw: '43 00\r>' });
  assert.equal(state.dtcs, null);
  assert.equal(state.lastErrorCode, 'PROTOCOL_REQUIRED');
});
