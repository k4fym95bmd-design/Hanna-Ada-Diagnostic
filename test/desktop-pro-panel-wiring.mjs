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
  assert.match(panel, /read-only-request-registry/);
  assert.match(panel, /instantiateReadOnlyRequest/);
  assert.match(panel, /PLAN IDENTITY/);

  assert.doesNotMatch(panel, /desktop_write_serial|rawSerialWrite|\.write\(/);
  assert.doesNotMatch(panel, /requestBytes|txBytes\s*:/);
  assert.doesNotMatch(panel, /codingEnabled\s*=\s*true|flashEnabled\s*=\s*true/);
});


test('Desktop PRO panel gates actions by transport stage instead of enabling everything', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /const actions = \{/);
  assert.match(panel, /read: state\.ready && configured && !!state\.evidenceSession/);
  assert.match(panel, /open: state\.ready && boundClosed/);
  assert.match(panel, /close: state\.ready && \['PORT_OPEN','PORT_CONFIGURED'\]\.includes\(stage\)/);
  assert.match(panel, /Zamknij i otwórz ponownie/);
});


test('identity planning controls actually exist and are stage-gated', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /data-desktop-pro-request/);
  assert.match(panel, /data-desktop-pro-request-plan/);
  assert.match(panel, /data-desktop-pro-action="plan-identity"/);
  assert.match(panel, /'plan-identity': state\.ready && configured/);
  assert.match(panel, /requestOperationId = state\.requestOptions\.find\(item => item\.protocol === state\.protocol\)/);
});
