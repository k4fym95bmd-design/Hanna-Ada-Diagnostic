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
  const forged = cableStatus({ cableDetected: true, portOpen: true, sessionId: oldSession.sessionId, ecuEvidence: oldSession });
  assert.equal(forged.ecuVerified, false);
  assert.equal(forged.stage, 'PORT_OPEN');
  assert.deepEqual(forged.bmwModulesVerified, []);
  assert.equal(forged.writesEnabled, false);
  assert.equal(forged.flashEnabled, false);
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
  const capabilities = await ask('/v1/capabilities');
  assert.equal(capabilities.code, 200);
  assert.equal(capabilities.json.readOnly, true);
  assert.equal(capabilities.json.atomicSnapshot, true);
  assert.equal(capabilities.json.arbitraryTx, false);
  assert.equal(capabilities.json.dtcErase, false);
  assert.equal(capabilities.json.flashing, false);
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


test('readiness endpoint keeps detection separate from ECU verification', async t => {
  const bridge = createCableBridge({ serial: serial(), token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const url = `http://127.0.0.1:${bridge.server.address().port}`;
  const response = await fetch(url + '/v1/readiness', {
    headers: { Origin: origin, Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.readOnly, true);
  assert.equal(body.arbitraryTx, false);
  assert.equal(body.ports[0].path, 'COM7');
  assert.equal(body.status.ecuVerified, false);
  assert.equal(body.status.writesEnabled, false);
});


test('missing enumerated device invalidates an active bridge session', async t => {
  let connected = true;
  const serialState = {
    activePort: null,
    list: async () => connected
      ? [{ path: 'COM7', manufacturer: 'Test FTDI', vendorId: '0403', productId: '6001' }]
      : [],
    createPort: path => {
      const p = new EventEmitter();
      p.path = path;
      p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      serialState.activePort = p;
      return p;
    },
  };
  const bridge = createCableBridge({ serial: serialState, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const url = `http://127.0.0.1:${bridge.server.address().port}`;
  const ask = async (path, options={}) => {
    const response = await fetch(url + path, {
      method: options.method || 'GET',
      headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { code: response.status, json: await response.json() };
  };

  const opened = await ask('/v1/open', { method:'POST', body:{ path:'COM7' } });
  assert.equal(opened.json.portOpen, true);
  connected = false;
  const status = await ask('/v1/status');
  assert.equal(status.json.cableDetected, false);
  assert.equal(status.json.portOpen, false);
  assert.equal(status.json.sessionId, null);
  assert.equal(status.json.ecuVerified, false);
  assert.equal(status.json.writesEnabled, false);
});


test('same COM with a different USB identity invalidates the active session', async t => {
  let productId = '6001';
  const serialState = {
    activePort: null,
    list: async () => [{ path:'COM7', manufacturer:'Test FTDI', vendorId:'0403', productId }],
    createPort: path => {
      const p = new EventEmitter();
      p.path = path; p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      serialState.activePort = p;
      return p;
    },
  };
  const bridge = createCableBridge({ serial: serialState, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const ask = async (path, options={}) => {
    const response = await fetch(base + path, {
      method: options.method || 'GET',
      headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { code:response.status, json:await response.json() };
  };

  const opened = await ask('/v1/open', { method:'POST', body:{ path:'COM7' } });
  assert.equal(opened.json.portOpen, true);
  assert.equal(opened.json.cableBinding.vidPid, '0403:6001');

  productId = '6010';
  const status = await ask('/v1/status');
  assert.equal(status.json.portOpen, false);
  assert.equal(status.json.cableDetected, false);
  assert.equal(status.json.sessionId, null);
  assert.equal(status.json.cableBinding, null);
  assert.equal(serialState.activePort.isOpen, false);
});

test('serial error event invalidates the session without leaving stale evidence', async t => {
  const serialState = {
    activePort:null,
    list: async () => [{ path:'COM7', manufacturer:'Test FTDI', vendorId:'0403', productId:'6001' }],
    createPort: path => {
      const p = new EventEmitter();
      p.path = path; p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      serialState.activePort = p;
      return p;
    },
  };
  const bridge = createCableBridge({ serial: serialState, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const ask = async (path, options={}) => {
    const response = await fetch(base + path, {
      method: options.method || 'GET',
      headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { code:response.status, json:await response.json() };
  };

  const opened = await ask('/v1/open', { method:'POST', body:{ path:'COM7' } });
  assert.equal(opened.json.portOpen, true);
  serialState.activePort.emit('error', new Error('simulated serial fault'));
  const status = await ask('/v1/status');
  assert.equal(status.json.portOpen, false);
  assert.equal(status.json.sessionId, null);
  assert.equal(status.json.cableBinding, null);
  assert.equal(status.json.ecuVerified, false);
});


test('same COM and VID PID but different hashed hardware identity invalidates the session', async t => {
  let serialNumber = 'adapter-A';
  const serialState = {
    activePort:null,
    list: async () => [{
      path:'COM7', manufacturer:'Test FTDI', vendorId:'0403', productId:'6001', serialNumber
    }],
    createPort: path => {
      const p = new EventEmitter();
      p.path = path; p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      serialState.activePort = p;
      return p;
    },
  };
  const bridge = createCableBridge({ serial: serialState, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const ask = async (path, options={}) => {
    const response = await fetch(base + path, {
      method: options.method || 'GET',
      headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { code:response.status, json:await response.json() };
  };

  const listed = await ask('/v1/ports');
  assert.match(listed.json.ports[0].hardwareFingerprint, /^[a-f0-9]{24}$/);
  assert.equal('serialNumber' in listed.json.ports[0], false);

  const opened = await ask('/v1/open', { method:'POST', body:{ path:'COM7' } });
  assert.equal(opened.json.portOpen, true);

  serialNumber = 'adapter-B';
  const status = await ask('/v1/status');
  assert.equal(status.json.portOpen, false);
  assert.equal(status.json.sessionId, null);
  assert.equal(status.json.cableBinding, null);
  assert.equal(serialState.activePort.isOpen, false);
});


test('readiness uses one serial enumeration snapshot for ports and status', async t => {
  let listCalls = 0;
  const serialState = {
    list: async () => {
      listCalls++;
      return [{ path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001', serialNumber:'one' }];
    },
    createPort: path => {
      const p = new EventEmitter();
      p.path = path; p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      return p;
    },
  };
  const bridge = createCableBridge({ serial: serialState, token, allowedOrigin: origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const response = await fetch(base + '/v1/readiness', {
    headers: { Origin: origin, Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(listCalls, 1);
  assert.equal(body.ports[0].path, 'COM7');
  assert.equal(body.status.ecuVerified, false);
});
