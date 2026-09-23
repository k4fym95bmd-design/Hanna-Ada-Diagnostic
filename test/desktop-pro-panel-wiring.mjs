import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Desktop PRO panel is wired into the canonical VCI shell without raw TX', async () => {
  const [index, panel] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8'),
  ]);

  assert.match(index, /desktop-pro-panel\.js/);
  assert.match(panel, /listDesktopSerialCandidates/);
  assert.match(panel, /bindDesktopSerialCandidate/);
  assert.match(panel, /openDesktopConfiguredPort/);
  assert.match(panel, /readDesktopBounded/);
  assert.match(panel, /DesktopReceiveEvidenceSession/);

  assert.doesNotMatch(panel, /desktop_write_serial|rawSerialWrite|\.write\(/);
  assert.doesNotMatch(panel, /codingEnabled\s*=\s*true|flashEnabled\s*=\s*true/);
});
