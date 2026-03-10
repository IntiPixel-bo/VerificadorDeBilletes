const CACHE_NAME = 'verif-serie-b-v1';
const urlsToCache = [
  '/verificador-serie-b/',
  '/verificador-serie-b/index.html',
  '/verificador-serie-b/styles.css',
  '/verificador-serie-b/app.js',
  '/verificador-serie-b/ranges.json',
  'https://unpkg.com/tesseract.js@4.1.1/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0/dist/tf.min.js'
];

// Instalación
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activación
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // Si es una petición de API o recurso no cacheado, retornar error amigable
          if (event.request.url.includes('api')) {
            return new Response(JSON.stringify({error: 'Modo offline - datos no disponibles'}), {
              headers: {'Content-Type': 'application/json'}
            });
          }
        });
      })
  );
});
