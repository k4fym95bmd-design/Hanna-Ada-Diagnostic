import { identifyUsbSerialCandidate } from './usb-chipset-candidates.js';

const cleanHex = value => typeof value === 'string' && /^[0-9a-f]{4}$/i.test(value)
  ? value.toUpperCase() : '';

export function scoreCablePort(port = {}) {
  const path = typeof port.path === 'string' ? port.path.slice(0, 240) : '';
  const manufacturer = typeof port.manufacturer === 'string' ? port.manufacturer.slice(0, 100) : '';
  const vendorId = cleanHex(port.vendorId);
  const productId = cleanHex(port.productId);

  let score = 0;
  let family = 'UNKNOWN';
  const reasons = [];

  if (path) { score += 10; reasons.push('port-path'); }
  if (vendorId && productId) {
    score += 40;
    reasons.push('usb-id');
    try {
      const identified = identifyUsbSerialCandidate({
        vendorId: Number.parseInt(vendorId, 16),
        productId: Number.parseInt(productId, 16),
      });
      family = identified.family || 'UNKNOWN';
      if (!/Nieznany/i.test(identified.candidate || '')) {
        score += 30;
        reasons.push('known-usb-serial-family');
      }
    } catch {}
  }
  if (/FTDI|USB Serial|K\+?DCAN|INPA/i.test(manufacturer)) {
    score += 15;
    reasons.push('manufacturer-hint');
  }

  return Object.freeze({
    path,
    manufacturer,
    vendorId: vendorId || null,
    productId: productId || null,
    vidPid: vendorId && productId ? `${vendorId}:${productId}` : null,
    family,
    score,
    reasons: Object.freeze(reasons),
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}

export function assessCablePlugReadiness(ports = []) {
  if (!Array.isArray(ports) || ports.length > 100) throw new TypeError('Invalid serial port list');
  const ranked = ports
    .map(scoreCablePort)
    .filter(item => item.path)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const top = ranked[0] || null;
  const uniqueTop = top && (ranked.length === 1 || top.score > ranked[1].score);
  const hasUsbId = !!top?.reasons.includes('usb-id');
  const hasSerialHint = !!top?.reasons.some(reason =>
    reason === 'known-usb-serial-family' || reason === 'manufacturer-hint');
  const recommendedPath = uniqueTop && top.score >= 55 && hasUsbId && hasSerialHint ? top.path : null;

  return Object.freeze({
    detectedCount: ranked.length,
    ranked: Object.freeze(ranked),
    recommendedPath,
    readyToSelect: !!recommendedPath,
    readyToOpen: !!recommendedPath,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
    message: ranked.length === 0
      ? 'Nie wykryto portu szeregowego. Podłącz kabel USB i odśwież.'
      : recommendedPath
        ? `Wykryto kandydat kabla na ${recommendedPath}. To nadal nie potwierdza BMW ani ECU.`
        : 'Wykryto kilka możliwych portów. Wybierz właściwy port ręcznie.',
  });
}
