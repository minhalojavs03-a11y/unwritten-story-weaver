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

// Registra service worker mínimo para permitir o prompt de instalação
// em Chrome / MIUI / Mi Browser (Xiaomi). Evita registrar dentro do
// preview do Lovable para não atrapalhar o editor.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host.endsWith("lovable.dev");

if ("serviceWorker" in navigator) {
  if (isPreviewHost || isInIframe) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        // Sempre que houver SW novo aguardando, ativa imediatamente
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage("SKIP_WAITING");
            }
          });
        });
        // Checa atualização periodicamente para PWAs instaladas
        setInterval(() => { reg.update().catch(() => {}); }, 60 * 1000);
      }).catch(() => {});

      // Quando o controlador troca (SW novo assumiu), recarrega a página
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    });
  }
}
