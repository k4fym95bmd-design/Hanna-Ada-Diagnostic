import { decodeFrame, Ds2Error } from './ds2.mjs';

export class UsbTransportError extends Error {
  constructor(message) { super(message); this.name = 'UsbTransportError'; }
}

// Uses the host operating system's USB-serial driver through serialport.
// This MUST execute on a USB-host device, not on Netlify/Railway or iPhone Safari.
// No vehicle wiring, chipset identification, ADS timing or BMW KWP is inferred.
export class UsbSerialTransport {
  #serial = null;
  #pending = null;
  #opened = false;
  #factory;

  constructor({ path, factory, timeoutMs = 2000 } = {}) {
    if (typeof path !== 'string' || !path.trim() || path.length > 260) throw new TypeError('Explicit serial port path required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) throw new RangeError('Invalid serial timeout');
    this.path = path;
    this.timeoutMs = timeoutMs;
    this.#factory = factory;
  }

  get isOpen() { return this.#opened; }

  async open() {
    if (this.#serial) throw new UsbTransportError('Serial port already opened or opening');
    const factory = this.#factory ?? ((options) => import('serialport').then(({ SerialPort }) => new SerialPort(options)));
    try {
      this.#serial = await factory({ path: this.path, baudRate: 9600, dataBits: 8, parity: 'even', stopBits: 1, autoOpen: false });
      if (!this.#serial || typeof this.#serial.on !== 'function' || typeof this.#serial.write !== 'function') throw new UsbTransportError('Invalid USB serial driver');
      this.#serial.on('data', (chunk) => this.#onData(chunk));
      this.#serial.on('error', (error) => this.#invalidate(error));
      this.#serial.on('close', () => this.#invalidate(new UsbTransportError('USB disconnected')));
      await new Promise((resolve, reject) => this.#serial.open((error) => error ? reject(error) : resolve()));
      this.#opened = true;
    } catch (error) {
      this.#serial = null;
      this.#opened = false;
      throw new UsbTransportError(`Unable to open USB serial port: ${error.message}`);
    }
  }

  #invalidate(error) {
    this.#opened = false;
    if (this.#pending) this.#finish(new UsbTransportError(`USB connection lost: ${error.message}`));
  }

  #finish(error, frame) {
    const job = this.#pending;
    if (!job) return;
    this.#pending = null;
    clearTimeout(job.timer);
    if (error) job.reject(error);
    else job.resolve(frame);
  }

  #onData(chunk) {
    const job = this.#pending;
    if (!job) return;
    if (!(chunk instanceof Uint8Array)) { this.#finish(new UsbTransportError('Non-binary serial response')); return; }
    const rx = new Uint8Array(job.buffer.length + chunk.length);
    rx.set(job.buffer);
    rx.set(chunk, job.buffer.length);
    if (rx.length > 4096) { this.#finish(new UsbTransportError('Serial buffer overflow')); return; }
    job.buffer = rx;
    while (this.#pending === job && job.buffer.length >= 2) {
      const length = job.buffer[1];
      if (length < 4) { this.#finish(new UsbTransportError('Invalid DS2 response length')); return; }
      if (job.buffer.length < length) return;
      const candidate = job.buffer.slice(0, length);
      job.buffer = job.buffer.slice(length);
      if (job.echo && candidate.length === job.tx.length && candidate.every((b, i) => b === job.tx[i])) { job.echo = false; continue; }
      try { decodeFrame(candidate, job.expectedAddress); }
      catch (error) { this.#finish(error); return; }
      this.#finish(null, candidate);
      return;
    }
  }

  // Internal frame-level interface. Never expose it directly to an internet endpoint.
  // All outgoing frames are strictly checked before reaching the USB driver.
  exchangeDs2(tx, { expectedAddress = tx?.[0], timeoutMs = this.timeoutMs } = {}) {
    if (!this.#opened || !this.#serial) return Promise.reject(new UsbTransportError('USB interface not open'));
    if (this.#pending) return Promise.reject(new UsbTransportError('Another diagnostic request is in progress'));
    if (!(tx instanceof Uint8Array)) return Promise.reject(new TypeError('Expected DS2 Uint8Array'));
    try { decodeFrame(tx); }
    catch (error) { return Promise.reject(error); }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) return Promise.reject(new RangeError('Invalid timeout'));
    return new Promise((resolve, reject) => {
      const job = { tx: Uint8Array.from(tx), expectedAddress, echo: true, buffer: new Uint8Array(), resolve, reject, timer: null };
      this.#pending = job;
      job.timer = setTimeout(() => this.#finish(new UsbTransportError('DS2 response timeout')), timeoutMs);
      try { this.#serial.write(Buffer.from(tx), (error) => { if (error) this.#finish(new UsbTransportError(`USB write failed: ${error.message}`)); }); }
      catch (error) { this.#finish(new UsbTransportError(`USB write failed: ${error.message}`)); }
    });
  }

  async close() {
    const serial = this.#serial;
    this.#serial = null;
    this.#invalidate(new UsbTransportError('USB port closed'));
    if (serial?.isOpen) await new Promise((resolve) => serial.close(() => resolve()));
  }
}

export async function listUsbSerialPorts() {
  const { SerialPort } = await import('serialport');
  return (await SerialPort.list()).map(({ path, manufacturer, vendorId, productId, serialNumber }) => ({ path, manufacturer, vendorId, productId, serialNumber }));
}
