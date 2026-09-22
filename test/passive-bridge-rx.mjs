import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCableBridge } from '../gateway/windows-cable-bridge.mjs';

const token = 'cable-rx-test-' + 'b'.repeat(40);
const origin = 'https://bmw.floot.app';
const frame = Buffer.from([0x12, 0x04, 0x00, 0x16]);

function mockSerial() {
  const ports = [];
  return {
    ports,
    list: async () => [{ path: 'COM7', manufacturer: 'Test USB serial' }],
    createPort: path => {
      const port = new EventEmitter();
      port.path = path;
      port.isOpen = false;
      port.open = callback => { port.isOpen = true; callback(null); };
      port.close = callback => { port.isOpen = false; port.emit('close'); callback?.(null); };
      ports.push(port);
      return port;
    },
  };
}

test('only authorized session receives bounded passive RX; close clears stale frames and exposes no TX', async t => {
  const serial = mockSerial();
  const bridge = createCableBridge({ serial, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  async function ask(path, { method = 'GET', body, auth = token, source = origin } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { Origin: source, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { code: response.status, value: await response.json() };
  }
  assert.equal((await ask('/v1/rx', { auth: 'not-authorized' })).code, 401);
  assert.equal((await ask('/v1/rx', { source: 'https://other.example' })).code, 403);
  const before = await ask('/v1/rx');
  assert.equal(before.value.portOpen, false);
  assert.deepEqual(before.value.frames, []);

  const opened = await ask('/v1/open', { method: 'POST', body: { path: 'COM7' } });
  assert.equal(opened.code, 200);
  const initial = await ask('/v1/rx');
  assert.equal(initial.value.sessionId, opened.value.sessionId);
  assert.equal(initial.value.ecuVerified, false);
  assert.deepEqual(initial.value.frames, []);

  serial.ports[0].emit('data', frame.subarray(0, 2));
  serial.ports[0].emit('data', frame.subarray(2));
  const received = await ask('/v1/rx');
  assert.equal(received.code, 200);
  assert.equal(received.value.observedBytes, 4);
  assert.equal(received.value.frames[0].frameHex, '12 04 00 16');
  assert.equal(received.value.frames[0].ecuVerified, false);
  assert.equal(received.value.ecuVerified, false);
  assert.equal((await ask('/v1/transmit', { method: 'POST', body: { bytes: [0x12] } })).code, 404);

  await ask('/v1/close', { method: 'POST', body: {} });
  const closed = await ask('/v1/rx');
  assert.equal(closed.value.portOpen, false);
  assert.deepEqual(closed.value.frames, []);
  assert.equal(serial.ports[0].listenerCount('data'), 0);
  const reopened = await ask('/v1/open', { method: 'POST', body: { path: 'COM7' } });
  assert.notEqual(reopened.value.sessionId, opened.value.sessionId);
  assert.deepEqual((await ask('/v1/rx')).value.frames, []);
  await ask('/v1/close', { method: 'POST', body: {} });
});
