// sw.js
const CACHE_NAME = 'gong-v1';
const CORE_ASSETS = [
    '/gong/',              // index
    '/gong/manifest.webmanifest',
    '/gong/css/style.css',
    '/gong/js/gong.js'
];

// Install: precache core
self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS)));
    self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

const isHTML = (req) =>
    req.destination === 'document' ||
    (req.headers.get('accept') || '').includes('text/html');

// Fetch: strategies per type
self.addEventListener('fetch', (e) => {
    const req = e.request;

    if (isHTML(req)) {
        // Network-first for HTML with offline fallback to cached '/'
        e.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => { });
                    return res;
                })
                .catch(async () => (await caches.match(req)) || (await caches.match('/')))
        );
        return;
    }

    // Stale-while-revalidate for static assets
    e.respondWith(
        caches.match(req).then((cached) => {
            const fetchPromise = fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => { });
                    return res;
                })
                .catch(() => cached); // if network fails, use cache
            return cached || fetchPromise;
        })
    );
});
