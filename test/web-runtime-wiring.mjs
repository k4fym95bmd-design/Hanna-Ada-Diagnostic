import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads read-only terminal gate and verified DTC extension', async () => {
  const html = await source('public/index.html');
  assert.match(html, /src="\/terminal-readonly-guard\.js"/);
  assert.match(html, /src="\/diagnostic-core-v2\.js"/);
  const extension = await source('public/diagnostic-core-v2.js');
  assert.match(extension, /import\s*\{[^}]*decodeStoredDTCs[^}]*\}\s*from\s*['"]\.\/diagnostic-core\.js['"]/);
  assert.match(extension, /decodeStoredDTCs\(raw, protocol\)/);
  assert.doesNotMatch(extension, /h\.parseDtc\(/);
  assert.match(extension, /Niezweryfikowany odczyt DTC/);
});

test('browser terminal only exposes the read-only allowlist', async () => {
  const guard = await source('public/terminal-readonly-guard.js');
  assert.match(guard, /isReadOnlyELMCommand\(command\)/);
  assert.match(guard, /stopImmediatePropagation/);
});
