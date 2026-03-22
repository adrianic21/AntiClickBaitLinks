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
  // When the user shares a URL to our app from another app, the OS sends a
  // GET request to /share-target?url=...&text=...&title=...
  // We intercept it here, extract the URL, and redirect to the app root
  // with the shared URL stored in sessionStorage so the app can pick it up.
  if (url.pathname === '/share-target' && event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        // Extract the shared content from query params
        const sharedUrl = url.searchParams.get('url') || '';
        const sharedText = url.searchParams.get('text') || '';
        const sharedTitle = url.searchParams.get('title') || '';

        // The actual URL to summarize: prefer explicit url param,
        // then try to extract a URL from the text param
        const urlToSummarize = sharedUrl ||
          (sharedText.match(/https?:\/\/[^\s]+/)?.[0] ?? '') ||
          sharedTitle;

        // Open (or focus) the app window and send the URL to it
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

        if (clients.length > 0) {
          // App is already open — send message to it
          clients[0].postMessage({ type: 'SHARE_TARGET', url: urlToSummarize });
          clients[0].focus();
        } else {
          // App is not open — open it with the URL as a query param
          self.clients.openWindow(`/?shared=${encodeURIComponent(urlToSummarize)}`);
        }

        // Redirect to the app root
        return Response.redirect('/?shared=' + encodeURIComponent(urlToSummarize), 302);
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
