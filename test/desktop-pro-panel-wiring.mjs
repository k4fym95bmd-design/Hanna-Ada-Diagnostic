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
  assert.match(panel, /executeDesktopMe72FuelAdaptation/);
  assert.match(panel, /executeDesktopMe72OutputStatus/);
  assert.match(panel, /deriveMe72OutputStatusFromEvidence/);
  assert.match(panel, /executeDesktopMe72Readiness/);
  assert.match(panel, /executeDesktopMe72DtcCount/);
  assert.match(panel, /deriveMe72DtcCountFromEvidence/);
  assert.match(panel, /summarizeMe72Capabilities/);
  assert.match(panel, /deriveMe72ReadinessFromEvidence/);
  assert.match(panel, /deriveMe72FuelAdaptationFromEvidence/);
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


test('fuel adaptation UI is finalized-identity gated and provenance-bound', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-action="read-fuel"/);
  assert.match(panel,/'read-fuel': state\.ready && configured && finalized/);
  assert.match(panel,/executeDesktopMe72FuelAdaptation\(state\.snapshot\.epoch, window\)/);
  assert.match(panel,/deriveMe72FuelAdaptationFromEvidence\(state\.evidence\)/);
  assert.match(panel,/readonlyProfileId !== 'e39-me72-fuel-adaptation-4004'/);
  assert.match(panel,/nativeIdentityFingerprint !== state\.identityResult\.moduleIdentity/);
  assert.match(panel,/Fuel adapt sample #/);
  assert.doesNotMatch(panel,/executeDesktopMe72FuelAdaptation\([\s\S]{0,120}(payload|command|bytes)\s*:/);
});


test('readiness UI is finalized-identity gated and provenance-bound', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-action="read-readiness"/);
  assert.match(panel,/'read-readiness': state\.ready && configured && finalized/);
  assert.match(panel,/executeDesktopMe72Readiness\(state\.snapshot\.epoch, window\)/);
  assert.match(panel,/deriveMe72ReadinessFromEvidence\(state\.evidence\)/);
  assert.match(panel,/readonlyProfileId !== 'e39-me72-readiness-4007'/);
  assert.match(panel,/nativeIdentityFingerprint !== state\.identityResult\.moduleIdentity/);
  assert.match(panel,/Readiness sample #/);
  assert.doesNotMatch(panel,/executeDesktopMe72Readiness\([\s\S]{0,120}(payload|command|bytes)\s*:/);
});


test('output status UI is finalized-identity gated and status-only', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-action="read-output-status"/);
  assert.match(panel,/'read-output-status': state\.ready && configured && finalized/);
  assert.match(panel,/executeDesktopMe72OutputStatus\(state\.snapshot\.epoch, window\)/);
  assert.match(panel,/deriveMe72OutputStatusFromEvidence\(state\.evidence\)/);
  assert.match(panel,/readonlyProfileId !== 'e39-me72-output-status-4005'/);
  assert.match(panel,/status-only\/read-only/);
  assert.doesNotMatch(panel,/executeDesktopMe72OutputStatus\([\s\S]{0,120}(payload|command|bytes|actuation|value)\s*:/);
  assert.doesNotMatch(panel,/name === 'read-fuel-adaptation'/);
});


test('DTC-count UI is finalized-identity gated and clear-DTC remains absent', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-action="read-dtc-count"/);
  assert.match(panel,/'read-dtc-count': state\.ready && configured && finalized/);
  assert.match(panel,/executeDesktopMe72DtcCount\(state\.snapshot\.epoch, window\)/);
  assert.match(panel,/deriveMe72DtcCountFromEvidence\(state\.evidence\)/);
  assert.match(panel,/readonlyProfileId !== 'e39-me72-dtc-count-a200'/);
  assert.match(panel,/nativeIdentityFingerprint !== state\.identityResult\.moduleIdentity/);
  assert.match(panel,/DTC count sample #/);
  assert.doesNotMatch(panel,/data-desktop-pro-action="clear-dtc"|desktop_clear_dtc|executeDesktop.*ClearDtc|clearDtc\s*:/i);
});


test('output status UI preserves post-cat heater mapping conflict', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/secondaryAirValve/);
  assert.match(panel,/secondaryAirPump/);
  assert.match(panel,/postCatHeaterBit40/);
  assert.match(panel,/postCatHeaterBit80/);
  assert.match(panel,/post-bank map CONFLICT/);
  assert.doesNotMatch(panel,/outputStatus\.oxygenHeaterAfterBank1/);
  assert.doesNotMatch(panel,/outputStatus\.oxygenHeaterAfterBank2/);
});


test('fuel adaptation is rendered once in Desktop PRO', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-fuel/);
  assert.doesNotMatch(panel,/data-desktop-pro-fuel-adaptation/);
  assert.equal((panel.match(/const fuel = state\.fuelAdaptation/g) || []).length,1);
  assert.equal((panel.match(/state\.fuelAdaptationSequence/g) || []).length > 0,true);
});


test('engine snapshot UI includes VANOS bank angles', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/camshaftIntakeBank1Deg/);
  assert.match(panel,/camshaftIntakeBank2Deg/);
  assert.match(panel,/VANOS B1/);
  assert.match(panel,/B2/);
});


test('capability matrix keeps full DTC list and clear-DTC visibly blocked', async () => {
  const panel = await readFile(new URL('../public/desktop-pro-panel.js', import.meta.url), 'utf8');
  assert.match(panel,/data-desktop-pro-capabilities/);
  assert.match(panel,/full DTC LIST BLOCKED/);
  assert.match(panel,/CLEAR DTC NOT EXPOSED/);
  assert.match(panel,/HARDWARE UNVERIFIED/);
});
