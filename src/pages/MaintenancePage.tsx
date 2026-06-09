import { Wrench, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import logoFeraconLight from "@/assets/logo-feracon-light.png";

export default function MaintenancePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(0_0%_6%)] px-6 text-white">
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[hsl(var(--primary))]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-[hsl(0_0%_20%)]/40 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center text-center">
        <img src={logoFeraconLight} alt="Consórcio Feracon" className="mb-10 h-14 w-auto object-contain" />

        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(357_80%_38%)] shadow-lg shadow-[hsl(var(--primary))]/30">
          <Wrench className="h-8 w-8 text-white" />
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          CRM em manutenção
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
          Estamos realizando ajustes importantes no sistema. O acesso está temporariamente
          suspenso para todos os usuários. Voltaremos em breve — obrigado pela paciência.
        </p>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-xs text-white/50">
          Dúvidas urgentes? Entre em contato com o suporte interno.
        </div>

        <Link
          to="/admin/login"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        >
          <ShieldCheck className="h-4 w-4" />
          Acesso superadmin
        </Link>

        <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-white/30">
          Consórcio Feracon · {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
