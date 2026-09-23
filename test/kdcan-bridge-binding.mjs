import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCableBridge } from '../gateway/windows-cable-bridge.mjs';

const token = 'kdcan-bridge-' + 'x'.repeat(40);
const origin = 'https://bmw.floot.app';

function mockSerial() {
  let descriptor = { path: 'COM7', manufacturer: 'USB Serial', vendorId: '0403', productId: '6001' };
  const ports = [];
  return {
    ports,
    setDescriptor(next) { descriptor = { ...next }; },
    list: async () => [descriptor],
    createPort: path => {
      const port = new EventEmitter();
      port.path = path;
      port.isOpen = false;
      port.open = cb => { port.isOpen = true; cb(null); };
      port.close = cb => { port.isOpen = false; port.emit('close'); cb?.(null); };
      ports.push(port);
      return port;
    },
  };
}

test('Windows bridge binds the open session to the observed photographed-cable USB identity', async t => {
  const serial = mockSerial();
  const bridge = createCableBridge({ serial, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = 'http://127.0.0.1:' + bridge.server.address().port;

  async function ask(path, { method = 'GET', body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { code: response.status, value: await response.json() };
  }

  const opened = await ask('/v1/open', { method: 'POST', body: { path: 'COM7' } });
  assert.equal(opened.code, 200);
  assert.equal(opened.value.portOpen, true);
  assert.equal(opened.value.cableBinding.vidPid, '0403:6001');
  assert.match(opened.value.cableBinding.chipsetCandidate, /FTDI/);
  assert.equal(opened.value.cableBinding.stage, 'PORT_OPEN');
  assert.equal(opened.value.cableBinding.serialDriverVerified, false);
  assert.equal(opened.value.cableBinding.bmwProtocolVerified, false);
  assert.equal(opened.value.cableBinding.ecuVerified, false);
  assert.equal(opened.value.cableBinding.writesEnabled, false);
  assert.equal((await ask('/v1/transmit', { method: 'POST', body: { bytes: [1] } })).code, 404);

  serial.setDescriptor({ path: 'COM7', manufacturer: 'Other USB Serial', vendorId: '10C4', productId: 'EA60' });
  const changed = await ask('/v1/status');
  assert.equal(changed.code, 200);
  assert.equal(changed.value.portOpen, true);
  assert.equal(changed.value.cableBinding, null);
  assert.equal(changed.value.ecuVerified, false);

  const closed = await ask('/v1/close', { method: 'POST', body: {} });
  assert.equal(closed.code, 200);
  assert.equal(closed.value.portOpen, false);
  assert.equal(closed.value.cableBinding, null);
});
