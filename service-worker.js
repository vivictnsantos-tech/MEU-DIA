/* ============================================================
   SERVICE WORKER — Meu Dia
   Responsável por: cache dos arquivos do app para uso offline
   e por exibir notificações locais quando o navegador permitir.
   ============================================================ */

const CACHE_NAME = 'meu-dia-cache-v3';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './illustrations/boas-vindas.png'
];

// Instala o service worker e guarda os arquivos essenciais em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Remove caches antigos quando uma nova versão é instalada
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: cache primeiro, com atualização em segundo plano
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Permite que a página peça ao service worker para exibir uma notificação,
// o que funciona mesmo com o navegador em segundo plano (mas não com o app
// totalmente fechado — essa é uma limitação explicada dentro do app).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = data;
    self.registration.showNotification(title, options);
  }
});

// Clique na notificação: foca ou abre a janela do app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
