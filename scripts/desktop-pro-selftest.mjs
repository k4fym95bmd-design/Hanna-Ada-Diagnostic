import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const steps = [
  {
    name: 'Desktop PRO JS syntax + evidence tests',
    command: process.execPath,
    args: [
      '--test',
      'test/desktop-host-bridge.mjs',
      'test/desktop-receive-evidence.mjs',
      'test/desktop-pro-panel-wiring.mjs',
      'test/read-only-request-registry.mjs',
      'test/module-identity-evidence.mjs',
      'test/trusted-identity-verifier.mjs',
      'test/trusted-correlation-session.mjs',
      'test/trusted-identity-event.mjs',
      'test/trusted-identity-fault-injection.mjs',
    ],
    required: true,
  },
];

const syntaxFiles = [
  'public/desktop-host-bridge.js',
  'public/passive-legacy-rx.js',
  'public/desktop-receive-evidence.js',
  'public/desktop-pro-panel.js',
  'public/read-only-request-registry.js',
  'public/module-identity-evidence.js',
  'public/trusted-identity-verifier.js',
  'public/trusted-correlation-session.js',
  'public/trusted-identity-event.js',
];

for (const file of syntaxFiles) {
  steps.unshift({
    name: `Syntax ${file}`,
    command: process.execPath,
    args: ['--check', file],
    required: true,
  });
}

if (existsSync('desktop-pro/src-tauri/Cargo.toml')) {
  const cargoProbe = spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: false });
  if (cargoProbe.status === 0) {
    steps.push({
      name: 'Desktop PRO Rust tests',
      command: 'cargo',
      args: ['test', '--manifest-path', 'desktop-pro/src-tauri/Cargo.toml'],
      required: true,
    });
  } else {
    steps.push({
      name: 'Desktop PRO Rust tests',
      skip: 'cargo unavailable',
      required: false,
    });
  }
}

let failures = 0;
const report = [];

for (const step of steps) {
  if (step.skip) {
    report.push({ name: step.name, status: 'SKIP', detail: step.skip });
    continue;
  }

  const result = spawnSync(step.command, step.args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

  const ok = result.status === 0;
  report.push({
    name: step.name,
    status: ok ? 'PASS' : 'FAIL',
    detail: (result.stdout || result.stderr || '').trim().slice(0, 4000),
  });
  if (!ok && step.required) failures++;
}

for (const item of report) {
  console.log(`[${item.status}] ${item.name}`);
  if (item.detail && item.status !== 'PASS') console.log(item.detail);
}

if (failures > 0) {
  console.error(`Desktop PRO self-test failed: ${failures} required step(s).`);
  process.exit(1);
}

console.log('Desktop PRO self-test: PASS');
