import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android USB bridge rejects stale lifecycle operations before or during open', async () => {
  const bridge = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/AndroidKdcanUsbBridge.java');
  assert.match(bridge, /AtomicLong operationGeneration = new AtomicLong\(1L\)/);
  assert.match(bridge, /public long operationToken\(\)/);
  assert.match(bridge, /openNoTraffic\(UsbDevice device, long operationToken\)/);
  assert.match(bridge, /!operationCurrent\(operationToken\)/);
  assert.match(bridge, /return fail\("STALE_OPERATION"\)/);
  assert.match(bridge, /public Result invalidateOperationsAndClose\(\)/);
  assert.match(bridge, /onUsbDetached\(\)[\s\S]*invalidateOperationsAndClose\(\)/);
});

test('Android USB bridge remains read-only while lifecycle guards are active', async () => {
  const bridge = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/AndroidKdcanUsbBridge.java');
  assert.doesNotMatch(bridge, /\.write\s*\(/);
  assert.doesNotMatch(bridge, /bulkTransfer\s*\(/);
  assert.doesNotMatch(bridge, /controlTransfer\s*\(/);
  assert.match(bridge, /ecuVerified = false/);
  assert.match(bridge, /writesEnabled = false/);
});

test('MainActivity uses one USB executor and invalidates stale UI callbacks', async () => {
  const main = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/MainActivity.java');
  assert.match(main, /ExecutorService portExecutor/);
  assert.match(main, /Executors\.newSingleThreadExecutor/);
  assert.match(main, /volatile long portUiEpoch/);
  assert.match(main, /final long uiEpoch = \+\+portUiEpoch/);
  assert.match(main, /final long operationToken = usbSessionBridge\.operationToken\(\)/);
  assert.match(main, /usbSessionBridge\.openNoTraffic\(device, operationToken\)/);
  assert.match(main, /if \(uiEpoch != portUiEpoch\) return/);
  assert.match(main, /if \(uiEpoch != portUiEpoch \|\| isFinishing\(\)/);
  assert.doesNotMatch(main, /new Thread\(\(\) -> \{[\s\S]*openNoTraffic/);
});

test('Activity lifecycle and USB detach cancel the current port operation', async () => {
  const main = await source('android-usb-probe/app/src/main/java/app/hannaada/usbprobe/MainActivity.java');
  assert.match(main, /onPause\(\)[\s\S]*cancelPortTest/);
  assert.match(main, /onDestroy\(\)[\s\S]*invalidateOperationsAndClose\(\)/);
  assert.match(main, /portExecutor\.shutdownNow\(\)/);
  assert.match(main, /ACTION_USB_DEVICE_DETACHED[\s\S]*portUiEpoch\+\+/);
  assert.match(main, /usbSessionBridge\.onUsbDetached\(\)/);
});
