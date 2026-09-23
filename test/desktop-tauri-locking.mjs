import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Desktop PRO Tauri commands use one coordinator-to-native lock order', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const bind = source.slice(source.indexOf('fn desktop_bind_serial_candidate'), source.indexOf('#[tauri::command]\nfn desktop_clear_serial_candidate'));
  assert.ok(bind.indexOf('state.lock()') >= 0);
  assert.ok(bind.indexOf('native.lock()') > bind.indexOf('state.lock()'));
  assert.match(source, /Never leave a native handle open if coordinator promotion fails/);
  assert.match(source, /if snapshot\.epoch != epoch \{\s*return Err\("stale_epoch"\.into\(\)\);/s);
});

test('Desktop PRO command surface still contains no serial write command', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /desktop_(?:write|transmit|flash|erase|code|actuat)/i);
  assert.doesNotMatch(source, /\.write_all\(|\.write\(/);
});
