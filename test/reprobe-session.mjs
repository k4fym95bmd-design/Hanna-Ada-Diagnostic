import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiagnosticSession, reduceDiagnosticSession } from '../public/diagnostic-core.js';

const dispatch = (session, type, extra = {}) => reduceDiagnosticSession(session, { type, epoch: session.epoch, ...extra });

function verifiedCAN() {
  let session = createDiagnosticSession();
  session = dispatch(session, 'BLE_CONNECTED');
  session = dispatch(session, 'ADAPTER_IDENTIFIED', { identity: 'ELM327 v2.2' });
  session = dispatch(session, 'PID_RESPONSE', { raw: '41 00 80 00 00 00\r>' });
  session = dispatch(session, 'PROTOCOL_RESPONSE', { atdpnRaw: 'ATDPN\rA6\r>' });
  session = dispatch(session, 'DTC_RESPONSE', { raw: '43 00\r>' });
  assert.equal(session.protocol, 'can');
  assert.deepEqual(session.dtcs.codes, []);
  return session;
}

test('failed ECU reprobe clears previously verified vehicle bus and DTC evidence', () => {
  const failed = dispatch(verifiedCAN(), 'PID_RESPONSE', { raw: 'NO DATA\r>' });
  assert.equal(failed.stage, 'ADAPTER');
  assert.equal(failed.protocol, 'unknown');
  assert.equal(failed.protocolContract, null);
  assert.equal(failed.pids, null);
  assert.equal(failed.dtcs, null);
  assert.equal(failed.lastErrorCode, 'ADAPTER_ERROR');
});

test('successful reprobe requires new protocol evidence before unframed Mode 03', () => {
  const revalidated = dispatch(verifiedCAN(), 'PID_RESPONSE', { raw: '41 00 80 00 00 00\r>' });
  assert.equal(revalidated.stage, 'ECU');
  assert.equal(revalidated.protocol, 'unknown');
  assert.equal(revalidated.protocolContract, null);
  assert.equal(revalidated.dtcs, null);
  const attempted = dispatch(revalidated, 'DTC_RESPONSE', { raw: '43 00\r>' });
  assert.equal(attempted.dtcs, null);
  assert.equal(attempted.lastErrorCode, 'PROTOCOL_REQUIRED');
  const identified = dispatch(attempted, 'PROTOCOL_RESPONSE', { atdpnRaw: 'ATDPN\rA3\r>' });
  assert.equal(identified.protocol, 'legacy');
  const legacy = dispatch(identified, 'DTC_RESPONSE', { raw: '43 00 00\r>' });
  assert.deepEqual(legacy.dtcs.codes, []);
});

test('adapter stage does not accept bare ATI command echo or OK as identity', () => {
  const ble = dispatch(createDiagnosticSession(), 'BLE_CONNECTED');
  for (const identity of ['ATI', 'OK', 'SEARCHING...', ' ATI ']) {
    assert.equal(dispatch(ble, 'ADAPTER_IDENTIFIED', { identity }), ble, identity);
  }
  assert.equal(dispatch(ble, 'ADAPTER_IDENTIFIED', { identity: 'ELM327 v2.2' }).stage, 'ADAPTER');
});
