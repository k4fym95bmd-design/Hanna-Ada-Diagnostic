import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosticError, decodeStoredDTCs, decodeSupportedPIDs } from '../public/diagnostic-core.js';
import { diagnoseConnection } from '../public/connection-doctor.js';

function rejectsNoECU(run) {
  assert.throws(run, error => error instanceof DiagnosticError && error.code === 'NO_ECU_RESPONSE');
}

test('a Mode 01 payload containing 41 00 inside an unrelated service never confirms PID 0100', () => {
  rejectsNoECU(() => decodeSupportedPIDs('41 0C 00 41 00 80 00 00 00\r>'));
  rejectsNoECU(() => decodeSupportedPIDs('7E8 06 41 0C 41 00 80 00 00 00\r>'));
  const diagnosis = diagnoseConnection({
    bluetoothPowered: true, adapterSeen: true, bleConnected: true,
    gattDiscovered: true, notificationsActive: true,
    adapterReply: 'ATI\rELM327 v2.2\r>',
    pid0100Reply: '41 0C 00 41 00 80 00 00 00\r>',
    protocolReply: 'ATDPN\rA3\r>',
  });
  assert.equal(diagnosis.code, 'ECU_RESPONSE_INVALID');
  assert.equal(diagnosis.evidence.parserError, 'NO_ECU_RESPONSE');
});

test('embedded 43 in an unrelated service cannot invent a DTC or false zero-fault reading', () => {
  rejectsNoECU(() => decodeStoredDTCs('41 0C 43 03 08\r>', 'legacy'));
  rejectsNoECU(() => decodeStoredDTCs('7E8 04 41 0C 43 00 00 00 00 00\r>', 'can'));
});

test('unrelated complete frames may coexist with genuinely verified service responses', () => {
  assert.deepEqual(decodeSupportedPIDs('41 0C 00 41 00 80 00 00 00\r41 00 80 00 00 00\r>').pids, [1]);
  assert.deepEqual(decodeStoredDTCs('41 0C 43 03 08\r43 03 08\r>', 'legacy').codes, ['P0308']);
});
