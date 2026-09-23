const loaded = new Map();
const loadedStyles = new Map();
const prefetched = new Set();
const modulePreloaded = new Set();
const prefetchQueue = [];
let prefetchInFlight = 0;

const deviceMemory = Number(navigator.deviceMemory || 4);
const hardwareConcurrency = Number(navigator.hardwareConcurrency || 4);
const connection = navigator.connection;
const constrainedDevice = deviceMemory <= 2 || hardwareConcurrency <= 2;
const constrainedNetwork = connection?.saveData === true || ['slow-2g','2g'].includes(connection?.effectiveType);
const PREFETCH_CONCURRENCY = constrainedDevice || constrainedNetwork ? 1 : 2;
const BACKGROUND_PREFETCH_LIMIT = constrainedDevice || constrainedNetwork ? 0 : 4;

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

const networkAllowsPrefetch = () => !constrainedNetwork;

const scheduleBackground = task => {
  if (globalThis.scheduler?.postTask) {
    return scheduler.postTask(task, { priority: 'background' }).catch(() => undefined);
  }
  if ('requestIdleCallback' in window) {
    return new Promise(resolve => window.requestIdleCallback(() => resolve(task()), { timeout: 1200 }));
  }
  return new Promise(resolve => setTimeout(() => resolve(task()), 0));
};

const pumpPrefetch = () => {
  while (prefetchInFlight < PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const path = prefetchQueue.shift();
    prefetchInFlight++;
    void scheduleBackground(async () => {
      if (document.hidden || !networkAllowsPrefetch()) return;
      const probe = document.createElement('link');
      if (probe.relList?.supports?.('prefetch') === true) {
        probe.rel = 'prefetch';
        probe.as = 'script';
        probe.href = path;
        probe.fetchPriority = 'low';
        document.head.appendChild(probe);
        return;
      }
      await fetch(path, {
        method: 'GET',
        cache: 'force-cache',
        credentials: 'same-origin',
        priority: 'low',
      }).catch(() => undefined);
    }).finally(() => {
      prefetchInFlight--;
      pumpPrefetch();
    });
  }
};

const prefetchModule = path => {
  if (prefetched.has(path) || !networkAllowsPrefetch()) return;
  prefetched.add(path);
  prefetchQueue.push(path);
  pumpPrefetch();
};

const modulePreload = path => {
  if (modulePreloaded.has(path) || loaded.has(path) || !networkAllowsPrefetch()) return;
  modulePreloaded.add(path);
  const link = document.createElement('link');
  if (link.relList?.supports?.('modulepreload') !== true) {
    prefetchModule(path);
    return;
  }
  link.rel = 'modulepreload';
  link.href = path;
  link.fetchPriority = constrainedDevice ? 'low' : 'auto';
  document.head.appendChild(link);
};

const waitForVisible = () => new Promise(resolve => {
  if (!document.hidden) { resolve(); return; }
  const onVisibility = () => {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', onVisibility);
    resolve();
  };
  document.addEventListener('visibilitychange', onVisibility);
});

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

const TUNING_MODULES = Object.freeze([
  '/tuning-stage-extension.js',
  '/tuning-analysis-panel.js',
]);
const OBD_MODULES = Object.freeze([
  '/obd-runtime.js',
  '/terminal-readonly-guard.js',
  '/diagnostic-core.js',
  '/diagnostic-core-v2.js',
  '/live-performance-core.js',
  '/live-performance-runtime.js',
]);
const CABLE_MODULES = Object.freeze([
  '/cable-workbench.js',
  '/cable-connection-model.js',
  '/evidence-contract.js',
  '/bridge-state-ordering.js',
  '/bridge-error-policy.js',
  '/cable-plug-readiness.js',
  '/usb-chipset-candidates.js',
  '/kdcan-cable-profile.js',
  '/cable-rx-panel.js',
  '/kdcan-cable-panel.js',
  '/universal-transport-router.js',
  '/universal-platform-panel.js',
]);
const HARDWARE_MODULES = Object.freeze([
  '/oem-icom-panel.js',
  '/webusb-workbench-extension.js',
  '/desktop-host-bridge.js',
  '/desktop-pro-panel.js',
]);

async function loadObdStack() {
  await Promise.all([
    loadStyle('/pro-runtime.css'),
    loadStyle('/diagnostic-core-v2.css'),
    loadStyle('/live-performance.css'),
  ]);
  // Keep exactly one OBD session owner; ULTRA attaches only after the runtime exists.
  await importOnce('/obd-runtime.js');
  await Promise.all([
    importOnce('/terminal-readonly-guard.js'),
    importOnce('/diagnostic-core-v2.js'),
  ]);
  await importOnce('/live-performance-runtime.js');
}

async function loadCableStack() {
  await loadStyle('/cable-workbench.css');
  await importOnce('/cable-workbench.js');
  await Promise.all([
    importOnce('/cable-rx-panel.js'),
    importOnce('/kdcan-cable-panel.js'),
    importOnce('/universal-platform-panel.js'),
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

async function loadForModule(module) {
  if (module === 'tuning') return loadTuning();
  if (module === 'vci') {
    await Promise.all([loadObdStack(), loadCableStack()]);
    return loadHardwareExtras();
  }
  if (module === 'bmw-expert') {
    await loadCableStack();
    return loadHardwareExtras();
  }
  return null;
}

function warmForModule(module) {
  if (!networkAllowsPrefetch()) return;
  if (module === 'tuning') TUNING_MODULES.forEach(modulePreload);
  if (module === 'vci') {
    OBD_MODULES.forEach(modulePreload);
    CABLE_MODULES.forEach(modulePreload);
    HARDWARE_MODULES.forEach(modulePreload);
  }
  if (module === 'bmw-expert') {
    CABLE_MODULES.forEach(modulePreload);
    HARDWARE_MODULES.forEach(modulePreload);
  }
}

window.addEventListener('hannaada:module-rendered', event => {
  const module = event.detail?.module;
  warmForModule(module);
  void loadForModule(module);
});

document.getElementById('nav')?.addEventListener('pointerover', event => {
  const button = event.target.closest?.('.nav-button[data-module]');
  if (button) warmForModule(button.dataset.module);
}, { passive: true });

document.getElementById('nav')?.addEventListener('focusin', event => {
  const button = event.target.closest?.('.nav-button[data-module]');
  if (button) warmForModule(button.dataset.module);
});
document.getElementById('nav')?.addEventListener('pointerdown', event => {
  const button = event.target.closest?.('.nav-button[data-module]');
  if (button) warmForModule(button.dataset.module);
}, { passive: true });

(async () => {
  await waitForVisible();
  await afterFirstPaint();

  // If the initial module event fired before this bootstrap attached, recover from
  // the current active nav state without loading every diagnostic subsystem.
  const initialModule = document.querySelector('#nav .nav-button.active')?.dataset.module || 'home';
  await loadForModule(initialModule);

  await idle();
  // Background work is intentionally capped. Compile-heavy modulepreload is reserved
  // for explicit pointer/focus intent; idle time only warms a few likely entry points.
  if (BACKGROUND_PREFETCH_LIMIT > 0) {
    const likely = ['/obd-runtime.js','/cable-workbench.js','/tuning-stage-extension.js'];
    if ('usb' in navigator) likely.push('/webusb-workbench-extension.js');
    if (window.__TAURI_INTERNALS__ || window.__TAURI__) likely.push('/desktop-pro-panel.js');
    likely.slice(0, BACKGROUND_PREFETCH_LIMIT).forEach(prefetchModule);
  }
})();
