import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/start-windows-gateway.ps1', import.meta.url), 'utf8');

test('Windows launcher keeps bridge token out of child command-line strings', () => {
  assert.match(script, /HAA_BRIDGE_TOKEN = \$token/);
  assert.doesNotMatch(script, /bridgeCommand\s*=.*HAA_BRIDGE_TOKEN/s);
  assert.match(script, /Remove-Item Env:HAA_BRIDGE_TOKEN/);
});

test('web server starts before sensitive bridge environment is populated', () => {
  const serverIndex = script.indexOf('$server = Start-Process');
  const tokenEnvIndex = script.indexOf('$env:HAA_BRIDGE_TOKEN = $token');
  assert.ok(serverIndex >= 0);
  assert.ok(tokenEnvIndex > serverIndex);
});

test('non-loopback bridge startup fails closed without TLS', () => {
  assert.match(script, /BridgeHost -notin @\("127\.0\.0\.1","localhost","::1"\)/);
  assert.match(script, /Stop-Process -Id \$server\.Id -Force/);
});


test('launcher keeps Windows PowerShell 5.1 compatible syntax', () => {
  assert.doesNotMatch(script, /\$[A-Za-z_][A-Za-z0-9_]*\s*\?\s*["']/);
  assert.match(script, /\$bridgeScheme = if \(\$BridgeUsesTls\)/);
  assert.match(script, /\$bridgeProbeHost = if \(\$BridgeHost -eq "::1"\)/);
});


test('preflight runs before any child process or bridge token creation', () => {
  const preflightIndex = script.indexOf('npm run test:preflight-windows');
  const tokenIndex = script.indexOf('$bytes = New-Object byte[] 32');
  const serverIndex = script.indexOf('$server = Start-Process');
  assert.ok(preflightIndex >= 0);
  assert.ok(preflightIndex < tokenIndex);
  assert.ok(preflightIndex < serverIndex);
});
