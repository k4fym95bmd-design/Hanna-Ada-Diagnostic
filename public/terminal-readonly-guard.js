// Temporary safety gate for the legacy browser terminal. Read-only commands
// only; vehicle coding, actuation, adaptation, DTC clearing and flash excluded.
// A future transport rewrite should enforce this policy at the command layer.
export function isReadOnlyELMCommand(command) {
  if (typeof command !== 'string') return false;
  const normalized = command.trim().toUpperCase();
  return /^(?:ATI|ATDP|ATDPN|ATRV|01[0-9A-F]{2}|03|07|0A)$/.test(normalized);
}

if (typeof document !== 'undefined') {
  const guard = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const sendClick = event.type === 'click' && !!target.closest('#haRawSend');
    const sendEnter = event.type === 'keydown' && event.key === 'Enter' &&
      !!target.closest('#haRawInput');
    if (!sendClick && !sendEnter) return;
    const command = document.querySelector('#haRawInput')?.value ?? '';
    if (isReadOnlyELMCommand(command)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message = 'Terminal: dozwolone wyłącznie odczyty ATI, ATDP, ATDPN, ATRV, 01xx, 03, 07 i 0A. Polecenie zablokowane.';
    const status = document.querySelector('#haRuntimeStatus');
    if (status) { status.textContent = message; status.classList.add('bad'); }
  };
  document.addEventListener('click', guard, true);
  document.addEventListener('keydown', guard, true);
}
