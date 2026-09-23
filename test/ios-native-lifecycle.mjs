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


test('iOS BLE channel fails closed after timeout, overflow, or GATT error', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(manager, /private var commandChannelDesynced = false/);
  assert.match(manager, /guard !commandChannelDesynced else/);
  assert.match(manager, /markCommandChannelDesynced\("Timeout waiting for/);
  assert.match(manager, /markCommandChannelDesynced\("GATT write failed"\)/);
  assert.match(manager, /markCommandChannelDesynced\("GATT notification failed"\)/);
  assert.match(manager, /markCommandChannelDesynced\("Oversized BLE response"\)/);
  assert.match(manager, /commandChannelDesynced = false/);
});


test('iOS ExternalAccessory notifications are foreground-owned and idempotent', async () => {
  const wired = await source('ios-native/Sources/WiredAccessoryView.swift');
  assert.match(wired, /private var watching = false/);
  assert.match(wired, /if !watching \{[\s\S]*registerForLocalNotifications\(\)/);
  assert.match(wired, /guard watching else \{ return \}[\s\S]*unregisterForLocalNotifications\(\)/);
  assert.match(wired, /func refreshFromNotification\(\)[\s\S]*guard watching else \{ return \}/);
  assert.match(wired, /@Environment\(\\\.scenePhase\) private var scenePhase/);
  assert.match(wired, /if phase == \.active \{[\s\S]*hardware\.startWatching\(\)[\s\S]*hardware\.stopWatching\(\)/);
  assert.match(wired, /hardware\.refreshFromNotification\(\)/);
});


test('iOS desync tears down the physical GATT session before any reconnect', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  const helper = manager.slice(
    manager.indexOf('private func markCommandChannelDesynced'),
    manager.indexOf('private func resetSession')
  );
  assert.match(helper, /disconnectingPeripheral = current/);
  assert.match(helper, /central\.cancelPeripheralConnection\(current\)/);
  assert.match(helper, /resetSession\(keepDevices: true\)/);
  assert.match(helper, /commandChannelDesynced = true/);
});


test('iOS disconnect watchdog fail-closes reconnect if CoreBluetooth never confirms close', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(manager, /private var disconnectWatchdog = BLEDisconnectWatchdog\(\)/);
  assert.match(manager, /private var disconnectWatchdogTask: Task<Void, Never>\?/);
  assert.match(manager, /private func beginDisconnect\(_ current: CBPeripheral\)/);
  assert.match(manager, /let token = disconnectWatchdog\.begin\(\)/);
  assert.match(manager, /Task\.sleep\(for: \.seconds\(3\)\)/);
  assert.match(manager, /disconnectWatchdog\.owns\(token\)/);
  assert.match(manager, /Previous BLE session did not confirm disconnect; retry connection/);
  assert.match(manager, /private func cancelDisconnectWatchdog\(\)/);
  assert.match(manager, /finishDisconnect[\s\S]*cancelDisconnectWatchdog\(\)/);
  assert.match(manager, /pendingConnection = \(candidate, device\.name\)[\s\S]*beginDisconnect\(old\)/);
});


test('iOS late disconnect callback cannot downgrade desync error to disconnected', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  const finish = manager.slice(
    manager.indexOf('private func finishDisconnect'),
    manager.indexOf('func readLive')
  );
  assert.match(finish, /if commandChannelDesynced/);
  assert.match(finish, /pendingConnection = nil/);
  assert.match(finish, /state = \.error/);
  assert.match(finish, /reconnect required/);
  assert.match(finish, /return/);
});


test('iOS Scan Disconnect and background invalidate any older disconnect watchdog', async () => {
  const manager = await source('ios-native/Sources/BluetoothOBDManager.swift');
  assert.match(manager, /private func abandonDisconnectOwnership\(\)/);
  assert.match(manager, /cancelDisconnectWatchdog\(\)/);
  assert.match(manager, /disconnectingPeripheral = nil/);
  assert.match(manager, /pendingConnection = nil/);

  const scan = manager.slice(manager.indexOf('func scan()'), manager.indexOf('func connect(to device: Device)'));
  const disconnect = manager.slice(manager.indexOf('func disconnect()'), manager.indexOf('func suspendForBackground()'));
  const background = manager.slice(manager.indexOf('func suspendForBackground()'), manager.indexOf('private func beginDisconnect'));

  for (const body of [scan, disconnect, background]) {
    assert.match(body, /abandonDisconnectOwnership\(\)/);
  }
});
