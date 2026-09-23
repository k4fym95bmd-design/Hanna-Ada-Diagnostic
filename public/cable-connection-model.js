// Shared evidence model for USB direct and authenticated Windows bridge modes.
// Opening USB serial NEVER proves an E39 ECU or any BMW protocol capability.
export const CABLE_STAGES = Object.freeze(['NO_CABLE', 'CABLE_DETECTED', 'PORT_OPEN', 'ECU_VERIFIED']);

export function validateBridgeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Podaj poprawny adres mostu.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new TypeError('Most przez sieć wymaga HTTPS; HTTP tylko na tym samym komputerze (localhost).');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Adres nie może zawierać hasła, parametrów ani ścieżki.');
  }
  return url.origin;
}

export function cableStatus(input = {}) {
  const detected = input.cableDetected === true;
  const opened = detected && input.portOpen === true;
  // The browser-side connection model is not an ECU identity authority.
  // Until a dedicated local read-only identity validator is wired in, no caller-supplied
  // object may promote a USB/serial session to ECU_VERIFIED.
  const verified = false;
  const stage = opened ? 'PORT_OPEN' : detected ? 'CABLE_DETECTED' : 'NO_CABLE';
  return Object.freeze({
    stage,
    cableDetected: detected,
    portOpen: opened,
    ecuVerified: verified,
    bmwModulesVerified: Object.freeze([]),
    writesEnabled: false,
    flashEnabled: false,
    nextStep: stage === 'NO_CABLE' ? 'Wykryj kabel USB lub sprawdź most Windows.'
      : stage === 'CABLE_DETECTED' ? 'Uzyskaj zgodę i otwórz port USB-serial.'
      : 'Port otwarty. BMW ECU wymaga osobnego lokalnego walidatora odpowiedzi read-only; przeglądarka sama nie może potwierdzić ECU.',
  });
}

export function validateBridgeStatus(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || value.transport !== 'physical-vci'
      || typeof value.cableDetected !== 'boolean' || typeof value.portOpen !== 'boolean'
      || value.ecuVerified !== false || value.writesEnabled !== false || value.flashEnabled !== false) {
    throw new TypeError('Nieprawidłowy lub niebezpieczny status mostu.');
  }
  return cableStatus({ cableDetected: value.cableDetected, portOpen: value.portOpen });
}
