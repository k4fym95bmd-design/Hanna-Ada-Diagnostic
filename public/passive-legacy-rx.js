// Canonical passive legacy BMW framing shared by gateway, browser and desktop.
// This module is pure: no USB/serial handles and no TX path.
const hex = bytes => [...bytes].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

export class PassiveDs2Decoder {
  #pending = [];
  #rejected = 0;
  #observed = 0;
  #frames = [];
  #maxFrames;

  constructor({ maxFrames = 16 } = {}) {
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 64) {
      throw new TypeError('Invalid receive window');
    }
    this.#maxFrames = maxFrames;
  }

  ingest(data) {
    if (!(data instanceof Uint8Array)) throw new TypeError('Serial data must be bytes');
    if (data.length > 8192) {
      this.#pending = [];
      this.#rejected++;
      return;
    }
    this.#observed += data.length;

    for (const byte of data) {
      this.#pending.push(byte);
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
            this.#pending.shift();
            this.#rejected++;
            continue;
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

      if (this.#pending.length > 255) {
        this.#pending = [];
        this.#rejected++;
      }
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

  reset() {
    this.#pending = [];
    this.#rejected = 0;
    this.#observed = 0;
    this.#frames = [];
  }
}

export class PassiveKwpDecoder {
  #pending = [];
  #frames = [];
  #observed = 0;
  #rejected = 0;
  #maxFrames;

  constructor({ maxFrames = 16 } = {}) {
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 64) {
      throw new TypeError('Invalid receive window');
    }
    this.#maxFrames = maxFrames;
  }

  ingest(data) {
    if (!(data instanceof Uint8Array)) throw new TypeError('Serial data must be bytes');
    this.#observed += data.length;
    if (data.length > 8192) {
      this.#pending = [];
      this.#rejected++;
      return;
    }

    for (const byte of data) {
      this.#pending.push(byte);
      while (this.#pending.length) {
        if (this.#pending[0] !== 0xB8) {
          this.#pending.shift();
          this.#rejected++;
          continue;
        }
        if (this.#pending.length < 5) break;

        const payloadLength = this.#pending[3];
        if (payloadLength > 192) {
          this.#pending.shift();
          this.#rejected++;
          continue;
        }

        const frameLength = payloadLength + 5;
        if (this.#pending.length < frameLength) {
          const next = this.#findComplete(1);
          if (next > 0) {
            this.#pending.splice(0, next);
            this.#rejected += next;
            continue;
          }
          break;
        }

        const candidate = this.#pending.slice(0, frameLength);
        const check = candidate.slice(0, -1).reduce((xor, b) => xor ^ b, 0);
        if (check !== candidate[frameLength - 1]) {
          this.#pending.shift();
          this.#rejected++;
          continue;
        }

        this.#pending.splice(0, frameLength);
        const source = candidate[2];
        const destination = candidate[1];
        this.#frames.push(Object.freeze({
          frameHex: hex(candidate),
          sourceHex: hex([source]),
          destinationHex: hex([destination]),
          payloadLength,
          directionHint: source === 0x12 && destination === 0xF1 ? 'possible-reply'
            : source === 0xF1 && destination === 0x12 ? 'possible-echo'
              : 'unknown',
          ecuVerified: false,
        }));
        if (this.#frames.length > this.#maxFrames) this.#frames.shift();
      }

      if (this.#pending.length > 197) {
        this.#pending = [];
        this.#rejected++;
      }
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
    return Object.freeze({
      observedBytes: this.#observed,
      rejectedCandidates: this.#rejected,
      kwpFrames: this.#frames.map(frame => ({ ...frame })),
      ecuVerified: false,
    });
  }

  reset() {
    this.#pending = [];
    this.#frames = [];
    this.#observed = 0;
    this.#rejected = 0;
  }
}
