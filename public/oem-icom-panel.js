import { BMW_OEM_VCI, e39OemPath } from './oem-icom-profile.js';

// Adds an OEM BMW reference card to the EXISTING cable workbench.
// It is intentionally informational/read-only: no LAN scanning and no ICOM command path.
function attachOemCard() {
  const root = document.querySelector('#haCableWorkbench');
  if (!root || root.querySelector('[data-oem-icom-card]')) return;

  const path = e39OemPath({ productionYear: 1999, productionMonth: 1, hasEngineBay20Pin: true });
  const card = document.createElement('section');
  card.dataset.oemIcomCard = '';
  card.className = 'ha-cable-panel';
  card.innerHTML = `
    <h3>OEM BMW · ICOM Next</h3>
    <p><strong>Wzorzec autoryzowanego środowiska:</strong> ${BMW_OEM_VCI.primaryInterface} przez ${BMW_OEM_VCI.pcLink}.
    Dla starszego E39 z 20-pin: ${path.recommendedHardware.join(' + ')}.</p>
    <div class="ha-cable-steps">
      <div><span>01 · OEM VCI</span><b>POTWIERDZONE W DOKUMENTACJI BMW</b></div>
      <div><span>02 · Integracja Hanna & Ada</span><b>PLAN / NIEPOŁĄCZONE</b></div>
      <div><span>03 · ECU BMW</span><b>NIEPOTWIERDZONE</b></div>
    </div>
    <p>BMW AOS wskazuje ICOM Next jako rekomendowany VCI i połączenie komputera z ICOM przez LAN.
    Nasza aplikacja nie skanuje sieci, nie przejmuje sesji ISTA i nie wysyła poleceń do ICOM.</p>
    <p><strong>Stan:</strong> profil OEM dodany do projektu; rzeczywista warstwa transportowa ICOM i zweryfikowany odczyt ECU nie są jeszcze wdrożone.
    Zapis, kasowanie, kodowanie, aktywacje i flash pozostają zablokowane.</p>
  `;
  root.appendChild(card);
}

if (typeof document !== 'undefined') {
  const start = () => {
    const view = document.querySelector('#view');
    if (!view) return;
    new MutationObserver(attachOemCard).observe(view, { childList: true, subtree: true });
    attachOemCard();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
