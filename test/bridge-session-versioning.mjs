import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCableBridge } from '../gateway/windows-cable-bridge.mjs';

const token = 'bridge-version-test-' + 'x'.repeat(40);
const origin = 'https://bmw.floot.app';

function serial() {
  return {
    list: async () => [{
      path:'COM7',
      manufacturer:'FTDI',
      vendorId:'0403',
      productId:'6001',
      serialNumber:'adapter-one',
    }],
    createPort: path => {
      const p = new EventEmitter();
      p.path = path;
      p.isOpen = false;
      p.open = cb => { p.isOpen = true; cb(null); };
      p.close = cb => { p.isOpen = false; p.emit('close'); cb?.(null); };
      return p;
    },
  };
}

test('bridge session epochs and state revisions advance across reconnects', async t => {
  const bridge = createCableBridge({ serial:serial(), token, allowedOrigin:origin });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => bridge.server.close(resolve)));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;

  const ask = async (path, method='GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers:{ Origin:origin, Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      ...(body === undefined ? {} : { body:JSON.stringify(body) }),
    });
    return { code:response.status, json:await response.json() };
  };

  const cap = await ask('/v1/capabilities');
  assert.equal(cap.json.evidenceContractVersion, 1);
  assert.equal(cap.json.readOnly, true);

  const first = await ask('/v1/open', 'POST', { path:'COM7' });
  assert.equal(first.code, 200);
  assert.equal(first.json.sessionEpoch, 1);
  assert.ok(Number.isSafeInteger(first.json.stateRevision) && first.json.stateRevision >= 1);
  assert.equal(first.json.evidence.stage, 'PORT_OPEN');
  assert.equal(first.json.evidence.ecuVerified, false);
  const firstRevision = first.json.stateRevision;

  const snapshot = await ask('/v1/snapshot');
  assert.equal(snapshot.json.status.sessionEpoch, first.json.sessionEpoch);
  assert.equal(snapshot.json.status.stateRevision, firstRevision);
  assert.equal(snapshot.json.status.evidence.stage, 'PORT_OPEN');

  const closed = await ask('/v1/close', 'POST', {});
  assert.equal(closed.json.sessionEpoch, null);
  assert.ok(closed.json.stateRevision > firstRevision);
  const closedRevision = closed.json.stateRevision;

  const second = await ask('/v1/open', 'POST', { path:'COM7' });
  assert.equal(second.json.sessionEpoch, 2);
  assert.ok(second.json.stateRevision > closedRevision);
  assert.notEqual(second.json.sessionId, first.json.sessionId);
  assert.equal(second.json.ecuVerified, false);
  await ask('/v1/close', 'POST', {});
});

test('LAN bridge rejects an insecure browser origin even when TLS material is supplied', () => {
  assert.throws(() => createCableBridge({
    serial:serial(),
    token,
    allowedOrigin:'http://192.168.1.20:3000',
    host:'0.0.0.0',
    tls:{},
  }), /HTTPS browser origin/);
});
