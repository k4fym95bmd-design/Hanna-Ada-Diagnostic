import { PassiveDs2Decoder, PassiveKwpDecoder } from './passive-legacy-rx.js';
import { deriveTransportEvidence, validateTransportEvidenceEnvelope } from './evidence-contract.js';
import { validateDesktopReadResult } from './desktop-host-bridge.js';

export class DesktopReceiveEvidenceSession {
  #epoch;
  #protocol;
  #decoder;

  constructor({ epoch, protocol, maxFrames = 16 } = {}) {
    if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
    if (!['DS2', 'KWP2000_BMW'].includes(protocol)) throw new TypeError('Invalid protocol');
    this.#epoch = epoch;
    this.#protocol = protocol;
    this.#decoder = protocol === 'DS2'
      ? new PassiveDs2Decoder({ maxFrames })
      : new PassiveKwpDecoder({ maxFrames });
  }

  ingest(readResult) {
    const read = validateDesktopReadResult(readResult);
    if (read.epoch !== this.#epoch) throw new TypeError('Read epoch mismatch');
    if (read.protocol !== this.#protocol) throw new TypeError('Read protocol mismatch');

    if (read.stage === 'READ_BYTES' && read.bytes.length) {
      this.#decoder.ingest(Uint8Array.from(read.bytes));
    }

    const snapshot = this.#decoder.snapshot();
    const frames = this.#protocol === 'DS2'
      ? snapshot.frames
      : snapshot.kwpFrames;

    const transport = validateTransportEvidenceEnvelope(deriveTransportEvidence({
      cableDetected: true,
      hardwareBound: true,
      portOpen: true,
      observedBytes: snapshot.observedBytes,
      candidateFrames: frames.length,
    }));

    return Object.freeze({
      epoch: this.#epoch,
      protocol: this.#protocol,
      stage: transport.stage,
      nextGate: transport.nextGate,
      observedBytes: transport.observedBytes,
      candidateFrames: transport.candidateFrames,
      frames: Object.freeze(frames.map(frame => Object.freeze({ ...frame }))),
      rejectedCandidates: snapshot.rejectedCandidates,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  reset() {
    this.#decoder.reset();
  }
}
