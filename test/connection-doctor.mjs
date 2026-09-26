import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionDoctor, diagnoseConnection } from '../public/connection-doctor.js';

const base = {
  bluetoothPowered: true, adapterSeen: true, bleConnected: true,
  gattDiscovered: true, notificationsActive: true,
  adapterReply: 'ATI\rELM327 v2.2\r>',
  pid0100Reply: '41 00 80 00 00 00\r>',
  protocolNumberReply: 'ATDPN\rA3\r>',
  protocolDescriptionReply: 'ATDP\rISO 9141-2\r>',
};

test('triage finds the first unverified stage without inventing connection success', () => {
  assert.equal(diagnoseConnection().code, 'BT_UNAVAILABLE');
  assert.equal(diagnoseConnection({ bluetoothPowered: true }).code, 'ADAPTER_NOT_FOUND');
  assert.equal(diagnoseConnection({ ...base, bleConnected: false }).code, 'BLE_NOT_CONNECTED');
  assert.equal(diagnoseConnection({ ...base, gattDiscovered: false }).code, 'GATT_NOT_FOUND');
  assert.equal(diagnoseConnection({ ...base, notificationsActive: false }).code, 'NOTIFY_NOT_READY');
  assert.equal(diagnoseConnection({ ...base, adapterReply: null }).code, 'ADAPTER_UNVERIFIED');
  assert.equal(diagnoseConnection({ ...base, adapterReply: 'ATI\r>' }).code, 'ADAPTER_UNVERIFIED');
  assert.equal(diagnoseConnection({ ...base, pid0100Reply: null }).code, 'ECU_NOT_PROBED');
  assert.equal(diagnoseConnection({ ...base, pid0100Reply: 'NO DATA\r>' }).code, 'ECU_RESPONSE_INVALID');
  assert.equal(diagnoseConnection({ ...base, transportError: 'timeout' }).code, 'TRANSPORT_ERROR');
});

test('standalone ATI ERROR never verifies the adapter despite valid later replies', () => {
  for (const adapterReply of ['ERROR', 'ATI\rERROR\r>', 'ATI\r  error  \r>']) {
    const diagnosis = diagnoseConnection({ ...base, adapterReply });
    assert.equal(diagnosis.code, 'ADAPTER_UNVERIFIED');
    assert.equal(diagnosis.evidence.genericECUVerified, undefined);
  }
});

test('ATI ERROR alongside an identity rejects the whole response in either order', () => {
  for (const adapterReply of [
    'ATI\rELM327 v2.2\rERROR\r>',
    'ATI\rERROR\rELM327 v2.2\r>',
    'ATI\nELM327 v2.2\n error \n>',
  ]) {
    const diagnosis = diagnoseConnection({ ...base, adapterReply });
    assert.equal(diagnosis.code, 'ADAPTER_UNVERIFIED');
    assert.equal(diagnosis.evidence.genericECUVerified, undefined);
  }
});

