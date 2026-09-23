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
  assert.match(panel, /TrustedCorrelationSession/);
  assert.match(panel, /validateTrustedIdentityCandidateEvent/);
  assert.match(panel, /prepareDesktopReadOnlyRequest/);
  assert.match(panel, /executeDesktopMe72Identity/);
  assert.match(panel, /executeDesktopMe72Roughness/);
  assert.match(panel, /executeDesktopMe72EngineSnapshot/);
  assert.match(panel, /deriveMe72EngineSnapshotFromEvidence/);
  assert.match(panel, /deriveMe72CylinderRoughnessFromEvidence/);
  assert.match(panel, /deriveMe72IdentityFromEvidence/);
  assert.match(panel, /consumeDesktopReadOnlyRequest/);
  assert.match(panel, /cancelDesktopReadOnlyRequest/);
  assert.match(panel, /attestDesktopIdentityContext/);
  assert.match(panel, /finalizeReadOnlyIdentity/);
  assert.match(panel, /RUN IDENTITY/);
  assert.match(panel, /hannaada:trusted-identity-candidate/);
  assert.match(panel, /confirmations.*\/2/);

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


test('trusted identity UI has no manual identity override or TX material field', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /data-desktop-pro-module-identity/);
  assert.doesNotMatch(panel, /<input[^>]+moduleIdentity/i);
  assert.doesNotMatch(panel, /requestBytes|txBytes|rawTx/);
  assert.match(panel, /REPEATED_CORRELATED_IDENTITY_CANDIDATE/);
  assert.match(panel, /LOCAL ATTEST/);
  assert.match(panel, /READ_ONLY_IDENTITY_VERIFIED po native attestation/);
  assert.match(panel, /ECU\/write\/flash nadal zablokowane/);
});


test('native open is gated to a USB candidate and canonical evidence is visible', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /evidence \$\{snap\?\.evidenceStage \|\| 'NO_CABLE'\}/);
  assert.match(panel, /boundClosed = stage === 'USB_CANDIDATE_BOUND' && snap\?\.kind === 'usb'/);
  assert.doesNotMatch(panel, /\['USB_CANDIDATE_BOUND','SERIAL_CANDIDATE_BOUND'\]\.includes\(stage\)/);
});


test('native broker and attestation are required before final identity', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /state\.brokerSnapshot = await prepareDesktopReadOnlyRequest/);
  assert.match(panel, /await consumeDesktopReadOnlyRequest\(plan\.epoch, plan\.requestId/);
  assert.match(panel, /data-desktop-pro-action="cancel-identity"/);
  assert.match(panel, /data-desktop-pro-action="attest-identity"/);
  assert.match(panel, /finalizeReadOnlyIdentity\(\{/);
  assert.doesNotMatch(panel, /identityVerified\s*=\s*true/);
});


test('control locking stays inside render scope', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /function applyControlLocks\(panel, \{ configured, finalized \}\)/);
  assert.match(panel, /applyControlLocks\(panel, \{ configured, finalized \}\);/);
  assert.doesNotMatch(panel, /requestSelectControl\.disabled/);
});

test('invalid trusted event does not desynchronize native and local request tokens', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /detail = validateTrustedIdentityCandidateEvent/);
  assert.match(panel, /return;\n\s*}\n\n\s*try \{\n\s*state\.brokerSnapshot = await consumeDesktopReadOnlyRequest/);
  assert.match(panel, /Native request broker odrzucił korelację/);
});


test('native receipt is mandatory before broker consume', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /state\.nativeReadReceipt = result\.nativeRequestReceipt \?\? null/);
  assert.match(panel, /Trusted identity event wymaga native receipt/);
  assert.match(panel, /expectedFrameHexes: state\.evidence\.frames\.map/);
  assert.match(panel, /consumeDesktopReadOnlyRequest\([\s\S]*state\.nativeReadReceipt/);
});


test('desktop identity UX blocks attestation without verified profile parser', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /isIdentityParserVerified/);
  assert.match(panel, /VERIFIED PROFILE PARSER REQUIRED/);
  assert.match(panel, /VERIFIED_PROFILE_PARSER_REQUIRED/);
});


test('ME7.2 RUN IDENTITY is automatic and parser-derived', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /executeDesktopMe72Identity\([\s\S]*localPlan\.epoch[\s\S]*localPlan\.requestId/);
  assert.match(panel, /state\.evidenceSession\.reset\(\)/);
  assert.match(panel, /deriveMe72IdentityFromEvidence\(state\.evidence\)/);
  assert.match(panel, /moduleIdentity: parsedIdentity\.fingerprint/);
  assert.match(panel, /consumeDesktopReadOnlyRequest\([\s\S]*state\.nativeReadReceipt/);
  assert.doesNotMatch(panel, /executeDesktopMe72Identity\([\s\S]{0,160}(bytes|payload|command)\s*:/);
});


test('Desktop PRO attach path is event-driven instead of subtree-observed', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /hannaada:cable-workbench-mounted/);
  assert.match(panel, /hannaada:module-rendered/);
  assert.doesNotMatch(panel, /new MutationObserver/);
});


test('roughness UI is gated by finalized identity and named native executor', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-action="read-roughness"/);
  assert.match(panel,/'read-roughness': state\.ready && configured && finalized/);
  assert.match(panel,/executeDesktopMe72Roughness\(state\.snapshot\.epoch, window\)/);
  assert.match(panel,/deriveMe72CylinderRoughnessFromEvidence\(state\.evidence\)/);
  assert.match(panel,/readonlyProfileId !== 'e39-me72-roughness-4003'/);
  assert.match(panel,/nativeIdentityFingerprint !== state\.identityResult\.moduleIdentity/);
  assert.match(panel,/Roughness sample #/);
  assert.doesNotMatch(panel,/executeDesktopMe72Roughness\([\s\S]{0,120}(payload|command|bytes)\s*:/);
});


test('Desktop PRO avoids rebuilding unchanged select options on every render', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /select\.dataset\.optionsKey !== portOptionsKey/);
  assert.match(panel, /requestSelect\.dataset\.optionsKey !== requestOptionsKey/);
  assert.match(panel, /select\.dataset\.optionsKey = portOptionsKey/);
  assert.match(panel, /requestSelect\.dataset\.optionsKey = requestOptionsKey/);
});


test('Desktop PRO releases trusted-event listener when leaving VCI', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /event\.detail\?\.module !== 'vci'/);
  assert.match(panel, /panelAbort\.abort\(\)/);
  assert.match(panel, /hannaada:module-rendered/);
});


test('engine snapshot UI is finalized-identity gated and provenance-bound', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-action="read-engine"/);
  assert.match(panel,/'read-engine': state\.ready && configured && finalized/);
  assert.match(panel,/executeDesktopMe72EngineSnapshot\(state\.snapshot\.epoch, window\)/);
  assert.match(panel,/deriveMe72EngineSnapshotFromEvidence\(state\.evidence\)/);
  assert.match(panel,/readonlyProfileId !== 'e39-me72-engine-snapshot-4000'/);
  assert.match(panel,/nativeIdentityFingerprint !== state\.identityResult\.moduleIdentity/);
  assert.match(panel,/Engine sample #/);
  assert.doesNotMatch(panel,/executeDesktopMe72EngineSnapshot\([\s\S]{0,120}(payload|command|bytes)\s*:/);
});
