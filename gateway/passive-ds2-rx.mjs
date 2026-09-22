// Passive BMW DS2 receive framing. No USB access and NO TX command path.
// A correct frame may be a loopback echo or unrelated traffic: NEVER prove ECU online.
const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');

export class PassiveDs2Decoder {
  #pending = [];
  #rejected = 0;
  #observed = 0;
  #frames = [];
  #maxFrames;

  constructor({ maxFrames = 16 } = {}) {
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 64) throw new TypeError('Invalid receive window');
    this.#maxFrames = maxFrames;
  }

  ingest(data) {
    if (!(data instanceof Uint8Array)) throw new TypeError('Serial data must be bytes');
    // Reject oversized chunks rather than accumulating potentially unbounded data.
    if (data.length > 8192) { this.#pending = []; this.#rejected++; return; }
    this.#observed += data.length;
    for (const byte of data) {
      this.#pending.push(byte);
      // Search valid frame boundaries even when a leading noise byte advertises
      // a plausible but incomplete length (which would otherwise stall parsing).
      while (this.#pending.length >= 4) {
        let start = -1;
        let end = -1;
        for (let offset = 0; offset <= this.#pending.length - 4; offset++) {
          const length = this.#pending[offset + 1];
          if (length < 4 || length > this.#pending.length - offset) continue;
          let checksum = 0;
          for (let i = offset; i < offset + length - 1; i++) checksum ^= this.#pending[i];
          if (checksum === this.#pending[offset + length - 1]) {
            start = offset;
            end = offset + length;
            break;
          }
        }
        if (start < 0) {
          if (this.#pending[1] < 4 || this.#pending.length >= this.#pending[1]) {
            this.#pending.shift(); this.#rejected++; continue;
          }
          break;
        }
        const candidate = this.#pending.slice(start, end);
        this.#rejected += start;
        this.#pending.splice(0, end);
        this.#frames.push(Object.freeze({
          addressHex: candidate[0].toString(16).padStart(2, '0').toUpperCase(),
          length: candidate.length,
          frameHex: hex(candidate),
          ecuVerified: false,
        }));
        if (this.#frames.length > this.#maxFrames) this.#frames.shift();
      }
      if (this.#pending.length > 255) { this.#pending = []; this.#rejected++; }
    }
  }

  snapshot() {
    return Object.freeze({
      observedBytes: this.#observed,
      rejectedCandidates: this.#rejected,
      frames: this.#frames.map(frame => ({ ...frame })),
      ecuVerified: false,
    });
  }

  reset() { this.#pending = []; this.#rejected = 0; this.#observed = 0; this.#frames = []; }
}

export function attachPassiveRx(port, decoder = new PassiveDs2Decoder()) {
  if (!port || typeof port.on !== 'function' || typeof port.removeListener !== 'function') throw new TypeError('Serial event source required');
  const onData = chunk => { try { decoder.ingest(chunk); } catch { decoder.reset(); } };
  port.on('data', onData);
  return Object.freeze({
    snapshot: () => decoder.snapshot(),
    dispose: () => { port.removeListener('data', onData); decoder.reset(); },
  });
}
