const loaded = new Map();
const loadedStyles = new Map();
const prefetched = new Set();

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

const loadStyle = path => {
  if (!loadedStyles.has(path)) {
    loadedStyles.set(path, new Promise(resolve => {
      const existing = document.querySelector(`link[rel="stylesheet"][href="${path}"]`);
      if (existing) { resolve(existing); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => resolve(null), { once: true });
      document.head.appendChild(link);
    }));
  }
  return loadedStyles.get(path);
};

const prefetchModule = path => {
  if (prefetched.has(path)) return;
  prefetched.add(path);
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'script';
  link.href = path;
  link.fetchPriority = 'low';
  document.head.appendChild(link);
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
  await Promise.all([
    loadStyle('/pro-runtime.css'),
    loadStyle('/diagnostic-core-v2.css'),
    loadStyle('/cable-workbench.css'),
    loadStyle('/live-performance.css'),
  ]);
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
  ['/tuning-stage-extension.js','/tuning-analysis-panel.js','/oem-icom-panel.js'].forEach(prefetchModule);
  if ('usb' in navigator) prefetchModule('/webusb-workbench-extension.js');
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
    prefetchModule('/desktop-host-bridge.js');
    prefetchModule('/desktop-pro-panel.js');
  }
})();
