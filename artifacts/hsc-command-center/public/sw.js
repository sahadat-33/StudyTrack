const CACHE_PREFIX = 'hsc-command-center-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`;
const APP_SCOPE = new URL(self.registration.scope);
const APP_SHELL = new URL('index.html', APP_SCOPE).href;
const APP_MANIFEST = new URL('manifest.webmanifest', APP_SCOPE).href;
const APP_ICON = new URL('icons/app-icon.svg', APP_SCOPE).href;
const APP_ICON_192 = new URL('icons/icon-192.png', APP_SCOPE).href;
const APP_ICON_512 = new URL('icons/icon-512.png', APP_SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(APP_SHELL);
      if (!response.ok) {
        throw new Error('The app shell could not be loaded for offline use.');
      }
      const html = await response.clone().text();
      const shellAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], APP_SHELL))
        .filter(
          (url) =>
            url.origin === APP_SCOPE.origin &&
            url.pathname.startsWith(APP_SCOPE.pathname),
        )
        .map((url) => url.href);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(APP_SHELL, response);
      await cache.addAll([...new Set([APP_MANIFEST, APP_ICON, APP_ICON_192, APP_ICON_512, ...shellAssets])]);
    })()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (
    requestUrl.origin !== self.location.origin ||
    !requestUrl.pathname.startsWith(APP_SCOPE.pathname)
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(APP_SHELL, response.clone());
            return response;
          }
          if (response.status !== 404) return response;
        } catch {
          // Fall back to the cached app shell below when offline.
        }
        return (await caches.match(APP_SHELL)) ?? Response.error();
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response('Offline and not available in the app cache.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
