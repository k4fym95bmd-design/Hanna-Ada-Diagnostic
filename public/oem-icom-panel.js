import { BMW_OEM_VCI, buildE39OemStation } from './oem-icom-profile.js';

// Adds an OEM BMW reference card to the EXISTING cable workbench.
// It is intentionally informational/read-only: no LAN scanning and no ICOM command path.
function attachOemCard() {
  const root = document.querySelector('#haCableWorkbench');
  if (!root || root.querySelector('[data-oem-icom-card]')) return;

  const station = buildE39OemStation({ productionYear: 1999, productionMonth: 1, hasEngineBay20Pin: true });
  const card = document.createElement('section');
  card.dataset.oemIcomCard = '';
  card.className = 'ha-cable-panel';
  card.innerHTML = `
    <h3>OEM BMW · ICOM Next</h3>
    <p><strong>Wzorzec stanowiska BMW:</strong> ${station.requiredHardware.join(' + ')} przez ${BMW_OEM_VCI.pcLink}.</p>
    <div class="ha-cable-steps">
      <div><span>01 · OEM VCI</span><b>${BMW_OEM_VCI.primaryInterface} · POTWIERDZONE</b></div>
      <div><span>02 · Diagnoza E39</span><b>${station.diagnosis.software}</b></div>
      <div><span>03 · Programowanie E-series</span><b>${station.programming.software} · ZEWNĘTRZNY POWER SUPPLY WYMAGANY</b></div>
      <div><span>04 · Hanna & Ada</span><b>READ-ONLY COMPANION · NIE PRZEJMUJE SESJI ISTA</b></div>
    </div>
    <p>BMW dokumentuje ICOM Next jako rekomendowany VCI. PC↔ICOM pracuje po LAN; dla diagnozy/programowania wymagane jest co najmniej 100 Mbit/s, a adres IP nie powinien zmieniać się podczas sesji.</p>
    <p>Dla E39 diagnoza i test-plany pozostają po stronie <strong>ISTA</strong>; programowanie E-series po stronie <strong>ISTA/P</strong>. Firmware ICOM jest utrzymywany przez ISTA Connection Manager.</p>
    <p><strong>Stan:</strong> profil OEM, bramka dowodowa i pamięć jednej sesji są w projekcie; rzeczywisty transport ICOM i zweryfikowany odczyt ECU nie są jeszcze wdrożone. Zapis, kasowanie, kodowanie, aktywacje i flash pozostają zablokowane.</p>
  `;
  root.appendChild(card);
}

if (typeof document !== 'undefined') {
  const start = () => {
    window.addEventListener('hannaada:cable-workbench-mounted', attachOemCard);
    attachOemCard();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
