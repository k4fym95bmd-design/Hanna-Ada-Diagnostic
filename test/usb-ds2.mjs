import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { checksum, encodeFrame, decodeFrame, decodePositiveResponse, Ds2Error } from '../gateway/ds2.mjs';
import { UsbSerialTransport, UsbTransportError } from '../gateway/usb-serial.mjs';

class FakeSerial extends EventEmitter {
  constructor() { super(); this.isOpen = false; this.writes = []; this.onWrite = null; }
  open(callback) { this.isOpen = true; callback(null); }
  write(bytes, callback) { this.writes.push(Uint8Array.from(bytes)); callback(null); if (this.onWrite) this.onWrite(Uint8Array.from(bytes)); }
  close(callback) { this.isOpen = false; this.emit('close'); callback(null); }
  receive(bytes) { this.emit('data', Uint8Array.from(bytes)); }
}
const response = encodeFrame(0x12, Uint8Array.from([0xa0, 0x34, 0x35]));
const request = encodeFrame(0x12, Uint8Array.from([0x00]));
function fakeTransport(fake = new FakeSerial(), timeoutMs = 200) {
  const options = [];
  const transport = new UsbSerialTransport({ path: '/dev/ttyUSB0', timeoutMs, factory: (settings) => { options.push(settings); return fake; } });
  return { fake, transport, options };
}

test('DS2 known request vector, length and XOR checksum', () => {
  assert.deepEqual([...encodeFrame(0x12, Uint8Array.from([0x00]))], [0x12, 0x04, 0x00, 0x16]);
  assert.equal(checksum(Uint8Array.from([0x12, 0x04, 0x00])), 0x16);
  assert.deepEqual([...decodeFrame(request, 0x12).payload], [0x00]);
  assert.deepEqual([...decodePositiveResponse(response, 0x12)], [0x34, 0x35]);
});

test('DS2 rejects truncated, mismatched length, checksum, address and negative status', () => {
  assert.throws(() => decodeFrame(Uint8Array.of(0x12, 0x04)), Ds2Error);
  assert.throws(() => decodeFrame(Uint8Array.of(0x12, 0x05, 0x00, 0x16)), Ds2Error);
  assert.throws(() => decodeFrame(Uint8Array.of(0x12, 0x04, 0x00, 0x99)), Ds2Error);
  assert.throws(() => decodeFrame(request, 0x80), Ds2Error);
  assert.throws(() => decodePositiveResponse(encodeFrame(0x12, Uint8Array.of(0xff)), 0x12), Ds2Error);
  assert.throws(() => encodeFrame(0x12, new Uint8Array()), Ds2Error);
});

test('opens real USB-serial driver parameters rather than claiming ELM mode', async () => {
  const { transport, options } = fakeTransport();
  await transport.open();
  assert.equal(transport.isOpen, true);
  assert.deepEqual(options[0], { path: '/dev/ttyUSB0', baudRate: 9600, dataBits: 8, parity: 'even', stopBits: 1, autoOpen: false });
  await transport.close();
  assert.equal(transport.isOpen, false);
});

test('accepts chunked DS2 reply and drops exact local TX echo', async () => {
  const { fake, transport } = fakeTransport();
  await transport.open();
  fake.onWrite = tx => {
    fake.receive(tx.slice(0, 2));
    fake.receive(tx.slice(2));
    fake.receive(response.slice(0, 1));
    fake.receive(response.slice(1, 3));
    fake.receive(response.slice(3));
  };
  const received = await transport.exchangeDs2(request);
  assert.deepEqual([...received], [...response]);
  await transport.close();
});

test('rejects corrupt on-wire checksum and clears in-flight request', async () => {
  const { fake, transport } = fakeTransport();
  await transport.open();
  fake.onWrite = () => fake.receive(Uint8Array.of(0x12, 0x04, 0xa0, 0x00));
  await assert.rejects(transport.exchangeDs2(request), Ds2Error);
  fake.onWrite = () => fake.receive(response);
  assert.deepEqual([...await transport.exchangeDs2(request)], [...response]);
  await transport.close();
});

test('blocks concurrent transmissions, times out cleanly, then permits next request', async () => {
  const { fake, transport } = fakeTransport(new FakeSerial(), 100);
  await transport.open();
  const inFlight = transport.exchangeDs2(request);
  await assert.rejects(transport.exchangeDs2(request), UsbTransportError);
  await assert.rejects(inFlight, /timeout/);
  fake.onWrite = () => fake.receive(response);
  assert.deepEqual([...await transport.exchangeDs2(request)], [...response]);
  await transport.close();
});

test('disconnect rejects pending work; invalid transmit frames never reach USB', async () => {
  const { fake, transport } = fakeTransport();
  await transport.open();
  await assert.rejects(transport.exchangeDs2(Uint8Array.of(0x12, 0x04, 0x00, 0x00)), Ds2Error);
  assert.equal(fake.writes.length, 0);
  const pending = transport.exchangeDs2(request);
  fake.emit('close');
  await assert.rejects(pending, /connection lost/);
  assert.equal(transport.isOpen, false);
  await transport.close();
});
