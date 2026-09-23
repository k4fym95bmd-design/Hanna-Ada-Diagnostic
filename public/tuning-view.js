const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

export function renderTuningBody(catalog = {}) {
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const cards = products.map(product => {
    const premium = product.kind === 'premium_character';
    const stage = Number.isInteger(product.stage) ? product.stage : null;
    const title = esc(String(product.name || '').replace(/^Stage \d — /, ''));
    const label = esc(product.marketing?.label || 'Vehicle-specific M5-inspired character calibration');
    const description = esc(product.description || 'VIN/ECU/stock-hash bound calibration. Availability depends on exact ECU and stock base.');
    const type = product.kind === 'stage' ? `STAGE ${stage}` : 'PREMIUM · SEPARATE PRODUCT';
    const suffix = stage === 3 ? 'base' : 'VIN';
    return `<article class="product ${stage === 3 || premium ? 'red' : ''}"><div class="type">${type}</div><h2>${title}</h2><div class="price">€${product.price ?? '—'}<small style="font-size:10px;color:var(--muted)"> / ${suffix}</small></div><div class="gain">${label}</div><div class="desc">${description}</div><span class="chip red">PROTOCOL REQUIRED</span><button class="button danger" style="width:100%;margin-top:12px" disabled>IDENTIFY ECU FIRST</button></article>`;
  }).join('');

  const gates = [
    ['ECU ID', 'VIN, DME family, HW/SW'],
    ['STOCK BACKUP', 'Read, hash and validate original'],
    ['COMPATIBILITY', 'Exact target + stock-base match'],
    ['CHECKSUM + VOLTAGE', 'Protocol, signature and power preflight'],
  ].map(([title, text], index) =>
    `<div class="card"><h3>0${index + 1} · ${title}</h3><p>${text}</p></div>`
  ).join('');

  return `<div class="product-grid">${cards || '<div class="warn">Tuning catalog unavailable. Write remains locked.</div>'}</div><div class="section-title">SAFE FLASH PIPELINE</div><div class="panel"><div class="grid cols-4">${gates}</div><div class="warn" style="margin-top:12px">Flash is intentionally blocked in this web shell. Real ECU programming requires a verified write transport, tested calibration pipeline and recovery strategy.</div></div>`;
}
