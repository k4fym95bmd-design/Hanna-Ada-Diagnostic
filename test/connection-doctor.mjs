import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseConnection } from '../public/connection-doctor.js';

const base = Object.freeze({
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

test('triage stops at the first unverified stage', () => {
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

test('adapter identity containing any ERROR is rejected', () => {
  for (const adapterReply of [
    'ERROR',
    'ATI\rERROR\r>',
    'ATI\rELM327 v2.2\rERROR\r>',
    'ATI\rERROR\rELM327 v2.2\r>',
    'ATI\nELM327 v2.2\n error \n>',
  ]) {
    const diagnosis = diagnoseConnection({ ...base, adapterReply });
    assert.equal(diagnosis.code, 'ADAPTER_UNVERIFIED');
    assert.equal(diagnosis.evidence.genericECUVerified, undefined);
  }
});

test('verified generic OBD evidence contains ATDPN authority only', () => {
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

test('ATDP label never substitutes for invalid ATDPN', () => {
  for (const protocolReply of [
    null,
    '',
    'ATDP\rISO 15765-4 CAN\r>',
    'ATDPN\r?\r>',
    'ATDPN\rERROR\r>',
    'ATDPN\rA6\r3\r>',
  ]) {
    const diagnosis = diagnoseConnection({
      ...base,
      protocolReply,
      protocolDescriptionReply: 'ATDP\rAUTO, ISO 15765-4 CAN\r>',
    });
    assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED');
    assert.equal(diagnosis.evidence.protocol, undefined);
    assert.equal(diagnosis.evidence.protocolId, undefined);
    assert.equal(diagnosis.evidence.sourceAuthority, undefined);
  }
});

test('valid ATDPN remains authoritative when ATDP label is missing or broken', () => {
  for (const protocolDescriptionReply of [
    null,
    '',
    'ATDP\rERROR\r>',
    'ATDP\r?\r>',
  ]) {
    const diagnosis = diagnoseConnection({
      ...base,
      protocolReply: 'ATDPN\rA6\r>',
      protocolDescriptionReply,
    });
    assert.equal(diagnosis.code, 'GENERIC_OBD_VERIFIED');
    assert.equal(diagnosis.evidence.protocol, 'can');
    assert.equal(diagnosis.evidence.protocolId, '6');
    assert.equal(diagnosis.evidence.sourceAuthority, 'ATDPN');
  }
});

test('unsupported ATDPN A/B/C stays unverified for generic framing', () => {
  for (const protocolReply of ['ATDPN\rA\r>', 'ATDPN\rB\r>', 'ATDPN\rC\r>']) {
    const diagnosis = diagnoseConnection({ ...base, protocolReply });
    assert.equal(diagnosis.code, 'PROTOCOL_UNVERIFIED');
    assert.equal(diagnosis.evidence.protocol, undefined);
  }
});

test('conflicting or truncated ECU replies never create online status', () => {
  const invalid = diagnoseConnection({
    ...base,
    pid0100Reply: '41 00 80 00 00 00\r41 00 80 00\r>',
  });
  assert.equal(invalid.code, 'ECU_RESPONSE_INVALID');
  assert.equal(invalid.evidence.parserError, 'TRUNCATED');

  const multiple = diagnoseConnection({
    ...base,
    pid0100Reply: '41 00 80 00 00 00\r41 00 00 00 00 01\r>',
  });
  assert.equal(multiple.code, 'GENERIC_OBD_VERIFIED');
  assert.equal(multiple.evidence.responderCount, 2);
});

test('connection summary excludes raw adapter and vehicle identifiers', () => {
  const marker = 'SECRET-VIN-WOULD-NOT-BE-EXPORTED';
  const summary = diagnoseConnection({ ...base, adapterReply: `ATI\r${marker}\r>` });
  assert.equal(JSON.stringify(summary).includes(marker), false);
  assert.equal(summary.bmwModulesVerified, false);
});

test('input validation is fail-closed', () => {
  assert.throws(() => diagnoseConnection(null), TypeError);
  assert.throws(() => diagnoseConnection([]), TypeError);
});
