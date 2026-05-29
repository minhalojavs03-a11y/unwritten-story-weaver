// Service worker — version bumped to force update on installed PWAs
// (Renata, Flavia e demais consultores reportaram painel antigo em cache)
const SW_VERSION = "v3-2026-05-28";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Limpa qualquer cache antigo que possa ter sido criado por versões prévias
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    await self.clients.claim();
    // Força reload de todas as abas/PWAs abertas para pegar a versão nova
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      try { client.navigate(client.url); } catch {}
    }
  })());
});

// Network-first passthrough — nunca serve conteúdo cacheado
self.addEventListener("fetch", (event) => {
  // no-op: deixa o navegador buscar direto da rede
});

// Permite que o app peça o skipWaiting manualmente
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Marca de versão (apenas para debug em DevTools → Application → Service Workers)
self.SW_VERSION = SW_VERSION;
