const CACHE_PREFIX = 'hanna-ada-static-';
const CACHE_NAME = CACHE_PREFIX + 'ultra-v3';

const PRECACHE = Object.freeze([
  '/',
  '/app.css',
  '/mobile.css',
  '/app.js',
  '/mobile-shell.js',
  '/ultra-bootstrap.js',
  '/manifest.webmanifest',
  '/icon.svg',
]);

const RUNTIME = new Set([
  '/pro-runtime.css',
  '/diagnostic-core-v2.css',
  '/cable-workbench.css',
  '/live-performance.css',
  '/obd-runtime.js',
  '/terminal-readonly-guard.js',
  '/diagnostic-core-v2.js',
  '/diagnostic-core.js',
  '/cable-workbench.js',
  '/cable-connection-model.js',
  '/evidence-contract.js',
  '/bridge-state-ordering.js',
  '/bridge-error-policy.js',
  '/cable-plug-readiness.js',
  '/usb-chipset-candidates.js',
  '/cable-rx-panel.js',
  '/kdcan-cable-profile.js',
  '/kdcan-cable-panel.js',
  '/universal-transport-router.js',
  '/universal-platform-panel.js',
  '/live-performance-core.js',
  '/live-performance-runtime.js',
  '/tuning-view.js',
  '/tuning-stage-extension.js',
  '/tuning-analysis-core.js',
  '/tuning-analysis-panel.js',
  '/oem-icom-profile.js',
  '/oem-icom-panel.js',
  '/webusb-cable-discovery.js',
  '/webusb-workbench-extension.js',
  '/desktop-host-bridge.js',
  '/desktop-receive-evidence.js',
  '/read-only-request-registry.js',
  '/trusted-identity-verifier.js',
  '/trusted-correlation-session.js',
  '/trusted-identity-event.js',
  '/read-only-identity-finalizer.js',
  '/identity-parser-profile.js',
  '/me72-identity-parser.js',
  '/desktop-pro-panel.js',
]);

const cacheable = response =>
  response && response.ok && (response.type === 'basic' || response.type === 'default');

async function updateStatic(request) {
  const response = await fetch(request, { cache: 'no-cache' });
  if (!cacheable(response)) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE.map(async url => {
      const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
      if (cacheable(response)) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable().catch(() => undefined);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')
      || url.pathname === '/health'
      || url.pathname.startsWith('/config/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        const fresh = preloaded || await fetch(request, { cache: 'no-cache' });
        if (cacheable(fresh)) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put('/', fresh.clone()));
        }
        return fresh;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (!PRECACHE.includes(url.pathname) && !RUNTIME.has(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      event.waitUntil(updateStatic(request).catch(() => undefined));
      return cached;
    }
    return updateStatic(request);
  })());
});
