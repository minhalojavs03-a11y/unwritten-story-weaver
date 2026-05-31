import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Regra: o app só pode rodar no domínio oficial feracon.com.br.
// Redireciona qualquer acesso por *.lovable.app / *.lovableproject.com / *.lovable.dev
// para o domínio oficial, exceto quando estiver dentro do editor (iframe de preview).
(() => {
  try {
    const inIframe = window.self !== window.top;
    if (inIframe) return;
    const host = window.location.hostname;
    const isUnofficial =
      host.endsWith("lovable.app") ||
      host.endsWith("lovableproject.com") ||
      host.endsWith("lovable.dev");
    if (isUnofficial) {
      const target = "https://feracon.com.br" + window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(target);
    }
  } catch {}
})();

createRoot(document.getElementById("root")!).render(<App />);


// Não registramos mais nenhum service worker. O arquivo /sw.js é um
// kill-switch que apenas limpa caches e se desregistra para corrigir
// a tela branca em PWAs mobile causada por versões anteriores do SW.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister().catch(() => {})))
    .catch(() => {});
  if ("caches" in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
      .catch(() => {});
  }
}

