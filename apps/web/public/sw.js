/*
 * Service worker d'i-am-in : rend l'application installable et garde sa coquille (HTML, scripts,
 * styles, polices, icônes) pour qu'elle s'ouvre même sans réseau.
 *
 * Règle de sécurité : on ne met JAMAIS en cache une réponse de l'API. Seules les requêtes GET de
 * la même origine que la page sont traitées ; l'API est une autre origine, donc elle passe
 * directement au réseau. Pas de données de tournoi, de session ni de jeton dans le cache.
 */
const CACHE = 'iamin-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages : le réseau d'abord (toujours la dernière version), la coquille en secours hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Fichiers à empreinte (nom change à chaque version) et icônes : le cache d'abord.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
