import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseConnection, isUsableAdapterIdentity } from '../public/connection-doctor.js';

const base = {
  bluetoothPowered: true, adapterSeen: true, bleConnected: true,
  gattDiscovered: true, notificationsActive: true,
  adapterReply: 'ATI\rELM327 v2.2\r>',
  pid0100Reply: '41 00 80 00 00 00\r>',
  atdpnReply: 'ATDPN\rA3\r>',
  atdpReply: 'ATDP\rAUTO, ISO 9141-2\r>',
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

test('adapter identity validator rejects echoes and failure markers before runtime promotion', () => {
  for (const raw of [null, '', 'ATI\r>', 'OK\r>', 'ERROR\r>', 'ATI\rERROR\r>', 'UNABLE TO CONNECT\r>', '?\r>']) {
    assert.equal(isUsableAdapterIdentity(raw), false, String(raw));
  }
  assert.equal(isUsableAdapterIdentity('ATI\rELM327 v2.2\r>'), true);
  assert.equal(isUsableAdapterIdentity('ATI\rOBDLink MX+\r>'), true);
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
  const unknown = diagnoseConnection({ ...base, atdpnReply: null });
  assert.equal(unknown.code, 'PROTOCOL_UNVERIFIED');
  assert.equal(unknown.evidence.genericECUVerified, true);
  const verified = diagnoseConnection(base);
  assert.equal(verified.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(verified.evidence.protocol, 'legacy');
  assert.equal(verified.evidence.protocolId, '3');
  assert.equal(verified.evidence.isAutoDetected, true);
  assert.equal(verified.evidence.sourceAuthority, 'ATDPN');
  assert.equal(verified.evidence.pidCount, 1);
  assert.equal(verified.bmwModulesVerified, false);
  assert.equal(verified.writesEnabled, false);
});

test('ATDP never overrides ATDPN authority and protocol A is not AUTO prefix', () => {
  const misleading = diagnoseConnection({
    ...base,
    atdpnReply: 'ATDPN\r3\r>',
    atdpReply: 'ATDP\rISO 15765-4 CAN\r>',
  });
  assert.equal(misleading.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(misleading.evidence.protocol, 'legacy');
  assert.equal(misleading.evidence.protocolId, '3');

  const j1939 = diagnoseConnection({
    ...base,
    atdpnReply: 'ATDPN\rA\r>',
    atdpReply: 'ATDP\rSAE J1939 CAN\r>',
  });
  assert.equal(j1939.code, 'PROTOCOL_UNSUPPORTED_FOR_GENERIC_OBD');
  assert.equal(j1939.evidence.protocolId, 'A');
  assert.equal(j1939.evidence.isAutoDetected, false);
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
