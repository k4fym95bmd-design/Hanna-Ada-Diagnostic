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

test('a reused remote session ID cannot authenticate a stale response', async () => {
  let resolve;
  const port = new LocalVciPort(() => new Promise(r => { resolve = r; }));
  port.connect(hello);
  const oldProbe = port.probeIdentity(identity);
  port.disconnect();
  port.connect(hello); // Peer reused an identical session ID after reconnect.
  resolve(Uint8Array.from([0x80, 0x12]));
  await assert.rejects(oldProbe, GatewayProtocolError);
  assert.equal(port.status().connected, true);
  assert.deepEqual(port.status().onlineModules, []);
});

test('concurrent probes are rejected rather than interleaving the vehicle bus', async () => {
  let resolve;
  let exchangeCount = 0;
  const port = new LocalVciPort(() => {
    exchangeCount++;
    return new Promise(r => { resolve = r; });
  });
  port.connect(hello);
  const first = port.probeIdentity(identity);
  await assert.rejects(port.probeIdentity({ ...identity, moduleId: 'dme' }), /busy/);
  assert.equal(exchangeCount, 1);
  resolve(Uint8Array.from([0x80, 0x12]));
  await first;
  assert.deepEqual(port.status().onlineModules, ['ike']);
});

test('disconnect and reconnect cannot overlap an unresolved hardware exchange', async () => {
  let resolveOld;
  let exchanges = 0;
  const port = new LocalVciPort(() => {
    exchanges++;
    return exchanges === 1
      ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve(Uint8Array.from([0x80, 0x12]));
  });
  port.connect(hello);
  const stale = port.probeIdentity(identity);
  port.disconnect();
  port.connect(hello); // Even reusing the peer session ID cannot release physical bus ownership.
  assert.equal(port.status().busBusy, true);
  await assert.rejects(port.probeIdentity({ ...identity, moduleId: 'dme' }), /busy/);
  assert.equal(exchanges, 1);
  resolveOld(Uint8Array.from([0x80, 0x12]));
  await assert.rejects(stale, GatewayProtocolError);
  assert.equal(port.status().busBusy, false);
  assert.deepEqual(port.status().onlineModules, []);
  assert.equal((await port.probeIdentity(identity)).status, 'VERIFIED_ONLINE');
  assert.equal(exchanges, 2);
});

test('request factory cannot run a reentrant probe before bus ownership is acquired', async () => {
  let reentrant;
  let exchanges = 0;
  const port = new LocalVciPort(async () => {
    exchanges++;
    return Uint8Array.from([0x80, 0x12]);
  });
  port.connect(hello);
  const first = port.probeIdentity({
    ...identity,
    request: () => {
      reentrant = port.probeIdentity({ ...identity, moduleId: 'dme' });
      return identity.request();
    },
  });
  await assert.rejects(reentrant, /busy/);
  assert.equal((await first).status, 'VERIFIED_ONLINE');
  assert.equal(exchanges, 1);
});

test('session change inside request factory blocks transmission and releases bus', async () => {
  let exchanges = 0;
  const port = new LocalVciPort(async () => {
    exchanges++;
    return Uint8Array.from([0x80, 0x12]);
  });
  port.connect(hello);
  await assert.rejects(port.probeIdentity({
    ...identity,
    request: () => {
      port.disconnect();
      port.connect(hello);
      return identity.request();
    },
  }), /session changed/);
  assert.equal(exchanges, 0);
  assert.equal(port.status().busBusy, false);
  assert.equal((await port.probeIdentity(identity)).status, 'VERIFIED_ONLINE');
});

test('invalid request bytes release bus without transmitting', async () => {
  let exchanges = 0;
  const port = new LocalVciPort(async () => {
    exchanges++;
    return Uint8Array.from([0x80, 0x12]);
  });
  port.connect(hello);
  await assert.rejects(port.probeIdentity({ ...identity, request: () => new Uint8Array() }), /Invalid request frame/);
  assert.equal(exchanges, 0);
  assert.equal(port.status().busBusy, false);
  assert.equal((await port.probeIdentity(identity)).status, 'VERIFIED_ONLINE');
});

test('exchange failure releases the bus for a later probe', async () => {
  let calls = 0;
  const port = new LocalVciPort(async () => {
    if (++calls === 1) throw new Error('temporary transport failure');
    return Uint8Array.from([0x80, 0x12]);
  });
  port.connect(hello);
  await assert.rejects(port.probeIdentity(identity), /temporary transport failure/);
  const result = await port.probeIdentity(identity);
  assert.equal(result.status, 'VERIFIED_ONLINE');
  assert.equal(calls, 2);
});
