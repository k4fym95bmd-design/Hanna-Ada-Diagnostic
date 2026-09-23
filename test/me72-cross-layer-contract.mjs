import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertMe72DataExecutionGated,
  listMe72ReadOnlyDataProfiles,
} from '../public/me72-readonly-data-profile.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const profileBindings=Object.freeze({
  'e39-me72-roughness-4003':Object.freeze({parser:'../public/me72-roughness-parser.js',nativeConstant:'ME72_ROUGHNESS_REQUEST',panelAction:'read-roughness'}),
  'e39-me72-engine-snapshot-4000':Object.freeze({parser:'../public/me72-engine-snapshot-parser.js',nativeConstant:'ME72_ENGINE_SNAPSHOT_REQUEST',panelAction:'read-engine'}),
  'e39-me72-fuel-adaptation-4004':Object.freeze({parser:'../public/me72-fuel-adaptation-parser.js',nativeConstant:'ME72_FUEL_ADAPTATION_REQUEST',panelAction:'read-adaptation'}),
  'e39-me72-output-status-4005':Object.freeze({parser:'../public/me72-output-status-parser.js',nativeConstant:'ME72_OUTPUT_STATUS_REQUEST',panelAction:'read-output-status'}),
  'e39-me72-readiness-4007':Object.freeze({parser:'../public/me72-readiness-parser.js',nativeConstant:'ME72_READINESS_REQUEST',panelAction:'read-readiness'}),
  'e39-me72-dtc-count-a200':Object.freeze({parser:'../public/me72-dtc-count-parser.js',nativeConstant:'ME72_DTC_COUNT_REQUEST',panelAction:'read-dtc-count'}),
});

function parseRustRequestConstants(source){
  return [...source.matchAll(/const\s+(ME72_[A-Z0-9_]+_REQUEST):\s*\[u8;\s*(\d+)\]\s*=\s*\[([^\]]+)\];/g)]
    .map(match=>{
      const bytes=match[3].split(',').map(value=>value.trim()).filter(Boolean)
        .map(value=>Number.parseInt(value.replace(/^0x/i,''),16));
      return Object.freeze({
        name:match[1],
        declaredLength:Number(match[2]),
        bytes:Object.freeze(bytes),
        xor:bytes.reduce((checksum,byte)=>checksum^byte,0),
      });
    });
}

test('every enabled ME7.2 profile is wired through parser, Rust, Tauri, bridge and panel', async()=>{
  const [native,lib,bridge,panel]=await Promise.all([
    read('../desktop-pro/src-tauri/src/desktop_native_serial.rs'),
    read('../desktop-pro/src-tauri/src/lib.rs'),
    read('../public/desktop-host-bridge.js'),
    read('../public/desktop-pro-panel.js'),
  ]);

  const profiles=listMe72ReadOnlyDataProfiles();
  assert.equal(profiles.length,Object.keys(profileBindings).length);

  for(const profile of profiles){
    assert.equal(assertMe72DataExecutionGated(profile.id),profile);
    const binding=profileBindings[profile.id];
    assert.ok(binding,`Missing cross-layer binding for ${profile.id}`);
    const parser=await read(binding.parser);
    assert.ok(parser.includes(profile.parserId),`Parser id missing for ${profile.id}`);
    assert.ok(native.includes(binding.nativeConstant),`Native request missing for ${profile.id}`);
    assert.ok(native.includes(profile.id),`Native provenance id missing for ${profile.id}`);
    assert.ok(lib.includes(profile.executorId),`Tauri executor missing for ${profile.id}`);
    assert.ok(bridge.includes(profile.executorId),`Bridge invoke missing for ${profile.id}`);
    assert.ok(panel.includes(`data-desktop-pro-action="${binding.panelAction}"`),`Panel action missing for ${profile.id}`);
  }
});

test('all native ME7.2 request constants have exact declared length and zero XOR checksum',async()=>{
  const native=await read('../desktop-pro/src-tauri/src/desktop_native_serial.rs');
  const constants=parseRustRequestConstants(native);
  assert.ok(constants.length>=7);
  for(const request of constants){
    assert.equal(request.bytes.length,request.declaredLength,`${request.name} length mismatch`);
    assert.equal(request.xor,0,`${request.name} XOR mismatch`);
  }
});

test('no browser or Tauri public API exposes arbitrary raw transmit material',async()=>{
  const [native,lib,bridge,panel]=await Promise.all([
    read('../desktop-pro/src-tauri/src/desktop_native_serial.rs'),
    read('../desktop-pro/src-tauri/src/lib.rs'),
    read('../public/desktop-host-bridge.js'),
    read('../public/desktop-pro-panel.js'),
  ]);
  assert.doesNotMatch(native,/pub\s+fn\s+(write|send|transmit)\b/);
  assert.doesNotMatch(lib,/fn\s+desktop_(write|send|transmit)\b/);
  assert.doesNotMatch(bridge,/desktop_(write|send|transmit)_serial/);
  assert.doesNotMatch(panel,/requestBytes|rawTx|txBytes\s*:/);
});

test('ME7.2 data profiles have unique ids, parsers and native executors',()=>{
  const profiles=listMe72ReadOnlyDataProfiles();
  for(const key of ['id','parserId','executorId','operationId']){
    assert.equal(new Set(profiles.map(profile=>profile[key])).size,profiles.length,`Duplicate ME7.2 ${key}`);
  }
});
