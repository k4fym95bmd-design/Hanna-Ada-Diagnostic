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


test('Desktop PRO hot RX loops reuse fixed stack scratch buffers', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/desktop_native_serial.rs', import.meta.url), 'utf8');
  const matches = source.match(/let mut chunk = \[0u8; 64\];/g) || [];
  assert.ok(matches.length >= 2, 'identity and roughness loops should reuse fixed 64-byte scratch buffers');
  assert.doesNotMatch(source, /let mut chunk = vec!\[0u8; chunk_len\]/);
  assert.match(source, /port\.read\(&mut chunk\[\.\.chunk_len\]\)/);
});


test('Desktop PRO identity and roughness split preflight from physical serial I/O', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const identity = source.slice(
    source.indexOf('fn desktop_execute_me72_identity'),
    source.indexOf('fn desktop_execute_me72_roughness')
  );
  const roughness = source.slice(
    source.indexOf('fn desktop_execute_me72_roughness'),
    source.indexOf('fn desktop_consume_readonly_request')
  );

  assert.match(identity, /Phase 1:[\s\S]*Phase 2:[\s\S]*Phase 3:/);
  assert.match(roughness, /Phase 1:[\s\S]*Phase 2:[\s\S]*Phase 3:/);

  const identityIo = identity.slice(identity.indexOf('// Phase 2:'), identity.indexOf('// Phase 3:'));
  const roughnessIo = roughness.slice(roughness.indexOf('// Phase 2:'), roughness.indexOf('// Phase 3:'));

  assert.match(identityIo, /native\.lock\(\)/);
  assert.doesNotMatch(identityIo, /state\.lock\(\)|broker\.lock\(\)|attestation\.lock\(\)/);

  assert.match(roughnessIo, /native\.lock\(\)/);
  assert.doesNotMatch(roughnessIo, /state\.lock\(\)|broker\.lock\(\)|attestation\.lock\(\)/);
});

test('Desktop PRO revalidates transport and request authority after serial I/O', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const identity = source.slice(
    source.indexOf('fn desktop_execute_me72_identity'),
    source.indexOf('fn desktop_execute_me72_roughness')
  );
  const roughness = source.slice(
    source.indexOf('fn desktop_execute_me72_roughness'),
    source.indexOf('fn desktop_consume_readonly_request')
  );

  for (const command of [identity, roughness]) {
    assert.match(command, /transport\.epoch != epoch/);
    assert.match(command, /native_snapshot\.epoch != epoch/);
    assert.match(command, /!native_snapshot\.transport_open/);
    assert.match(command, /native_snapshot\.protocol != Some\("KWP2000_BMW"\)/);
    assert.match(command, /transport_changed_after_io/);
  }

  assert.ok((identity.match(/authorize_native_execution\(/g) || []).length >= 2);
  assert.match(roughness, /readonly_sample_active/);
  assert.match(roughness, /authorize_me72_readonly\(epoch\)/);
});

test('Desktop broker lease blocks request prepare while roughness sample is in flight', async () => {
  const broker = await readFile(new URL('../desktop-pro/src-tauri/src/desktop_request_broker.rs', import.meta.url), 'utf8');
  assert.match(broker, /readonly_sample_active: bool/);
  assert.match(broker, /begin_readonly_sample/);
  assert.match(broker, /finish_readonly_sample/);
  assert.match(broker, /return Err\("readonly_sample_active"\.into\(\)\)/);
  assert.match(broker, /READONLY_SAMPLE_ACTIVE/);
  assert.match(broker, /self\.readonly_sample_active = false/);
});


test('Desktop bounded read releases coordinator and broker during blocking I/O', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const bounded = source.slice(
    source.indexOf('fn desktop_read_bounded'),
    source.indexOf('fn desktop_close_port')
  );
  assert.match(bounded, /Phase 1:[\s\S]*Phase 2:[\s\S]*Phase 3:/);
  const io = bounded.slice(bounded.indexOf('// Phase 2:'), bounded.indexOf('// Phase 3:'));
  assert.match(io, /native\.lock\(\)/);
  assert.doesNotMatch(io, /state\.lock\(\)|broker\.lock\(\)|attestation\.lock\(\)/);
});

test('Desktop bounded read never correlates RX bytes to a request that appeared mid-I/O', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const bounded = source.slice(
    source.indexOf('fn desktop_read_bounded'),
    source.indexOf('fn desktop_close_port')
  );
  assert.match(bounded, /let expected_request_id =/);
  assert.match(bounded, /current\.active_request_id\.as_deref\(\) != Some\(expected\)/);
  assert.match(bounded, /request_changed_after_io/);
  assert.match(bounded, /transport_changed_after_io/);
  assert.match(bounded, /native_snapshot\.epoch != epoch/);
});


test('Desktop serial open releases coordinator and attestation during OS open', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const open = source.slice(
    source.indexOf('fn desktop_open_configured_port'),
    source.indexOf('fn desktop_read_bounded')
  );
  assert.match(open, /Phase 1:[\s\S]*Phase 2:[\s\S]*Phase 3:/);
  const io = open.slice(open.indexOf('// Phase 2:'), open.indexOf('// Phase 3:'));
  assert.match(io, /native\.lock\(\)/);
  assert.match(io, /open_configured\(&bound, epoch, &protocol, baud_rate\)/);
  assert.doesNotMatch(io, /state\.lock\(\)|attestation\.lock\(\)/);
});

test('Desktop serial open revalidates epoch and native protocol before promotion', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const open = source.slice(
    source.indexOf('fn desktop_open_configured_port'),
    source.indexOf('fn desktop_read_bounded')
  );
  assert.match(open, /current\.epoch != epoch/);
  assert.match(open, /native_snapshot\.epoch != epoch/);
  assert.match(open, /native_snapshot\.protocol != Some\(protocol\.as_str\(\)\)/);
  assert.match(open, /transport_changed_during_open/);
  assert.match(open, /Never leave a native handle open if coordinator promotion fails/);
});


test('engine and fuel samples use broker lease and post-I/O revalidation', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  for (const [startName,endName] of [
    ['fn desktop_execute_me72_engine_snapshot','fn desktop_execute_me72_fuel_adaptation'],
    ['fn desktop_execute_me72_fuel_adaptation','fn desktop_consume_readonly_request'],
  ]) {
    const block = source.slice(source.indexOf(startName), source.indexOf(endName));
    assert.match(block,/begin_readonly_sample\(epoch\)/);
    assert.match(block,/readonly_sample_active/);
    assert.match(block,/native_snapshot\.protocol != Some\("KWP2000_BMW"\)/);
    assert.match(block,/authorize_me72_readonly\(epoch\)/);
    assert.match(block,/finish_readonly_sample\(epoch\)/);
    assert.doesNotMatch(block,/raw_write|request_bytes|payload:/i);
  }
});


test('readiness sample uses broker lease and post-I/O revalidation', async () => {
  const source = await readFile(new URL('../desktop-pro/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const block = source.slice(
    source.indexOf('fn desktop_execute_me72_readiness'),
    source.indexOf('fn desktop_consume_readonly_request')
  );
  assert.match(block,/begin_readonly_sample\(epoch\)/);
  assert.match(block,/readonly_sample_active/);
  assert.match(block,/native_snapshot\.protocol != Some\("KWP2000_BMW"\)/);
  assert.match(block,/authorize_me72_readonly\(epoch\)/);
  assert.match(block,/finish_readonly_sample\(epoch\)/);
  assert.doesNotMatch(block,/raw_write|request_bytes|payload:/i);
});
