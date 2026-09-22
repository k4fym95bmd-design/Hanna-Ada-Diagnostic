import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cableStatus, validateBridgeUrl, validateBridgeStatus } from '../public/cable-connection-model.js';
import { createCableBridge } from '../gateway/windows-cable-bridge.mjs';

const token = 'test-token-' + 'a'.repeat(40);
const origin = 'https://bmw.floot.app';
const serial = () => ({
  list: async () => [{ path: 'COM7', manufacturer: 'Test FTDI', vendorId: '0403', productId: '6001' }],
  createPort: path => {
    const p = new EventEmitter(); p.path = path; p.isOpen = false;
    p.open = cb => { p.isOpen = true; cb(null); };
    p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
    return p;
  },
});

test('USB port never implies ECU identity or write capability', () => {
  assert.equal(cableStatus({ cableDetected: true, portOpen: true }).stage, 'PORT_OPEN');
  assert.equal(cableStatus({ cableDetected: true, portOpen: true }).ecuVerified, false);
  const oldSession = { verified: true, sessionId: 'old-session-xxxxxxxxxx', moduleId: 'dme', identity: 'Bosch ME7.2' };
  assert.equal(cableStatus({ cableDetected: true, portOpen: true, sessionId: 'new-session-xxxxxxxxxx', ecuEvidence: oldSession }).ecuVerified, false);
  const verified = cableStatus({ cableDetected: true, portOpen: true, sessionId: oldSession.sessionId, ecuEvidence: oldSession });
  assert.equal(verified.ecuVerified, true);
  assert.equal(verified.writesEnabled, false);
  assert.equal(verified.flashEnabled, false);
  assert.throws(() => validateBridgeStatus({ version: 1, transport: 'physical-vci', cableDetected: true, portOpen: true, ecuVerified: true, writesEnabled: false, flashEnabled: false }));
});

test('bridge URL requires HTTPS remotely; rejects credentials, paths and queries', () => {
  assert.equal(validateBridgeUrl('https://pc.local:8765'), 'https://pc.local:8765');
  assert.equal(validateBridgeUrl('http://127.0.0.1:8765'), 'http://127.0.0.1:8765');
  for (const address of ['http://192.168.1.8:8765', 'https://a:secret@pc.local', 'https://pc.local/?token=secret', 'https://pc.local/v1']) {
    assert.throws(() => validateBridgeUrl(address), address);
  }
});

test('authenticated bridge lists and opens only enumerated ports and never exposes TX', async t => {
  assert.throws(() => createCableBridge({ serial: serial(), token, allowedOrigin: origin, host: '0.0.0.0' }), /HTTPS/);
  const bridge = createCableBridge({ serial: serial(), token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const url = `http://127.0.0.1:${bridge.server.address().port}`;
  async function ask(path, { method = 'GET', body, auth = token, source = origin } = {}) {
    const response = await fetch(url + path, { method, headers: { Origin: source, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { code: response.status, json: await response.json() };
  }
  assert.equal((await ask('/v1/ports', { auth: 'wrong' })).code, 401);
  assert.equal((await ask('/v1/ports', { source: 'https://evil.test' })).code, 403);
  assert.equal((await ask('/v1/ports')).json.ports[0].path, 'COM7');
  assert.equal((await ask('/v1/open', { method: 'POST', body: { path: 'COM99' } })).code, 404);
  const opened = await ask('/v1/open', { method: 'POST', body: { path: 'COM7' } });
  assert.equal(opened.code, 200);
  assert.equal(opened.json.portOpen, true);
  assert.equal(opened.json.ecuVerified, false);
  assert.equal(opened.json.writesEnabled, false);
  assert.equal((await ask('/v1/transmit', { method: 'POST', body: { bytes: [1, 2] } })).code, 404);
  assert.equal((await ask('/v1/open', { method: 'POST', body: { path: 'COM7' } })).code, 409);
  const closed = await ask('/v1/close', { method: 'POST', body: {} });
  assert.equal(closed.code, 200);
  assert.equal(closed.json.portOpen, false);
  assert.equal(closed.json.cableDetected, false);
});
