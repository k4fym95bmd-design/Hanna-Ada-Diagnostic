// Evidence-only gate for the existing Hanna & Ada project.
// This module NEVER calls USB APIs, opens a port, transmits to an ECU or
// upgrades a USB cable to a verified ELM/BMW vehicle route.
// All evidence is supplied by a separate, user-authorized native probe.

export const AndroidUsbStatus = Object.freeze({
  OS_UNKNOWN: 'OS_UNKNOWN',
  OS_UNSUPPORTED: 'OS_UNSUPPORTED',
  HOST_UNKNOWN: 'HOST_UNKNOWN',
  HOST_UNAVAILABLE: 'HOST_UNAVAILABLE',
  ENUMERATION_PENDING: 'ENUMERATION_PENDING',
  NO_DEVICE: 'NO_DEVICE',
  SELECTION_REQUIRED: 'SELECTION_REQUIRED',
  SELECTION_INVALID: 'SELECTION_INVALID',
  DEVICE_DISCONNECTED: 'DEVICE_DISCONNECTED',
  PERMISSION_PENDING: 'PERMISSION_PENDING',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DRIVER_UNVERIFIED: 'DRIVER_UNVERIFIED',
  DRIVER_UNSUPPORTED: 'DRIVER_UNSUPPORTED',
  SERIAL_NOT_OPEN: 'SERIAL_NOT_OPEN',
  SERIAL_OPEN_ONLY: 'SERIAL_OPEN_ONLY',
});

const safeUsbId = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffff;
const hex = (value) => value.toString(16).padStart(4, '0').toUpperCase();

function blocked(status, nextCheck, evidence = null) {
  return Object.freeze({
    status,
    nextCheck,
    evidence,
    usbSerialVerified: false,
    vehicleVerified: false,
    readEnabled: false,
    writesEnabled: false,
  });
}

/**
 * @param {object} input Local observations, never a USB handle or vehicle RAW.
 * @param {number|null} input.androidApiLevel API level from the OS, not a guessed model spec.
 * @param {boolean|null} input.usbHostFeature Android PackageManager feature result.
 * @param {Array<{vendorId:number, productId:number, connected?:boolean}>|null} input.devices
 * @param {number|null} input.selectedIndex Index in the current enumeration snapshot.
 * @param {boolean|null} input.permission Explicit user-granted permission to this device.
 * @param {'supported'|'unsupported'|'unknown'} input.driver Compatibility established locally.
 * @param {boolean} input.serialPortOpen Observed serial-port open, not proof of an ECU.
 */
export function assessAndroidUsbReadiness(input = {}) {
  const api = input.androidApiLevel;
  if (!Number.isInteger(api)) return blocked(AndroidUsbStatus.OS_UNKNOWN, 'Read the installed Android API level.');
  if (api < 21) return blocked(AndroidUsbStatus.OS_UNSUPPORTED, 'This diagnostic companion targets Android API 21 or newer.');

  if (input.usbHostFeature !== true) {
    return input.usbHostFeature === false
      ? blocked(AndroidUsbStatus.HOST_UNAVAILABLE, 'USB host is not advertised; verify with an off-vehicle host test before proceeding.')
      : blocked(AndroidUsbStatus.HOST_UNKNOWN, 'Inspect android.hardware.usb.host on the actual tablet.');
  }

  if (!Array.isArray(input.devices)) return blocked(AndroidUsbStatus.ENUMERATION_PENDING, 'Enumerate local USB devices outside the vehicle.');
  if (input.devices.length === 0) return blocked(AndroidUsbStatus.NO_DEVICE, 'No USB device is enumerated. Check host mode using a known-working low-power peripheral.');

  if (input.selectedIndex === undefined || input.selectedIndex === null) {
    return blocked(AndroidUsbStatus.SELECTION_REQUIRED, 'Select an enumerated USB device; no identity is inferred from a cable label.');
  }
  if (!Number.isInteger(input.selectedIndex) || input.selectedIndex < 0 || input.selectedIndex >= input.devices.length) {
    return blocked(AndroidUsbStatus.SELECTION_INVALID, 'Refresh USB enumeration and select a current device.');
  }

  const device = input.devices[input.selectedIndex];
  if (!device || !safeUsbId(device.vendorId) || !safeUsbId(device.productId)) {
    return blocked(AndroidUsbStatus.SELECTION_INVALID, 'Device must supply a valid VID:PID; never copy its serial number.');
  }
  // Explicitly exclude serial numbers, product strings, paths and other identifiers.
  const evidence = Object.freeze({ vidPid: `${hex(device.vendorId)}:${hex(device.productId)}` });
  if (device.connected === false) return blocked(AndroidUsbStatus.DEVICE_DISCONNECTED, 'Refresh enumeration after disconnect.', evidence);
  if (input.permission !== true) {
    return input.permission === false
      ? blocked(AndroidUsbStatus.PERMISSION_DENIED, 'Access was denied. Do not open this USB device.', evidence)
      : blocked(AndroidUsbStatus.PERMISSION_PENDING, 'Await explicit Android USB permission.', evidence);
  }
  if (input.driver !== 'supported') {
    return input.driver === 'unsupported'
      ? blocked(AndroidUsbStatus.DRIVER_UNSUPPORTED, 'No matching serial driver is established; identify the actual chipset.', evidence)
      : blocked(AndroidUsbStatus.DRIVER_UNVERIFIED, 'Verify the actual USB serial chipset and compatible driver.', evidence);
  }
  if (input.serialPortOpen !== true) {
    return blocked(AndroidUsbStatus.SERIAL_NOT_OPEN, 'Verify the serial port locally; no vehicle command is allowed.', evidence);
  }
  return blocked(AndroidUsbStatus.SERIAL_OPEN_ONLY, 'USB serial transport was observed. BMW protocol and ECU response remain unverified.', evidence);
}
