// Kill-switch service worker.
// Versões anteriores forçavam navigate() no activate + reload() no
// controllerchange, o que causava tela branca em PWAs mobile (Renata,
// Flavia e demais consultores). Este SW limpa caches, se desregistra
// e deixa o navegador servir tudo direto da rede.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
    await self.clients.claim();
  })());
});

// Passthrough — nunca intercepta requisições.
self.addEventListener("fetch", () => {});
