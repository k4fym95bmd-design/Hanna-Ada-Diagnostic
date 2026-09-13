const advancedFallback = [
  { stage: 4, name: 'Stage 4 — Custom Performance', availability: 'CUSTOM_ONLY', marketing: { label: 'CUSTOM · DYNO/HARDWARE VALIDATION REQUIRED' } },
  { stage: 5, name: 'Stage 5 — Race / Track+', availability: 'CUSTOM_ONLY', marketing: { label: 'CUSTOM · TRACK HARDWARE REQUIRED' } },
  { stage: 6, name: 'Stage 6 — Motorsport / FI+', availability: 'CUSTOM_ONLY', marketing: { label: 'CUSTOM · MOTORSPORT VALIDATION REQUIRED' } },
  { stage: 7, name: 'Stage 7 — Bespoke Engineering', availability: 'CUSTOM_ONLY', marketing: { label: 'BESPOKE · ENGINEERING REVIEW REQUIRED' } }
];

let advancedStages = advancedFallback;
try {
  const config = await fetch('/api/tuning-products').then(r => r.json());
  if (Array.isArray(config.advancedStages) && config.advancedStages.length) advancedStages = config.advancedStages;
} catch {}

function advancedCard(stage) {
  const article = document.createElement('article');
  article.className = 'product red';
  article.dataset.advancedStage = String(stage.stage);

  const type = document.createElement('div');
  type.className = 'type';
  type.textContent = `STAGE ${stage.stage} · CUSTOM`;

  const title = document.createElement('h2');
  title.textContent = String(stage.name || `Stage ${stage.stage}`).replace(/^Stage \d+\s*[—-]\s*/, '');

  const price = document.createElement('div');
  price.className = 'price';
  price.innerHTML = 'CUSTOM <small style="font-size:10px;color:var(--muted)"> / project</small>';

  const gain = document.createElement('div');
  gain.className = 'gain';
  gain.textContent = stage.marketing?.label || 'VALIDATION REQUIRED';

  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = stage.description || 'Advanced custom calibration. Exact ECU, stock base, hardware and validation data are required.';

  const chip = document.createElement('span');
  chip.className = 'chip red';
  chip.textContent = 'PROTOCOL REQUIRED';

  const button = document.createElement('button');
  button.className = 'button danger';
  button.style.width = '100%';
  button.style.marginTop = '12px';
  button.disabled = true;
  button.textContent = 'CUSTOM VALIDATION FIRST';

  article.append(type, title, price, gain, desc, chip, button);
  return article;
}

function patchTuningUi() {
  const view = document.querySelector('#view');
  if (!view) return;

  const heading = [...view.querySelectorAll('h1')].find(el => /3 Stages \+ M5 Character/i.test(el.textContent || ''));
  if (heading) heading.textContent = 'Stages 1–7 + M5 Character';

  const heroCopy = [...view.querySelectorAll('.hero p')].find(el => /Exactly three numbered stages/i.test(el.textContent || ''));
  if (heroCopy) heroCopy.textContent = 'Stage 1–3 are core catalog products. Stage 4–7 are advanced custom tiers. M5 Character / Booster remains a separate premium product.';

  for (const p of document.querySelectorAll('p')) {
    if ((p.textContent || '').includes('Stage 1, 2, 3 plus separate M5 Character / Booster.')) {
      p.textContent = 'Stage 1–7 plus separate M5 Character / Booster.';
    }
  }

  const grid = view.querySelector('.product-grid');
  if (!grid || grid.dataset.advancedStages === '1') return;
  advancedStages.forEach(stage => grid.appendChild(advancedCard(stage)));
  grid.dataset.advancedStages = '1';
}

const view = document.querySelector('#view');
if (view) new MutationObserver(patchTuningUi).observe(view, { childList: true, subtree: true });
patchTuningUi();
