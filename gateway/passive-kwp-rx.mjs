// Passive BMW KWP2000 serial framing for E39-era modules (e.g. ME7.2).
// B8 target source payloadLength payload... XOR. NEVER TX or mark ECU verified.
const hex = bytes => [...bytes].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

export class PassiveKwpDecoder {
  #pending = [];
  #frames = [];
  #observed = 0;
  #rejected = 0;
  #maxFrames;
  constructor({ maxFrames = 16 } = {}) {
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 64) throw new TypeError('Invalid receive window');
    this.#maxFrames = maxFrames;
  }
  ingest(data) {
    if (!(data instanceof Uint8Array)) throw new TypeError('Serial data must be bytes');
    this.#observed += data.length;
    if (data.length > 8192) { this.#pending = []; this.#rejected++; return; }
    for (const byte of data) {
      this.#pending.push(byte);
      while (this.#pending.length) {
        if (this.#pending[0] !== 0xB8) {
          this.#pending.shift(); this.#rejected++;
          continue;
        }
        if (this.#pending.length < 5) break;
        const payloadLength = this.#pending[3];
        // Cap diagnostics at 192 payload bytes. An untrusted length must not stall the stream.
        if (payloadLength > 192) { this.#pending.shift(); this.#rejected++; continue; }
        const frameLength = payloadLength + 5;
        if (this.#pending.length < frameLength) {
          const next = this.#findComplete(1);
          if (next > 0) { this.#pending.splice(0, next); this.#rejected += next; continue; }
          break;
        }
        const candidate = this.#pending.slice(0, frameLength);
        const check = candidate.slice(0, -1).reduce((xor, b) => xor ^ b, 0);
        if (check !== candidate[frameLength - 1]) {
          this.#pending.shift(); this.#rejected++;
          continue;
        }
        this.#pending.splice(0, frameLength);
        const source = candidate[2], destination = candidate[1];
        this.#frames.push(Object.freeze({
          frameHex: hex(candidate),
          sourceHex: hex([source]), destinationHex: hex([destination]),
          payloadLength,
          // Direction is a HINT only: receive data may contain an adapter echo.
          directionHint: source === 0x12 && destination === 0xF1 ? 'possible-reply'
            : source === 0xF1 && destination === 0x12 ? 'possible-echo' : 'unknown',
          ecuVerified: false,
        }));
        if (this.#frames.length > this.#maxFrames) this.#frames.shift();
      }
      if (this.#pending.length > 197) { this.#pending = []; this.#rejected++; }
    }
  }
  #findComplete(offset) {
    for (let i = offset; i <= this.#pending.length - 5; i++) {
      if (this.#pending[i] !== 0xB8) continue;
      const len = this.#pending[i + 3];
      if (len > 192 || i + len + 5 > this.#pending.length) continue;
      const end = i + len + 5;
      let xor = 0;
      for (let j = i; j < end - 1; j++) xor ^= this.#pending[j];
      if (xor === this.#pending[end - 1]) return i;
    }
    return -1;
  }
  snapshot() {
    return Object.freeze({ observedBytes: this.#observed, rejectedCandidates: this.#rejected,
      kwpFrames: this.#frames.map(f => ({ ...f })), ecuVerified: false });
  }
  reset() { this.#pending = []; this.#frames = []; this.#observed = this.#rejected = 0; }
}

export function attachPassiveKwpRx(port, decoder = new PassiveKwpDecoder()) {
  if (!port || typeof port.on !== 'function' || typeof port.removeListener !== 'function') throw new TypeError('Serial event source required');
  const onData = chunk => { try { decoder.ingest(chunk); } catch { decoder.reset(); } };
  port.on('data', onData);
  return Object.freeze({ snapshot: () => decoder.snapshot(), dispose: () => { port.removeListener('data', onData); decoder.reset(); } });
}
