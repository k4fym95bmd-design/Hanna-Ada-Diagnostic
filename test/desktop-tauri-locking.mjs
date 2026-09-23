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


test('native identity authority is reset on transport lifecycle changes', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const bind = source.slice(source.indexOf('fn desktop_bind_serial_candidate'), source.indexOf('fn desktop_clear_serial_candidate'));
  const clear = source.slice(source.indexOf('fn desktop_clear_serial_candidate'), source.indexOf('fn desktop_open_configured_port'));
  const open = source.slice(source.indexOf('fn desktop_open_configured_port'), source.indexOf('fn desktop_read_bounded'));
  const close = source.slice(source.indexOf('fn desktop_close_port'), source.indexOf('fn desktop_prepare_readonly_request'));
  const prepare = source.slice(source.indexOf('fn desktop_prepare_readonly_request'), source.indexOf('fn desktop_execute_me72_identity'));
  assert.match(bind,/reset_authority\(\)/);
  assert.match(clear,/reset_authority\(\)/);
  assert.match(open,/reset_authority\(\)/);
  assert.match(close,/reset_authority\(\)/);
  assert.match(prepare,/e39-dme-me72-module-identity[\s\S]*reset_authority\(\)/);
});


test('roughness provenance failure is fail-closed after RX', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const roughness = source.slice(
    source.indexOf('fn desktop_execute_me72_roughness'),
    source.indexOf('fn desktop_consume_readonly_request')
  );
  assert.doesNotMatch(roughness, /record_me72_readonly_sample\(epoch\)\?/);
  assert.match(
    roughness,
    /record_me72_readonly_sample\(epoch\)[\s\S]*Err\(error\)[\s\S]*native\.close_any\(\)[\s\S]*coordinator\.mark_closed\(epoch\)[\s\S]*broker\.reset\(epoch\)[\s\S]*attestation\.reset_authority\(\)[\s\S]*return Err\(error\)/
  );
});
