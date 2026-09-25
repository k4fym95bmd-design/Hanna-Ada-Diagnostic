import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads the read-only gate and ATDPN-based diagnostic extension', async () => {
  const html = await source('public/index.html');
  assert.match(html, /src="\/terminal-readonly-guard\.js"/);
  assert.match(html, /src="\/diagnostic-core-v2\.js"/);

  const extension = await source('public/diagnostic-core-v2.js');
  assert.match(extension, /resolveProtocolAuthority/);
  assert.match(extension, /protocolKindFromAuthority/);
  assert.match(extension, /readOnlyCommand/);
  assert.match(extension, /send\('ATDPN'/);
  assert.match(extension, /decodeStoredDTCs\(raw, protocol\)/);
  assert.doesNotMatch(extension, /h\.command\(/);
  assert.doesNotMatch(extension, /classifyVehicleProtocol/);
  assert.match(extension, /Niezweryfikowany odczyt DTC/);
});

test('runtime does not expose unrestricted ELM command transport', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /import\s*\{\s*isReadOnlyELMCommand\s*\}/);
  assert.match(runtime, /async function readOnlyCommand/);
  assert.match(runtime, /!isReadOnlyELMCommand\(normalized\)/);
  assert.match(runtime, /Object\.assign\(HA,\{connect,disconnect,readOnlyCommand,/);
  assert.doesNotMatch(runtime, /Object\.assign\(HA,\{connect,disconnect,command,/);
  assert.match(runtime, /!isReadOnlyELMCommand\(c\)/);
});

test('browser terminal allowlist rejects write and configuration commands', async () => {
  const guard = await source('public/terminal-readonly-guard.js');
  assert.match(guard, /isReadOnlyELMCommand\(command\)/);
  assert.match(guard, /stopImmediatePropagation/);
  assert.match(guard, /ATI\|ATDP\|ATDPN\|ATRV/);
  assert.doesNotMatch(guard, /ATSP0/);
  assert.doesNotMatch(guard, /ATSH/);
});
