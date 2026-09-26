// Android-first route for the exact switched K+DCAN / INPA-compatible cable.
// Clean-room state model: no EdiabasLib source is copied here.
// Reference evidence only:
// - EdiabasLib documents standard FTDI-based INPA-compatible D-CAN/K-Line USB adapters on Android.
// - Its adapter matrix lists BMW-DS2 support for E39 and requires a pin 7+8 connection.
// - Actual cable chipset, switch wiring and vehicle connector remain runtime evidence.

export const AndroidKdcanStage = Object.freeze({
  USB_UNKNOWN: 'USB_UNKNOWN',
  USB_SERIAL_ONLY: 'USB_SERIAL_ONLY',
  REFERENCE_FTDI_ROUTE: 'REFERENCE_FTDI_ROUTE',
  LEGACY_WIRING_PENDING: 'LEGACY_WIRING_PENDING',
  ADAPTER_20PIN_PENDING: 'ADAPTER_20PIN_PENDING',
  READONLY_PROBE_READY: 'READONLY_PROBE_READY',
});

const supportedSerialFamilies = Object.freeze(['FTDI', 'CP210X', 'CH34X', 'PL2303']);

export function normalizeDriverFamily(value) {
  const v = String(value || '').trim().toUpperCase();
  return supportedSerialFamilies.includes(v) ? v : 'UNKNOWN';
}

export function assessAndroidKdcanRoute(input = {}) {
  const driverFamily = normalizeDriverFamily(input.driverFamily);
  const serialOpen = input.serialPortOpen === true;
  const pin78Verified = input.pin78RouteVerified === true;
  const round20 = input.round20Present;
  const adapter20 = input.adapter20PinVerified === true;

  if (!serialOpen || driverFamily === 'UNKNOWN') {
    return Object.freeze({
      stage: AndroidKdcanStage.USB_UNKNOWN,
      driverFamily,
      serialOpen,
      referenceCompatible: false,
      protocolProbeAllowed: false,
      ecuVerified: false,
      writesEnabled: false,
      nextStep: 'Najpierw potwierdź chipset/sterownik USB i stabilne otwarcie portu na Androidzie.',
    });
  }

  if (driverFamily !== 'FTDI') {
    return Object.freeze({
      stage: AndroidKdcanStage.USB_SERIAL_ONLY,
      driverFamily,
      serialOpen,
      referenceCompatible: false,
      protocolProbeAllowed: false,
      ecuVerified: false,
      writesEnabled: false,
      nextStep: 'USB-serial działa, ale referencyjna zgodność K+DCAN/DS2 dla tej rodziny nie jest potwierdzona. Nie wysyłaj komend BMW.',
    });
  }

  if (!pin78Verified) {
    return Object.freeze({
      stage: AndroidKdcanStage.LEGACY_WIRING_PENDING,
      driverFamily,
      serialOpen,
      referenceCompatible: true,
      protocolProbeAllowed: false,
      ecuVerified: false,
      writesEnabled: false,
      nextStep: 'Zweryfikuj trasę pinów 7↔8/przełącznik dla tego konkretnego kabla przed próbą BMW-DS2.',
    });
  }

  if (round20 === true && !adapter20) {
    return Object.freeze({
      stage: AndroidKdcanStage.ADAPTER_20PIN_PENDING,
      driverFamily,
      serialOpen,
      referenceCompatible: true,
      protocolProbeAllowed: false,
      ecuVerified: false,
      writesEnabled: false,
      nextStep: 'E39 ma złącze 20-pin: potwierdź zgodny adapter 20-pin↔OBD-II i jego mapowanie.',
    });
  }

  return Object.freeze({
    stage: AndroidKdcanStage.READONLY_PROBE_READY,
    driverFamily,
    serialOpen,
    referenceCompatible: true,
    protocolProbeAllowed: true,
    ecuVerified: false,
    writesEnabled: false,
    nextStep: 'Można przejść do ograniczonego read-only probe DS2/K-Line z jednoznaczną weryfikacją odpowiedzi ECU.',
  });
}
