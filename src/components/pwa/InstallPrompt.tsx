import { useEffect, useState } from "react";
import { Download, X, Share, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Sem persistência: ao recarregar a página, se o app ainda não foi instalado,
// o prompt aparece novamente.
function recentlyDismissed() {
  return false;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-ignore - iOS Safari
    window.navigator.standalone === true
  );
}

function isIOS() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isAndroid() {
  return /Android/i.test(window.navigator.userAgent);
}

function detectAndroidBrowser(): "chrome" | "miui" | "samsung" | "other" {
  const ua = window.navigator.userAgent;
  if (/MiuiBrowser|XiaoMi/i.test(ua)) return "miui";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Chrome\//i.test(ua) && !/EdgA|OPR|FBAV|Instagram|Line/i.test(ua)) return "chrome";
  return "other";
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [androidHint, setAndroidHint] = useState<null | "chrome" | "miui" | "samsung" | "other">(null);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    let gotBIP = false;

    const handler = (e: Event) => {
      e.preventDefault();
      gotBIP = true;
      setDeferred(e as BIPEvent);
      setAndroidHint(null);
      setTimeout(() => setVisible(true), 1500);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS não dispara beforeinstallprompt — mostrar instrução manual
    if (isIOS()) {
      setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 2000);
    } else if (isAndroid()) {
      // Em MIUI / Mi Browser / Samsung / navegadores in-app o
      // beforeinstallprompt nunca dispara. Mostra guia manual.
      setTimeout(() => {
        if (!gotBIP && !isStandalone()) {
          setAndroidHint(detectAndroidBrowser());
          setVisible(true);
        }
      }, 4000);
    }

    const installed = () => setVisible(false);
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  function dismiss() {
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss();
    }
    setDeferred(null);
  }

  const androidInstructions: Record<string, string> = {
    chrome: "Toque no menu ⋮ do Chrome e escolha \"Instalar app\" ou \"Adicionar à tela inicial\".",
    miui: "Toque no menu ☰ do Mi Browser e escolha \"Adicionar à tela inicial\". Para melhor experiência, abra este link no Chrome.",
    samsung: "Toque no menu ☰ do Samsung Internet e escolha \"Adicionar página a\" → \"Tela inicial\".",
    other: "Abra o menu do navegador e escolha \"Adicionar à tela inicial\" ou \"Instalar app\". Recomendamos abrir no Chrome.",
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar Feracon CRM"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 pt-2 animate-in slide-in-from-bottom-8 fade-in duration-500 md:left-auto md:right-4 md:bottom-4 md:px-0 md:pb-0 md:pt-0 md:max-w-sm"
    >
      <div
        className="relative overflow-hidden rounded-3xl border-2 border-[#dc2626] bg-[#0b0b14] p-4 shadow-2xl"
        style={{
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 rounded-full bg-[#1a1a26] p-1.5 text-white transition hover:bg-[#dc2626]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#dc2626] shadow-lg">
            <img src="/icon-192.png" alt="" className="h-10 w-10" />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#dc2626]">
              Instalar app
            </p>
            <h3 className="mt-0.5 text-base font-bold leading-tight text-white">
              Feracon CRM no seu celular
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#e5e7eb]">
              Acesso instantâneo, notificações e tela cheia — como um app nativo.
            </p>
          </div>
        </div>

        {iosHint ? (
          <div className="relative mt-4 space-y-2 rounded-2xl border border-[#2a2a3a] bg-[#15151f] p-3">
            <div className="flex items-center gap-2 text-xs text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-bold text-white">1</span>
              <span>Toque em</span>
              <Share className="h-3.5 w-3.5 text-[#60a5fa]" />
              <span>Compartilhar</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-bold text-white">2</span>
              <span>Escolha</span>
              <Plus className="h-3.5 w-3.5 text-white" />
              <span>Adicionar à Tela de Início</span>
            </div>
            <Button
              onClick={dismiss}
              size="sm"
              className="mt-1 w-full bg-[#1f1f2e] text-white hover:bg-[#2a2a3a]"
            >
              Entendi
            </Button>
          </div>
        ) : androidHint && !deferred ? (
          <div className="relative mt-4 space-y-2 rounded-2xl border border-[#2a2a3a] bg-[#15151f] p-3">
            <p className="text-xs leading-relaxed text-white">
              {androidInstructions[androidHint]}
            </p>
            <Button
              onClick={dismiss}
              size="sm"
              className="mt-1 w-full bg-[#1f1f2e] text-white hover:bg-[#2a2a3a]"
            >
              Entendi
            </Button>
          </div>
        ) : (
          <div className="relative mt-4 flex gap-2">
            <Button
              onClick={dismiss}
              className="flex-1 bg-[#1f1f2e] text-white hover:bg-[#2a2a3a]"
            >
              Agora não
            </Button>
            <Button
              onClick={install}
              className="flex-1 bg-[#dc2626] text-white hover:bg-[#b91c1c]"
            >
              <Download className="mr-1.5 h-4 w-4" />
              Instalar
            </Button>
          </div>
        )}

        <div className="relative mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[#9ca3af]">
          <Smartphone className="h-3 w-3" />
          <span>Funciona offline · Carrega mais rápido</span>
        </div>
      </div>
    </div>
  );
}
