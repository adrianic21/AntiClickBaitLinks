const CACHE_NAME = 'anticlickbait-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── Handle Web Share Target ───────────────────────────────────────────────
  if (url.pathname === '/share-target' && event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        const sharedUrl = url.searchParams.get('url') || '';
        const sharedText = url.searchParams.get('text') || '';
        const sharedTitle = url.searchParams.get('title') || '';

        const urlToSummarize = sharedUrl ||
          (sharedText.match(/https?:\/\/[^\s]+/)?.[0] ?? '') ||
          sharedTitle;

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

        if (clients.length > 0) {
          // App ya está abierta — enviar mensaje y enfocar
          clients[0].postMessage({ type: 'SHARE_TARGET', url: urlToSummarize });
          clients[0].focus();
          // Redirigir a raíz para que no quede la URL /share-target en la barra
          return Response.redirect('/', 302);
        } else {
          // FIX: App no está abierta — antes se llamaba openWindow() Y se hacía
          // Response.redirect(), lo que podía abrir dos pestañas simultáneamente.
          // Ahora solo se hace el redirect; el navegador abre la URL directamente.
          return Response.redirect('/?shared=' + encodeURIComponent(urlToSummarize), 302);
        }
      })()
    );
    return;
  }

  // ── Normal fetch handling ─────────────────────────────────────────────────
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
