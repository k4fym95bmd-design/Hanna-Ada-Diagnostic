// Target profile for the exact generic cable shown by the user:
// "K+DCAN USB Interface (INPA Compatible)" with a physical switch.
//
// This file deliberately separates what the label/photo proves from what must be
// verified at runtime. A switch position, VID:PID or open COM port never proves
// BMW protocol access or ECU identity.

export const KDCAN_INPA_SWITCH_TARGET = Object.freeze({
  id: 'generic-kdcan-inpa-switch',
  label: 'K+DCAN USB Interface (INPA Compatible)',
  physicalSwitch: true,
  switchMeaning: 'UNVERIFIED',
  targetVehicle: 'BMW E39 540i (1999)',
  writeCapability: false,
  codingCapability: false,
  flashCapability: false,
});

export function usbIdentity({ vendorId, productId, manufacturer = '' } = {}) {
  const valid = Number.isInteger(vendorId) && vendorId >= 0 && vendorId <= 0xffff
    && Number.isInteger(productId) && productId >= 0 && productId <= 0xffff;
  if (!valid) return Object.freeze({ vidPid: null, manufacturer: String(manufacturer || '').slice(0, 100), verified: false });
  const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
  return Object.freeze({
    vidPid: `${hex(vendorId)}:${hex(productId)}`,
    manufacturer: String(manufacturer || '').slice(0, 100),
    verified: true,
  });
}

export function resolveSwitchEvidence({ position = 'UNKNOWN', pin78Continuity = null } = {}) {
  const normalized = ['A', 'B', 'UNKNOWN'].includes(position) ? position : 'UNKNOWN';
  const measured = typeof pin78Continuity === 'boolean';
  return Object.freeze({
    position: normalized,
    pin78Continuity: measured ? pin78Continuity : null,
    meaningVerified: measured,
    description: measured
      ? `Pozycja ${normalized}: ciągłość pinów 7↔8 = ${pin78Continuity ? 'TAK' : 'NIE'} (pomiar lokalny).`
      : 'Znaczenie przełącznika niepotwierdzone. Nie przypisuj pozycji do pinów na podstawie wyglądu kabla.',
  });
}

export function resolveE39Connector({ round20Present = null } = {}) {
  if (round20Present === true) {
    return Object.freeze({
      mode: 'ROUND_20PIN',
      adapterNeeded: true,
      nextStep: 'Użyj zgodnego adaptera BMW 20-pin ↔ OBD-II i najpierw wykonaj odczyt tylko do identyfikacji modułów.',
    });
  }
  if (round20Present === false) {
    return Object.freeze({
      mode: 'OBD2_16PIN',
      adapterNeeded: false,
      nextStep: 'Użyj złącza OBD-II 16-pin; zakres dostępnych modułów nadal wymaga potwierdzenia w aucie.',
    });
  }
  return Object.freeze({
    mode: 'VERIFY_ON_VEHICLE',
    adapterNeeded: null,
    nextStep: 'Sprawdź, czy egzemplarz ma okrągłe BMW 20-pin pod maską. Nie zakładaj pełnego dostępu przez samo 16-pin.',
  });
}

export function kdcanRuntimeStatus({ usb = {}, portOpen = false, switchEvidence = {}, connector = {} } = {}) {
  const identity = usbIdentity(usb);
  const sw = resolveSwitchEvidence(switchEvidence);
  const vehicle = resolveE39Connector(connector);
  return Object.freeze({
    target: KDCAN_INPA_SWITCH_TARGET,
    usb: identity,
    portOpen: portOpen === true,
    switch: sw,
    vehicleConnector: vehicle,
    ecuVerified: false,
    writesEnabled: false,
    codingEnabled: false,
    flashEnabled: false,
    nextGate: !identity.verified ? 'Odczytaj VID:PID kabla.'
      : !portOpen ? 'Otwórz właściwy port USB-serial bez wysyłania poleceń.'
      : !sw.meaningVerified ? 'Zweryfikuj znaczenie przełącznika na tym konkretnym kablu.'
      : 'Następny etap: kontrolowany read-only handshake BMW z jednoznaczną odpowiedzią ECU.',
  });
}
