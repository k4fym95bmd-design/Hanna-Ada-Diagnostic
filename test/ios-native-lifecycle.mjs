import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('iOS BLE reconnect waits for previous peripheral disconnect before starting a new session', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(manager, /private var disconnectingPeripheral: CBPeripheral\?/);
  assert.match(manager, /private var pendingConnection: \(peripheral: CBPeripheral, name: String\)\?/);
  assert.match(manager, /if let old = peripheral \{[\s\S]*pendingConnection = \(candidate, device\.name\)[\s\S]*cancelPeripheralConnection\(old\)[\s\S]*return/);
  assert.match(manager, /if disconnectingPeripheral != nil \{[\s\S]*pendingConnection = \(candidate, device\.name\)[\s\S]*return/);
  assert.match(manager, /private func finishDisconnect\(_ disconnected: CBPeripheral, error: Error\?\)/);
  assert.match(manager, /startConnection\(pending\.peripheral, name: pending\.name\)/);
});

test('iOS ELM pending command is owned by an epoch and command token', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(manager, /private var pendingCommandEpoch: Int\?/);
  assert.match(manager, /private var pendingCommandToken: UInt64 = 0/);
  assert.match(manager, /let commandEpoch = epoch/);
  assert.match(manager, /let commandToken = commandSequence/);
  assert.match(manager, /self\.epoch == commandEpoch/);
  assert.match(manager, /self\.pendingCommandEpoch == commandEpoch/);
  assert.match(manager, /self\.pendingCommandToken == commandToken/);
  assert.match(manager, /private func clearPendingCommand\(\) -> CheckedContinuation<String, Error>\?/);
});

test('iOS GATT callbacks cannot consume command state from another session epoch', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(manager, /didWriteValueFor[\s\S]*self\.pendingCommandEpoch == self\.epoch[\s\S]*self\.pendingCommandToken != 0/);
  assert.match(manager, /didUpdateValueFor[\s\S]*self\.pendingCommandEpoch == self\.epoch[\s\S]*self\.pendingCommandToken != 0/);
  assert.match(manager, /resetSession\(keepDevices: Bool\)[\s\S]*let pending = clearPendingCommand\(\)/);
  assert.match(manager, /receiveBuffer\.utf8\.count > 16384/);
});

test('iOS app background transition invalidates active BLE work', async () => {
  const app = await source('ios-native/Sources/HannaAdaDiagApp.swift');
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(app, /@Environment\(\\\.scenePhase\) private var scenePhase/);
  assert.match(app, /\.onChange\(of: scenePhase\)/);
  assert.match(app, /if phase != \.active \{[\s\S]*obd\.suspendForBackground\(\)/);
  assert.match(manager, /func suspendForBackground\(\)/);
  assert.match(manager, /central\.stopScan\(\)/);
  assert.match(manager, /resetSession\(keepDevices: true\)/);
});

test('iOS wired accessory surface remains evidence-only and does not open a generic serial session', async () => {
  const wired = await source('ios-native/Sources/WiredAccessoryView.swift');
  assert.match(wired, /evidenceStage = \.noCable/);
  assert.match(wired, /registerForLocalNotifications\(\)/);
  assert.doesNotMatch(wired, /EASession\s*\(/);
  assert.doesNotMatch(wired, /writeData|outputStream|inputStream/);
});
