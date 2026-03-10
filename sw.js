const CACHE_NAME = 'bill-ai-v2';
const urls = [
    '/',
    '/index.html',
    '/styles.css',
    '/app-ia.js',
    'https://unpkg.com/tesseract.js@5.0.0/dist/tesseract.min.js'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urls)));
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(response => {
            if (response) return response;
            return fetch(e.request).catch(() => {
                if (e.request.destination === 'image') {
                    return new Response('', { status: 404 });
                }
            });
        })
    );
});
