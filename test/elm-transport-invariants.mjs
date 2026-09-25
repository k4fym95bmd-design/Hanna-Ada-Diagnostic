import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};
globalThis.document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  documentElement: {},
};
globalThis.MutationObserver = class { observe() {} };
globalThis.performance = { now: () => Date.now() };

await import('../public/obd-runtime.js');
const HA = globalThis.window.HannaAdaOBD;

function resetHarness() {
  HA.pending = null;
  HA.buffer = '';
  HA.desynchronized = false;
  HA.connected = true;
  HA.adapter = true;
  HA.ecu = false;
  HA.write = null;
  HA.notify = null;
  HA.server = null;
  HA.device = null;
}

test('timeout desynchronizes ELM channel and blocks the next command', async () => {
  resetHarness();
  HA.write = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse() {},
  };

  await assert.rejects(() => HA.command('ATI', 5), /Timeout: ATI/);

  const started = Date.now();
  await assert.rejects(() => HA.command('ATDPN', 1000), /desynchron|reconnect/i);
  assert.ok(Date.now() - started < 100);
});

test('write failure desynchronizes ELM channel', async () => {
  resetHarness();
  HA.write = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse() { throw new Error('write failed'); },
  };

  await assert.rejects(() => HA.command('ATI', 1000), /write failed/);

  HA.write = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse() {},
  };

  const started = Date.now();
  await assert.rejects(() => HA.command('ATDPN', 1000), /desynchron|reconnect/i);
  assert.ok(Date.now() - started < 100);
});

test('disconnect rejects an in-flight command immediately and clears transport handles', async () => {
  resetHarness();
  HA.write = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse() {},
  };
  HA.notify = {};
  HA.server = {};
  HA.device = {};

  const pending = HA.command('ATI', 1000);
  await new Promise(resolve => setTimeout(resolve, 5));

  const started = Date.now();
  HA.disconnect();

  await assert.rejects(pending, /disconnect|cancel|closed/i);
  assert.ok(Date.now() - started < 100);
  assert.equal(HA.write, null);
  assert.equal(HA.notify, null);
  assert.equal(HA.server, null);
  assert.equal(HA.device, null);
  assert.equal(HA.pending, null);
});
