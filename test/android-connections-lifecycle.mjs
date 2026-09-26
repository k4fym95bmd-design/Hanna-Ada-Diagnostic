import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ConnectionsActivity invalidates stale BLE scan and connection callbacks', async () => {
  const activity = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/ConnectionsActivity.java');
  assert.match(activity, /volatile long connectionUiEpoch/);
  assert.match(activity, /final long owner = \+\+connectionUiEpoch/);
  assert.match(activity, /owner != connectionUiEpoch/);
  assert.match(activity, /bleLink\.stopAll\(\)/);
  assert.match(activity, /Build\.VERSION\.SDK_INT >= 17 && isDestroyed\(\)/);
});

test('ConnectionsActivity serializes SPP work on one executor', async () => {
  const activity = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/ConnectionsActivity.java');
  assert.match(activity, /ExecutorService transportExecutor/);
  assert.match(activity, /Executors\.newSingleThreadExecutor/);
  assert.match(activity, /transportExecutor\.execute\(\(\) ->/);
  assert.match(activity, /transportExecutor\.shutdownNow\(\)/);
  assert.doesNotMatch(activity, /new Thread\(\(\) -> \{[\s\S]*testPairedSppConnection/);
});

test('ConnectionsActivity pause invalidates BLE and SPP UI ownership', async () => {
  const activity = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/ConnectionsActivity.java');
  assert.match(activity, /onPause\(\)[\s\S]*connectionUiEpoch\+\+/);
  assert.match(activity, /Test BLE przerwany po opuszczeniu ekranu/);
  assert.match(activity, /Test SPP przerwany po opuszczeniu ekranu/);
  assert.match(activity, /onDestroy\(\)[\s\S]*connectionUiEpoch\+\+/);
});

test('Bluetooth smoke tests remain transport-only and never send ECU commands', async () => {
  const spp = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/BluetoothLink.java');
  const ble = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/BleLink.java');
  assert.doesNotMatch(spp + ble, /\.write\s*\(/);
  assert.doesNotMatch(spp + ble, /0100|010C|ATI|ATDP|Mode 03|clear DTC/i);
});


test('SPP cancellation actively closes the blocking Bluetooth socket', async () => {
  const spp = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/BluetoothLink.java');
  const activity = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/ConnectionsActivity.java');
  assert.match(spp, /private static BluetoothSocket activeProbeSocket/);
  assert.match(spp, /static long beginProbe\(\)/);
  assert.match(spp, /static void cancelActiveProbe\(\)/);
  assert.match(spp, /closeQuietly\(socket\)/);
  assert.match(spp, /testPairedSppConnection\(Context context, BluetoothDevice device, long probeToken\)/);
  assert.match(spp, /currentProbe\(probeToken\)/);
  assert.match(activity, /BluetoothLink\.cancelActiveProbe\(\)/);
  assert.match(activity, /final long probeToken = BluetoothLink\.beginProbe\(\)/);
  assert.match(activity, /testPairedSppConnection\(this, device, probeToken\)/);
});
