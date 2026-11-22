// Cache-first offline shell. Bump V after changing any file.
const V = 'vox-v1';
const FILES = ['./', 'index.html', 'style.css', 'data.js', 'lib.js', 'app.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.oninstall = e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
self.onactivate = e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
self.onfetch = e => e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
