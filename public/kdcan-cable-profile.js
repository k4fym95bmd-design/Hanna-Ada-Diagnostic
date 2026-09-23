import { identifyUsbSerialCandidate } from './usb-chipset-candidates.js';

// Visual profile for the user's photographed cable. The label and selector are visible,
// but the internal USB chipset, driver, serial settings and BMW protocol support are NOT.
export const USER_KDCAN_CABLE = Object.freeze({
  visibleLabel: 'K+DCAN USB Interface (INPA Compatible)',
  familyHint: 'K+DCAN / INPA-compatible',
  selectorPresent: true,
  chipsetVerified: false,
  serialDriverVerified: false,
  bmwProtocolVerified: false,
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
});

export function assessUserKdcanCable({
  vendorId,
  productId,
  portOpen = false,
  selectorPosition = 'unknown',
} = {}) {
  const allowedSelector = new Set(['unknown', 'position-1', 'position-2']);
  if (!allowedSelector.has(selectorPosition)) throw new TypeError('Invalid cable selector position');

  let usb = null;
  if (Number.isInteger(vendorId) && Number.isInteger(productId)) {
    usb = identifyUsbSerialCandidate({ vendorId, productId });
  } else if (vendorId != null || productId != null) {
    throw new TypeError('VID and PID must be provided together');
  }

  return Object.freeze({
    visibleLabel: USER_KDCAN_CABLE.visibleLabel,
    familyHint: USER_KDCAN_CABLE.familyHint,
    selectorPresent: true,
    selectorPosition,
    vidPid: usb?.vidPid ?? null,
    chipsetCandidate: usb?.candidate ?? 'Nieustalony — potrzebny VID:PID z systemu',
    chipsetVerified: false,
    serialDriverVerified: false,
    usbSerialOpen: portOpen === true,
    bmwProtocolVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
    nextStep: usb
      ? 'VID:PID rozpoznany tylko jako wskazówka rodziny układu. Potwierdź sterownik i zachowaj BMW/ECU jako niezweryfikowane.'
      : 'Najpierw odczytaj VID:PID z wybranego portu USB. Nie zgaduj chipsetu po obudowie kabla.',
  });
}
