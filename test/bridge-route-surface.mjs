import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../gateway/windows-cable-bridge.mjs', import.meta.url), 'utf8');

test('Windows bridge HTTP surface is a fixed read-only allowlist', () => {
  const routes = [...source.matchAll(/route === ['"]([^'"]+)['"]/g)].map(match => match[1]);
  const unique = [...new Set(routes)].sort();
  assert.deepEqual(unique, [
    '/v1/capabilities',
    '/v1/close',
    '/v1/open',
    '/v1/ports',
    '/v1/readiness',
    '/v1/rx',
    '/v1/snapshot',
    '/v1/status',
    '/v1/telemetry',
  ].sort());
  assert.doesNotMatch(source, /route === ['"]\/v1\/(?:transmit|write|erase|flash|coding|actuat|raw)/i);
});
