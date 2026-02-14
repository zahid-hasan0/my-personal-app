const CACHE_NAME = 'hishab-v1';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './main.js',
    './firebase-config.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
