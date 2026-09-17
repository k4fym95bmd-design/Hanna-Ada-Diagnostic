import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayProtocolError, LocalVciPort, validateGatewayHello } from '../gateway/port.mjs';

const hello = { version: 1, sessionId: 'valid-session-123456789', transport: 'physical-vci', hardwareId: 'ftdi:sample', capabilities: ['bmw-ds2'] };
const identity = {
  moduleId: 'ike', capability: 'bmw-ds2', readOnly: true,
  request: () => Uint8Array.from([0x80, 0x04, 0x01, 0x85]),
  validateResponse: (bytes) => bytes[0] === 0x80 && bytes[1] === 0x12 ? 'IKE test identity' : null,
};

test('a generic ELM handshake cannot claim physical BMW access', () => {
  assert.throws(() => validateGatewayHello({ ...hello, transport: 'elm327' }), GatewayProtocolError);
  assert.throws(() => validateGatewayHello({ ...hello, capabilities: ['bmw-ds2', 'fake'] }), GatewayProtocolError);
});

test('real response validation, not handshake, enables an individual module', async () => {
  const port = new LocalVciPort(async () => Uint8Array.from([0x80, 0x12]));
  port.connect(hello);
  assert.deepEqual(port.status().onlineModules, []);
  const result = await port.probeIdentity(identity);
  assert.equal(result.status, 'VERIFIED_ONLINE');
  assert.deepEqual(port.status().onlineModules, ['ike']);
  port.disconnect();
  assert.equal(port.status().connected, false);
  assert.deepEqual(port.status().onlineModules, []);
});

test('an unreadable response never marks the ECU online', async () => {
  const port = new LocalVciPort(async () => Uint8Array.from([0x00]));
  port.connect(hello);
  await assert.rejects(port.probeIdentity(identity), GatewayProtocolError);
  assert.deepEqual(port.status().onlineModules, []);
});

test('missing BMW physical capability and non-read-only probes are blocked', async () => {
  const port = new LocalVciPort(async () => { throw new Error('Must not transmit'); });
  port.connect({ ...hello, capabilities: ['generic-obd'] });
  await assert.rejects(port.probeIdentity(identity), GatewayProtocolError);
  port.connect(hello);
  await assert.rejects(port.probeIdentity({ ...identity, readOnly: false }), GatewayProtocolError);
  assert.deepEqual(port.status().onlineModules, []);
});

test('a disconnect during physical request invalidates the response', async () => {
  let resolve;
  const port = new LocalVciPort(() => new Promise(r => { resolve = r; }));
  port.connect(hello);
  const pending = port.probeIdentity(identity);
  port.disconnect();
  resolve(Uint8Array.from([0x80, 0x12]));
  await assert.rejects(pending, GatewayProtocolError);
  assert.deepEqual(port.status().onlineModules, []);
});