test('only real, parsed 0100 and identified protocol verify generic ECU', () => {
  const unknown = diagnoseConnection({ ...base, protocolNumberReply: null });
  assert.equal(unknown.code, 'PROTOCOL_UNVERIFIED');
  assert.equal(unknown.evidence.genericECUVerified, true);
  const verified = diagnoseConnection(base);
  assert.equal(verified.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(verified.evidence.protocol, 'legacy');
  assert.equal(verified.evidence.pidCount, 1);
  assert.equal(verified.bmwModulesVerified, false);
  assert.equal(verified.writesEnabled, false);
});

test('conflicting and incomplete multiple ECU replies never create online status', () => {
  const invalid = diagnoseConnection({ ...base, pid0100Reply: '41 00 80 00 00 00\r41 00 80 00\r>' });
  assert.equal(invalid.code, 'ECU_RESPONSE_INVALID');
  assert.equal(invalid.evidence.parserError, 'TRUNCATED');
  const multiple = diagnoseConnection({ ...base, pid0100Reply: '41 00 80 00 00 00\r41 00 00 00 00 01\r>' });
  assert.equal(multiple.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(multiple.evidence.responderCount, 2);
});

test('connection summary does not leak adapter reply, vehicle VIN or raw sensor data', () => {
  const marker = 'SECRET-VIN-WOULD-NOT-BE-EXPORTED';
  const summary = diagnoseConnection({ ...base, adapterReply: `ATI\r${marker}\r>` });
  assert.equal(JSON.stringify(summary).includes(marker), false);
  assert.equal(summary.bmwModulesVerified, false);
});

test('input validation', () => {
  assert.throws(() => diagnoseConnection(null), TypeError);
  assert.throws(() => diagnoseConnection([]), TypeError);
});


test('ATDP-only observation cannot establish Connection Doctor protocol authority', () => {
  const diagnosis = diagnoseConnection({
    ...base,
    protocolNumberReply: null,
    protocolDescriptionReply: 'ATDP\rISO 15765-4 CAN\r>',
  });
  assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED');
  assert.equal(diagnosis.evidence.protocol, undefined);
});

test('ConnectionDoctor active protocol is fail-closed across failed re-resolution', () => {
  const doctor = new ConnectionDoctor();
  const contract = doctor.resolveProtocolAuthority(
    'ATDPN\rA6\r>',
    'ATDP\rAUTO, ISO 15765-4 CAN\r>'
  );
  assert.equal(contract.protocolId, '6');
  assert.equal(doctor.getActiveProtocol(), contract);

  assert.throws(
    () => doctor.resolveProtocolAuthority('ATDPN\r?\r>'),
    error => error?.code === 'PROTOCOL_UNVERIFIED'
  );
  assert.throws(
    () => doctor.getActiveProtocol(),
    error => error?.code === 'PROTOCOL_REQUIRED'
  );
});

test('ConnectionDoctor resetProtocol removes authority deterministically', () => {
  const doctor = new ConnectionDoctor();
  doctor.resolveProtocolAuthority('3');
  doctor.resetProtocol();
  assert.throws(
    () => doctor.getActiveProtocol(),
    error => error?.code === 'PROTOCOL_REQUIRED'
  );
});

test('ConnectionDoctor returns the normalized ProtocolContract as evidence', () => {
  const diagnosis = diagnoseConnection(base);
  assert.equal(diagnosis.code, 'GENERIC_OBD_VERIFIED');
  assert.deepEqual(diagnosis.evidence.protocolContract, {
    protocolId: '3',
    rawAtdpn: 'A3',
    isAutoDetected: true,
    descriptionFallback: 'ISO 9141-2',
    sourceAuthority: 'ATDPN',
  });
});


test('Connection Doctor ignores legacy protocolReply fields even when tagged ATDPN', () => {
  for (const protocolReplySource of [null, 'ATDPN', 'ATDP']) {
    const diagnosis = diagnoseConnection({
      ...base,
      protocolNumberReply: null,
      protocolDescriptionReply: null,
      protocolReply: 'ATDPN\rA6\r>',
      protocolReplySource,
    });
    assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED');
    assert.equal(diagnosis.evidence.protocol, undefined);
  }
});




test('Connection Doctor accepts every verified generic ATDPN protocol id 1 through 9', () => {
  for (const id of ['1','2','3','4','5','6','7','8','9']) {
    const diagnosis = diagnoseConnection({
      ...base,
      protocolNumberReply: `ATDPN\rA${id}\r>`,
      protocolDescriptionReply: null,
    });
    assert.equal(diagnosis.code, 'GENERIC_OBD_VERIFIED', id);
    assert.equal(diagnosis.evidence.protocolContract.protocolId, id);
    assert.equal(diagnosis.evidence.protocolContract.sourceAuthority, 'ATDPN');
  }
});

test('Connection Doctor rejects protocol ids outside the verified generic OBD authority set', () => {
  for (const raw of ['ATDPN\r0\r>', 'ATDPN\rA\r>', 'ATDPN\rB\r>', 'ATDPN\rC\r>', 'ATDPN\rAA\r>', 'ATDPN\r10\r>']) {
    const diagnosis = diagnoseConnection({
      ...base,
      protocolNumberReply: raw,
      protocolDescriptionReply: 'ATDP\rISO 15765-4 CAN\r>',
    });
    assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED', raw);
    assert.equal(diagnosis.evidence.protocol, undefined);
  }
});
