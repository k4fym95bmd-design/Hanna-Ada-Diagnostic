// Cross-platform transport policy for Hanna & Ada.
// Chooses the safest useful READ-ONLY transport from observed capabilities.
// It never opens hardware, transmits vehicle commands, or enables writes.
export const TransportRoute = Object.freeze({
  WINDOWS_DIRECT: 'WINDOWS_DIRECT_WEBSERIAL',
  WINDOWS_BRIDGE: 'WINDOWS_LAPTOP_BRIDGE',
  ANDROID_NATIVE: 'ANDROID_NATIVE_USB',
  ANDROID_WEBUSB: 'ANDROID_WEBUSB_DISCOVERY',
  IOS_BRIDGE: 'IOS_TO_WINDOWS_BRIDGE',
  OFFLINE: 'NO_COMPATIBLE_TRANSPORT',
});

const bool = value => value === true;

export function chooseTransportRoute(input = {}) {
  const platform = String(input.platform || '').toLowerCase();
  const bridgeReachable = bool(input.bridgeReachable);
  const secureContext = bool(input.secureContext);
  const webSerial = bool(input.webSerial);
  const webUsb = bool(input.webUsb);
  const nativeUsbHost = bool(input.nativeUsbHost);

  if (platform === 'ios') {
    return Object.freeze({
      route: bridgeReachable ? TransportRoute.IOS_BRIDGE : TransportRoute.OFFLINE,
      directUsb: false,
      requiresLaptopGateway: true,
      readOnly: true,
      writesEnabled: false,
      reason: bridgeReachable
        ? 'iOS uses the Windows laptop as the physical K+DCAN gateway.'
        : 'No direct generic K+DCAN web transport is trusted on iOS; connect the laptop bridge.',
    });
  }

  if (platform === 'android') {
    if (nativeUsbHost) {
      return Object.freeze({
        route: TransportRoute.ANDROID_NATIVE,
        directUsb: true,
        requiresLaptopGateway: false,
        readOnly: true,
        writesEnabled: false,
        reason: 'Native Android USB Host is the preferred direct cable path.',
      });
    }
    if (bridgeReachable) {
      return Object.freeze({
        route: TransportRoute.WINDOWS_BRIDGE,
        directUsb: false,
        requiresLaptopGateway: true,
        readOnly: true,
        writesEnabled: false,
        reason: 'Android uses the canonical Windows gateway when native USB Host is unavailable.',
      });
    }
    if (secureContext && webUsb) {
      return Object.freeze({
        route: TransportRoute.ANDROID_WEBUSB,
        directUsb: true,
        requiresLaptopGateway: false,
        readOnly: true,
        writesEnabled: false,
        reason: 'WebUSB is discovery-only fallback and does not prove serial or BMW protocol support.',
      });
    }
  }

  if (platform === 'windows' || platform === 'desktop') {
    if (bridgeReachable) {
      return Object.freeze({
        route: TransportRoute.WINDOWS_BRIDGE,
        directUsb: true,
        requiresLaptopGateway: true,
        readOnly: true,
        writesEnabled: false,
        reason: 'The local Windows bridge is the canonical path because it provides one session model, USB binding and atomic passive snapshots.',
      });
    }
    if (secureContext && webSerial) {
      return Object.freeze({
        route: TransportRoute.WINDOWS_DIRECT,
        directUsb: true,
        requiresLaptopGateway: false,
        readOnly: true,
        writesEnabled: false,
        reason: 'Direct Web Serial is the local fallback when the canonical bridge is unavailable.',
      });
    }
  }

  if (bridgeReachable) {
    return Object.freeze({
      route: TransportRoute.WINDOWS_BRIDGE,
      directUsb: false,
      requiresLaptopGateway: true,
      readOnly: true,
      writesEnabled: false,
      reason: 'Unknown client platform uses the Windows laptop gateway.',
    });
  }

  return Object.freeze({
    route: TransportRoute.OFFLINE,
    directUsb: false,
    requiresLaptopGateway: platform !== 'windows',
    readOnly: true,
    writesEnabled: false,
    reason: 'No verified transport capability is available.',
  });
}

export function assessWindowsGateway({ ramGb, nodeMajor, bridgeReachable, usbIdentityKnown } = {}) {
  const ram = Number(ramGb);
  const node = Number(nodeMajor);
  const memoryReady = Number.isFinite(ram) && ram >= 8;
  const runtimeReady = Number.isInteger(node) && node >= 20;
  const transportReady = bool(bridgeReachable);
  const usbBound = bool(usbIdentityKnown);

  return Object.freeze({
    memoryReady,
    runtimeReady,
    transportReady,
    usbBound,
    gatewayCoreReady: memoryReady && runtimeReady,
    hardwareEvidenceReady: transportReady && usbBound,
    writesEnabled: false,
    note: memoryReady
      ? 'Memory is sufficient for the lightweight Hanna & Ada gateway; hardware evidence remains separate.'
      : 'At least 8 GB RAM is recommended for a comfortable local gateway + browser workflow.',
  });
}
