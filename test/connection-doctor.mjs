import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseConnection } from '../public/connection-doctor.js';

const base = {
  bluetoothPowered: true, adapterSeen: true, bleConnected: true,
  gattDiscovered: true, notificationsActive: true,
  adapterReply: 'ATI\rELM327 v2.2\r>',
  pid0100Reply: '41 00 80 00 00 00\r>',
  protocolReply: 'ATDPN\rA3\r>',
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

test('inline ATI ERROR never verifies an adapter or ECU when valid lines follow', () => {
  for (const adapterReply of [
    'ATI\rELM327 v2.2 ERROR\r>',
    'ATI\rELM327 v2.2\rBUS ERROR, retry\r>',
    'ATI\rCAN ERROR while identifying ELM327\r>',
  ]) {
    const diagnosis = diagnoseConnection({ ...base, adapterReply });
    assert.equal(diagnosis.code, 'ADAPTER_UNVERIFIED', adapterReply);
    assert.equal(diagnosis.evidence.genericECUVerified, undefined);
  }
});

test('only real, parsed 0100 and identified protocol verify generic ECU', () => {
  const unknown = diagnoseConnection({ ...base, protocolReply: null });
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
