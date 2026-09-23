import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cableStatus, nextBridgeFreshness, validateBridgeUrl, validateBridgeStatus } from '../public/cable-connection-model.js';
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


test('loss of VID PID metadata invalidates a previously bound session', async t => {
  let withIdentity = true;
  const serialState = {
    activePort:null,
    list: async () => [withIdentity
      ? { path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001', serialNumber:'stable-adapter' }
      : { path:'COM7', manufacturer:'FTDI', serialNumber:'stable-adapter' }],
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

  withIdentity = false;
  const status = await ask('/v1/status');
  assert.equal(status.json.portOpen, false);
  assert.equal(status.json.sessionId, null);
  assert.equal(status.json.cableBinding, null);
  assert.equal(serialState.activePort.isOpen, false);
});


test('bridge validator enforces evidence contract and monotonic freshness', () => {
  const instance = 'a'.repeat(32);
  const base = {
    version:1,
    transport:'physical-vci',
    bridgeInstanceId:instance,
    evidenceContractVersion:1,
    stateRevision:4,
    cableDetected:true,
    portOpen:true,
    sessionId:'b'.repeat(40),
    sessionEpoch:2,
    cableBinding:{ active:true, vidPid:'0403:6001' },
    evidence:{
      contractVersion:1,
      stage:'PORT_OPEN',
      nextGate:'COLLECT_RX',
      flags:[],
      cableDetected:true,
      hardwareBound:true,
      portOpen:true,
      qualifiedPortOpen:true,
      observedBytes:0,
      candidateFrames:0,
      ecuVerified:false,
      writesEnabled:false,
      flashEnabled:false,
    },
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
  };
  const accepted = validateBridgeStatus(base);
  assert.equal(accepted.evidenceStage, 'PORT_OPEN');
  const fresh = nextBridgeFreshness(null, base);
  assert.equal(fresh.stateRevision, 4);
  assert.throws(() => nextBridgeFreshness(fresh, { ...base, stateRevision:3 }), /przestarzały/i);
  const restarted = nextBridgeFreshness(fresh, { ...base, bridgeInstanceId:'c'.repeat(32), stateRevision:0, sessionEpoch:1 });
  assert.equal(restarted.stateRevision, 0);
  assert.throws(() => validateBridgeStatus({ ...base, evidence:{ ...base.evidence, stage:'READ_ONLY_IDENTITY_VERIFIED' } }), /dowod|status|transport/i);
});

test('failed passive monitor initialization closes the serial port and leaves no session', async t => {
  const serialState = {
    activePort:null,
    list: async () => [{ path:'COM7', manufacturer:'broken-source', vendorId:'0403', productId:'6001' }],
    createPort: path => {
      const p = {
        path,
        isOpen:false,
        on() {},
        open(cb) { this.isOpen = true; cb(null); },
        close(cb) { this.isOpen = false; cb?.(null); },
      };
      serialState.activePort = p;
      return p;
    },
  };
  const bridge = createCableBridge({ serial:serialState, token, allowedOrigin:origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const ask = async (path, options={}) => {
    const response = await fetch(base + path, {
      method:options.method || 'GET',
      headers:{ Origin:origin, Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      ...(options.body === undefined ? {} : { body:JSON.stringify(options.body) }),
    });
    return { code:response.status, json:await response.json() };
  };
  const opened = await ask('/v1/open', { method:'POST', body:{ path:'COM7' } });
  assert.equal(opened.code, 503);
  assert.equal(serialState.activePort.isOpen, false);
  const status = await ask('/v1/status');
  assert.equal(status.json.portOpen, false);
  assert.equal(status.json.sessionId, null);
  assert.equal(status.json.ecuVerified, false);
});


test('exact multi-origin CORS allows Windows and mobile clients without wildcard trust', async t => {
  const localOrigin = 'http://localhost:3000';
  const mobileOrigin = 'https://bmw.floot.app';
  const bridge = createCableBridge({
    serial: serial(),
    token,
    allowedOrigins: [localOrigin, mobileOrigin],
  });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;

  const ask = async source => {
    const response = await fetch(base + '/v1/capabilities', {
      headers: { Origin: source, Authorization: `Bearer ${token}` },
    });
    return {
      code: response.status,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      body: await response.json(),
    };
  };

  const local = await ask(localOrigin);
  assert.equal(local.code, 200);
  assert.equal(local.allowOrigin, localOrigin);
  assert.equal(local.body.trustedOriginCount, 2);

  const mobile = await ask(mobileOrigin);
  assert.equal(mobile.code, 200);
  assert.equal(mobile.allowOrigin, mobileOrigin);

  const evil = await ask('https://evil.test');
  assert.equal(evil.code, 403);
  assert.equal(evil.allowOrigin, null);
});

test('trusted origin configuration is exact bounded and rejects remote HTTP', () => {
  assert.throws(() => createCableBridge({
    serial: serial(), token, allowedOrigins: [],
  }), /1 and 4/i);
  assert.throws(() => createCableBridge({
    serial: serial(), token,
    allowedOrigins: [
      'https://one.test','https://two.test','https://three.test',
      'https://four.test','https://five.test',
    ],
  }), /1 and 4/i);
  assert.throws(() => createCableBridge({
    serial: serial(), token,
    allowedOrigins: ['http://192.168.1.20:3000'],
  }), /require HTTPS/i);
  assert.throws(() => createCableBridge({
    serial: serial(), token,
    allowedOrigins: ['https://bmw.floot.app/path'],
  }), /exact origin/i);
  assert.throws(() => createCableBridge({
    serial: serial(), token,
    allowedOrigins: ['https://user:secret@bmw.floot.app'],
  }), /exact origin/i);
});


test('concurrent bridge reads share one serial enumeration in flight', async t => {
  let calls = 0;
  let release;
  const serialState = {
    list: async () => {
      calls++;
      await new Promise(resolve => { release = resolve; });
      return [{ path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001' }];
    },
    createPort: path => {
      const p = new EventEmitter();
      p.path = path; p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      return p;
    },
  };
  const bridge = createCableBridge({ serial:serialState, token, allowedOrigin:origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const headers = { Origin:origin, Authorization:`Bearer ${token}` };

  const requests = Array.from({ length:8 }, () => fetch(base + '/v1/status', { headers }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  const responses = await Promise.all(requests);
  for (const response of responses) assert.equal(response.status, 200);

  const perf = bridge.getPerformance();
  assert.equal(perf.serialListCalls, 1);
  assert.ok(perf.serialListCoalesced >= 7);
});

test('serial enumeration coalescing does not cache across completed checks', async t => {
  let calls = 0;
  const serialState = {
    list: async () => {
      calls++;
      return [{ path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001' }];
    },
    createPort: path => {
      const p = new EventEmitter();
      p.path = path; p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      return p;
    },
  };
  const bridge = createCableBridge({ serial:serialState, token, allowedOrigin:origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;
  const headers = { Origin:origin, Authorization:`Bearer ${token}` };
  assert.equal((await fetch(base + '/v1/status', { headers })).status, 200);
  assert.equal((await fetch(base + '/v1/status', { headers })).status, 200);
  assert.equal(calls, 2, 'single-flight must not become stale caching');
});
