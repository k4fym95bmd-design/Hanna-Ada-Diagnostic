import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMode01PidData, DiagnosticError } from '../public/diagnostic-core.js';

function rejectsCode(run, code) {
  assert.throws(run, error => error instanceof DiagnosticError && error.code === code);
}

test('strict Mode 01 scalar parser accepts only a response beginning with 41 + requested PID', () => {
  const valid = decodeMode01PidData('41 0C 1A F8\r>', 0x0C, 2);
  assert.deepEqual(valid.data, [0x1A, 0xF8]);
  assert.equal(valid.responderCount, 1);

  rejectsCode(
    () => decodeMode01PidData('41 05 00 41 0C 1A F8\r>', 0x0C, 2),
    'NO_ECU_RESPONSE',
  );
});

test('strict Mode 01 scalar parser rejects truncation, extra bytes and ambiguous responders', () => {
  rejectsCode(() => decodeMode01PidData('41 0C 1A\r>', 0x0C, 2), 'TRUNCATED');
  rejectsCode(() => decodeMode01PidData('41 0C 1A F8 00\r>', 0x0C, 2), 'INVALID_LENGTH');
  rejectsCode(
    () => decodeMode01PidData('41 0C 1A F8\r41 0C 1A F9\r>', 0x0C, 2),
    'AMBIGUOUS_RESPONDERS',
  );
});

globalThis.window = {};
globalThis.document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  documentElement: {},
};
globalThis.MutationObserver = class { observe() {} };
globalThis.performance = { now: () => Date.now() };
globalThis.Element = class {};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let rxListener = null;
let rpmReply = '41 0C 1A F8\r>';

const replies = new Map([
  ['ATZ', 'ELM327 v1.5\r>'],
  ['ATE0', 'OK\r>'],
  ['ATL0', 'OK\r>'],
  ['ATS0', 'OK\r>'],
  ['ATH0', 'OK\r>'],
  ['ATAT1', 'OK\r>'],
  ['ATSTFF', 'OK\r>'],
  ['ATSP0', 'OK\r>'],
  ['ATI', 'ELM327 v1.5\r>'],
  ['0100', '41 00 00 10 00 00\r>'],
  ['ATDPN', 'A6\r>'],
  ['ATDP', 'AUTO, ISO 15765-4 CAN\r>'],
  ['ATRV', '12.4V\r>'],
]);

const notify = {
  value: new Uint8Array(),
  async startNotifications() { return this; },
  addEventListener(type, listener) {
    if (type === 'characteristicvaluechanged') rxListener = listener;
  },
  removeEventListener() {},
  async stopNotifications() {},
};

const write = {
  properties: { writeWithoutResponse: true },
  async writeValueWithoutResponse(bytes) {
    const command = decoder.decode(bytes).replace(/\r$/, '');
    const response = command === '010C' ? rpmReply : replies.get(command);
    if (response == null) throw new Error('No fake response for ' + command);
    queueMicrotask(() => {
      notify.value = encoder.encode(response);
      rxListener?.({ target: notify });
    });
  },
};

const service = {
  async getCharacteristic(uuid) {
    return uuid.includes('fff1') ? notify : write;
  },
};
const server = { async getPrimaryService() { return service; } };
const device = {
  name: 'ELM327 TEST',
  gatt: { async connect() { return server; }, disconnect() {} },
  addEventListener() {},
};

Object.defineProperty(globalThis, 'navigator', {
  value: { bluetooth: { async requestDevice() { return device; } } },
  configurable: true,
});

await import('../public/obd-runtime.js');
const HA = globalThis.window.HannaAdaOBD;

test('browser runtime decodes valid RPM only after strict ECU + ATDPN verification', async () => {
  await HA.connect();
  assert.equal(HA.ecu, true);
  assert.equal(HA.supported.has(0x0C), true);
  assert.equal(await HA.readPid('rpm'), 1726);
});

test('browser runtime rejects an embedded fake RPM marker in another PID payload', async () => {
  rpmReply = '41 05 00 41 0C 1A F8\r>';
  await assert.rejects(
    () => HA.readPid('rpm'),
    /NO_ECU_RESPONSE|INVALID|TRUNCATED|AMBIGUOUS|PID/i,
  );
});
