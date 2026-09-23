// Node/gateway adapter around the canonical pure passive legacy decoders.
// No TX command path.
import { PassiveDs2Decoder, PassiveKwpDecoder } from '../public/passive-legacy-rx.js';

export { PassiveDs2Decoder };

// One physical port and ONE event listener, two independent, bounded framing
// interpretations. Neither interpreter can declare the BMW ECU online.
export function attachPassiveRx(port, decoder = new PassiveDs2Decoder(), kwp = new PassiveKwpDecoder()) {
  if (!port || typeof port.on !== 'function' || typeof port.removeListener !== 'function') {
    throw new TypeError('Serial event source required');
  }
  const onData = chunk => {
    try { decoder.ingest(chunk); } catch { decoder.reset(); }
    try { kwp.ingest(chunk); } catch { kwp.reset(); }
  };
  port.on('data', onData);
  return Object.freeze({
    snapshot: () => {
      const ds2 = decoder.snapshot();
      const k = kwp.snapshot();
      return {
        ...ds2,
        kwpFrames: k.kwpFrames,
        kwpRejectedCandidates: k.rejectedCandidates,
        ecuVerified: false,
      };
    },
    dispose: () => {
      port.removeListener('data', onData);
      decoder.reset();
      kwp.reset();
    },
  });
}
