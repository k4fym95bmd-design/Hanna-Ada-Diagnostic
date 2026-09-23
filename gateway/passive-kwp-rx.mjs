// Node/gateway adapter around the canonical pure passive KWP decoder.
// No TX and no ECU verification.
import { PassiveKwpDecoder } from '../public/passive-legacy-rx.js';

export { PassiveKwpDecoder };

export function attachPassiveKwpRx(port, decoder = new PassiveKwpDecoder()) {
  if (!port || typeof port.on !== 'function' || typeof port.removeListener !== 'function') {
    throw new TypeError('Serial event source required');
  }
  const onData = chunk => {
    try { decoder.ingest(chunk); } catch { decoder.reset(); }
  };
  port.on('data', onData);
  return Object.freeze({
    snapshot: () => decoder.snapshot(),
    dispose: () => {
      port.removeListener('data', onData);
      decoder.reset();
    },
  });
}
