// WebUSB is a no-computer discovery path for Chrome on compatible Android USB-host devices.
// No interface claims, control/bulk transfers, serial configuration or ECU communication.
export function webUsbAvailable(usb) {
  return !!usb && typeof usb.requestDevice === 'function';
}

export function describeUsbDevice(device) {
  if (!device || !Number.isInteger(device.vendorId) || !Number.isInteger(device.productId)
    || device.vendorId < 0 || device.vendorId > 0xffff || device.productId < 0 || device.productId > 0xffff) {
    throw new TypeError('USB device identity is unavailable.');
  }
  const hex = value => value.toString(16).toUpperCase().padStart(4, '0');
  return Object.freeze({
    vidPid: `${hex(device.vendorId)}:${hex(device.productId)}`,
    configurationCount: Array.isArray(device.configurations) ? Math.min(device.configurations.length, 100) : null,
    // An identity/descriptor is not evidence of a BMW-compatible serial driver.
    cableDetected: true, serialDriverVerified: false, portOpen: false,
    ecuVerified: false, writesEnabled: false, flashEnabled: false,
  });
}

export async function chooseWebUsbDevice(usb) {
  if (!webUsbAvailable(usb)) throw new TypeError('WebUSB unavailable: use Chrome for Android with a compatible USB-host device.');
  // Must be invoked immediately from a user's tap/click; do not await anything first.
  const device = await usb.requestDevice({ filters: [] });
  return { device, evidence: describeUsbDevice(device) };
}

export async function probeWebUsbAccess(device) {
  const identity = describeUsbDevice(device);
  if (typeof device.open !== 'function' || typeof device.close !== 'function') {
    throw new TypeError('Device does not expose the WebUSB open/close API.');
  }
  // Deliberately never selectConfiguration(), claimInterface(), controlTransfer*, transfer*().
  // Even success is ONLY access to a USB device, not opening a serial port or ECU.
  if (device.opened) throw new TypeError('USB already open; close it in its owning session first.');
  let opened = false;
  try {
    await device.open();
    opened = true;
  } finally {
    // A rejected close must propagate; never report access as cleanly verified.
    if (opened || device.opened) await device.close();
  }
  return Object.freeze({ ...identity, usbAccessVerified: true, portOpen: false, ecuVerified: false });
}
