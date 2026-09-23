const loaded = new Map();

const importOnce = path => {
  if (!loaded.has(path)) {
    loaded.set(path, import(path).catch(error => {
      loaded.delete(path);
      console.warn('Hanna & Ada lazy module failed:', path, error?.message || error);
      return null;
    }));
  }
  return loaded.get(path);
};

const afterFirstPaint = () => new Promise(resolve => {
  if (document.hidden || typeof requestAnimationFrame !== 'function') {
    resolve();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const idle = () => new Promise(resolve => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(resolve, { timeout: 1200 });
  } else {
    setTimeout(resolve, 0);
  }
});

async function loadDiagnosticCore() {
  // Keep one canonical OBD session owner. The performance layer loads only after it.
  await importOnce('/obd-runtime.js');
  await Promise.all([
    importOnce('/terminal-readonly-guard.js'),
    importOnce('/diagnostic-core-v2.js'),
    importOnce('/cable-workbench.js'),
  ]);
  await Promise.all([
    importOnce('/cable-rx-panel.js'),
    importOnce('/kdcan-cable-panel.js'),
    importOnce('/universal-platform-panel.js'),
    importOnce('/live-performance-runtime.js'),
  ]);
}

async function loadTuning() {
  await importOnce('/tuning-stage-extension.js');
  await importOnce('/tuning-analysis-panel.js');
}

async function loadHardwareExtras() {
  await importOnce('/oem-icom-panel.js');
  if ('usb' in navigator) await importOnce('/webusb-workbench-extension.js');
  const tauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  if (tauri) {
    await importOnce('/desktop-host-bridge.js');
    await importOnce('/desktop-pro-panel.js');
  }
}

window.addEventListener('hannaada:module-rendered', event => {
  const module = event.detail?.module;
  if (module === 'tuning') void loadTuning();
  if (module === 'vci' || module === 'bmw-expert') void loadHardwareExtras();
});

(async () => {
  await afterFirstPaint();
  await loadDiagnosticCore();
  await idle();
  await Promise.all([loadTuning(), loadHardwareExtras()]);
})();
