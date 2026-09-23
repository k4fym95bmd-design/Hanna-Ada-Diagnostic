import { assessTuningAnalysis, createAnalysisSummary } from './tuning-analysis-core.js';

function patchTuningAnalysis() {
  const view = document.querySelector('#view');
  if (!view) return;
  const heading = [...view.querySelectorAll('h1')].find(el => /Stages|Tuning/i.test(el.textContent || ''));
  if (!heading) return;
  let box = view.querySelector('[data-tuning-analysis-only]');
  if (!box) {
    box = document.createElement('section');
  box.dataset.tuningAnalysisOnly = '';
  box.className = 'ha-cable-panel';
  const result = assessTuningAnalysis({});
  const summary = createAnalysisSummary(result);
  box.innerHTML = `
    <h3>Tuning Lab · analiza diagnostyczna</h3>
    <p><strong>${summary.label}</strong> · tryb ANALYSIS ONLY.</p>
    <p>Porównujemy identyfikację ECU, stock hash, profil sprzętu, checksum reference, stabilność sesji i logi. Aplikacja nie generuje wsadów i nie udostępnia zapisu/flashowania.</p>
    <p data-tuning-analysis-status>${result.nextStep}</p>
  `;
    heading.closest('.hero')?.insertAdjacentElement('afterend', box);
  }

  view.querySelectorAll('.product .button').forEach(button => {
    button.disabled = true;
    button.textContent = 'ANALYSIS ONLY';
  });
}

if (typeof document !== 'undefined') {
  const start = () => {
    window.addEventListener('hannaada:module-rendered', patchTuningAnalysis);
    patchTuningAnalysis();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}
