import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../public/cable-rx-panel.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../gateway/windows-cable-bridge.mjs', import.meta.url), 'utf8');

test('session health UI uses payload-free telemetry endpoint', () => {
  assert.match(panel, /data-cable-health-read/);
  assert.match(panel, /\/v1\/telemetry/);
  assert.match(panel, /candidateFrames !== data\.ds2FrameCount \+ data\.kwpFrameCount/);
  assert.match(panel, /ECU nadal niepotwierdzone/);
});

test('health UI and bridge expose no command route', () => {
  assert.doesNotMatch(panel, /\/v1\/(?:transmit|write|erase|flash|coding|actuat)/i);
  assert.doesNotMatch(bridge, /route === ['"]\/v1\/(?:transmit|write|erase|flash|coding|actuat)/i);
  assert.match(bridge, /route === '\/v1\/telemetry'/);
});
