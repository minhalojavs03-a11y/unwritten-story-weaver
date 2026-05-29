import { useEffect } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Zap,
  Sparkles,
  Smartphone,
  Trophy,
  BarChart3,
  Crown,
  Wallet,
  Bell,
  Wifi,
  RefreshCcw,
  Lock,
  Rocket,
  Hammer,
  DollarSign,
  Globe,
  MessageCircle,
} from "lucide-react";
import appStoresBadges from "@/assets/app-stores-badges.png";

const TOTAL = 10000;
const INSTALLMENT = TOTAL / 3;
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const WHATSAPP_URL =
  "https://wa.me/5517997091070?text=" +
  encodeURIComponent(
    "Olá! Aprovo a proposta Ubirt.\n\n" +
    "Segue o PIX para pagamento da 1ª parcela (Fase 01 — Fundação):\n" +
    "*SISTED TECNOLOGIA*\n" +
    "CNPJ: 58566454000104\n" +
    "Valor: R$ 3.333,33\n\n" +
    "Assim que confirmar o pagamento, enviarei o contrato em seguida para iniciar o setup de desenvolvimento.\n\n" +
    "https://www.youtube.com/shorts/fFqRAiGn_Hg"
  );

/* ---------- UI atoms ---------- */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-600/30 bg-red-600/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-800">
      <Sparkles className="h-3 w-3" />
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-600/20 bg-red-600/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-red-800">
      {children}
    </span>
  );
}

function GradientHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-balance text-3xl font-bold leading-tight text-slate-900 md:text-5xl">
      {children}
    </h2>
  );
}

function GlowCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 backdrop-blur-sm transition-all hover:border-red-600/40 hover:shadow-[0_0_40px_-10px_rgba(209,30,38,0.5)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(209,30,38,0.18),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="bg-[#D11E26] bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
        {value}
      </div>
      <div className="mt-2 text-xs uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
  tags,
  tone = "emerald",
}: {
  icon: any;
  title: string;
  desc: string;
  tags: string[];
  tone?: "emerald" | "amber" | "purple" | "rose" | "sky" | "cyan";
}) {
  const toneMap: Record<string, string> = {
    emerald: "bg-white border-red-200 text-red-700",
    amber: "bg-white border-red-200 text-red-700",
    purple: "bg-white border-red-200 text-red-700",
    rose: "bg-white border-red-200 text-red-700",
    sky: "bg-white border-red-200 text-red-700",
    cyan: "bg-white border-red-200 text-red-700",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(209,30,38,0.55)] ${toneMap[tone]}`}
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-700"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Phase({
  index,
  title,
  bullets,
  closer,
}: {
  index: string;
  title: string;
  bullets: string[];
  closer: string;
}) {
  return (
    <GlowCard className="flex h-full flex-col">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-800">
        FASE {index}
      </div>
      <h3 className="mt-2 text-2xl font-bold text-slate-900">{title}</h3>
      <div className="mt-4 inline-flex w-fit items-baseline gap-2 rounded-lg bg-red-600/10 px-3 py-1.5 ring-1 ring-red-600/30">
        <span className="text-xs text-red-800/80">3x de</span>
        <span className="text-lg font-bold text-red-800">{fmtBRL(INSTALLMENT)}</span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            {b}
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-slate-200 pt-4 text-xs italic text-red-800/80">
        ✦ {closer}
      </p>
    </GlowCard>
  );
}

/* ---------- Page ---------- */
export default function UbirtProposta() {
  useEffect(() => {
    document.title = "Ubirt — Proposta Comercial";
  }, []);

  return (
    <div className="min-h-screen bg-[#fafaf9] text-slate-900 antialiased">
      {/* Ambient gradients */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-red-700/10 blur-[140px]" />
        <div className="absolute top-[40%] -left-40 h-[500px] w-[500px] rounded-full bg-rose-700/8 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-red-600/8 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#fafaf9_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,23,42,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.35) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D11E26] text-sm font-bold text-white">
              u.
            </div>
            <span className="text-sm font-semibold tracking-tight">ubirt</span>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-xs text-slate-500">Proposta Comercial · Fev 2026</span>
          </div>
          <a
            href="#investimento"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#D11E26] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_20px_-5px_rgba(209,30,38,0.6)] transition-all hover:shadow-[0_0_25px_-2px_rgba(209,30,38,0.8)]"
          >
            Começar agora <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 text-center md:pt-32">
        <Chip>Proposta Exclusiva — Projeto Estratégico</Chip>
        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          O app que{" "}
          <span className="bg-[#D11E26] bg-clip-text text-transparent">
            valoriza motoristas
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-slate-600 md:text-lg">
          Corridas, planos, gamificação e um ecossistema completo — construído para encantar
          passageiros e empoderar motoristas parceiros.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#investimento"
            className="inline-flex items-center gap-2 rounded-full bg-[#D11E26] px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_-5px_rgba(209,30,38,0.7)] transition-all hover:scale-105"
          >
            Ver investimento <ArrowRight className="h-4 w-4" />
          </a>
          <span className="text-xs text-slate-500">Entrega em 16 semanas · Pagamento facilitado</span>
        </div>

        <div className="mt-8 flex items-center justify-center">
          <img
            src={appStoresBadges}
            alt="Disponível no Google Play e na App Store"
            className="h-auto w-full max-w-[260px] opacity-95"
          />
        </div>


        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 backdrop-blur-sm md:grid-cols-4">
          <Stat value="0%" label="Taxa do dev" />
          <Stat value="16 sem" label="Prazo de entrega" />
          <Stat value="24/7" label="Suporte Premium" />
          <Stat value="100%" label="Mobile-first" />
        </div>
      </section>

      {/* DEMO VIDEO */}
      <section className="relative mx-auto max-w-6xl px-6 pb-8">
        <div className="text-center">
          <SectionLabel>Demonstração</SectionLabel>
          <div className="mt-4">
            <GradientHeading>Veja o app em ação</GradientHeading>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-500 md:text-base">
            Um preview real da experiência que vamos entregar — fluido, premium e pensado para a marca Ubirt.
          </p>
        </div>

        <div className="mx-auto mt-12 grid gap-10 md:grid-cols-[460px_1fr] md:items-center lg:grid-cols-[520px_1fr] lg:gap-14">
          <div className="relative mx-auto w-full max-w-[460px] lg:max-w-[520px]">
            {/* Decorative glow halo */}
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_center,rgba(209,30,38,0.5),transparent_70%)] blur-2xl" />
            <div className="pointer-events-none absolute -inset-1 -z-10 rounded-[2.75rem] bg-[#D11E26] opacity-80 blur-sm" />

            <div className="relative overflow-hidden rounded-[2.5rem] border border-red-600/40 bg-black p-3 shadow-[0_0_100px_-10px_rgba(209,30,38,0.7)] ring-1 ring-red-700/20">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem]">
                <iframe
                  src="https://www.youtube.com/embed/fFqRAiGn_Hg?rel=0&modestbranding=1"
                  title="Demonstração do app Ubirt"
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
            <a
              href="https://www.youtube.com/shorts/fFqRAiGn_Hg"
              target="_blank"
              rel="noreferrer"
              className="mt-4 block text-center text-sm font-medium text-red-800 hover:text-red-800"
            >
              Abrir vídeo no YouTube ↗
            </a>
          </div>


          <GlowCard>
            <SectionLabel>Escopo desta proposta</SectionLabel>
            <h3 className="mt-3 text-2xl font-bold text-slate-900">Apenas o aplicativo — integrado ao seu painel</h3>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-slate-600">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-red-800" />
                <span>
                  Esta proposta contempla <strong className="text-slate-900">somente o desenvolvimento do app</strong> (motorista e passageiro). <strong className="text-slate-900">Não inclui</strong> a construção de um novo painel administrativo.
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-red-800" />
                <span>
                  A <strong className="text-slate-900">Vendexfy fará a integração</strong> do aplicativo com o <strong className="text-slate-900">painel administrativo já existente</strong> do cliente.
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-red-800" />
                <span>
                  A integração será executada assim que o cliente <strong className="text-slate-900">enviar a documentação técnica e as APIs necessárias</strong> do painel atual.
                </span>
              </li>
            </ul>
          </GlowCard>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <SectionLabel>Diferenciais</SectionLabel>
          <div className="mt-4">
            <GradientHeading>Por que o Ubirt é diferente</GradientHeading>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-500 md:text-base">
            Cada funcionalidade projetada para criar valor real — para motoristas e passageiros.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={DollarSign}
            tone="emerald"
            title="Modelo de receita configurável"
            desc="O cliente define as taxas do app. Sem interferência ou cobrança extra do desenvolvedor sobre as transações."
            tags={["Taxa configurável", "Sem taxa dev"]}
          />
          <Feature
            icon={Crown}
            tone="amber"
            title="Plano Premium — R$ 199/mês"
            desc="Pontos em dobro, suporte 24h prioritário, destaque nas buscas e relatórios financeiros. Modelo definido pelo cliente."
            tags={["Monetização", "Suporte 24h"]}
          />
          <Feature
            icon={Trophy}
            tone="purple"
            title="Sistema de Pontos & Ranking"
            desc="Gamificação real: motoristas acumulam pontos por corrida, sobem de tier (Bronze → Gold) e desbloqueiam benefícios."
            tags={["Gamificação", "Ranking"]}
          />
          <Feature
            icon={BarChart3}
            tone="cyan"
            title="Relatório Financeiro Completo"
            desc="Extrato detalhado, metas diárias, gráficos de performance semanal e antecipação de saque automática."
            tags={["Metas", "Antecipação"]}
          />
          <Feature
            icon={ShieldCheck}
            tone="rose"
            title="Segurança Total"
            desc="SOS integrado, verificação de documentos, antecedentes checados e rastreamento em tempo real."
            tags={["SOS", "Verificação"]}
          />
          <Feature
            icon={Smartphone}
            tone="sky"
            title="App Nativo Multiplataforma"
            desc="Disponível para Android e iPhone, com notificações push, modo offline e atualizações automáticas."
            tags={["Android", "iPhone"]}
          />
        </div>
      </section>

      {/* APP MOCKUP */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionLabel>Disponível nas Lojas</SectionLabel>
            <h2 className="mt-4 text-balance text-3xl font-bold md:text-5xl">
              Um app completo na{" "}
              <span className="bg-[#D11E26] bg-clip-text text-transparent">
                palma da mão
              </span>
            </h2>
            <p className="mt-4 text-slate-600">
              Android, iPhone, notificações em tempo real, modo offline e atualizações automáticas.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: Smartphone, text: "Disponível para Android e iPhone" },
                { icon: Wifi, text: "Funciona offline e com conexões lentas" },
                { icon: Bell, text: "Notificações push em tempo real" },
                { icon: Zap, text: "Carregamento instantâneo" },
                { icon: RefreshCcw, text: "Atualizações automáticas" },
                { icon: Lock, text: "Segurança de nível bancário" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 text-red-800 ring-1 ring-red-600/30">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Phone mockup */}
          <div className="relative mx-auto">
            <div className="absolute -inset-10 -z-10 rounded-full bg-red-700/20 blur-3xl" />
            <div className="relative mx-auto h-[560px] w-[280px] rounded-[3rem] border-[10px] border-slate-900 bg-slate-900 p-3 shadow-[0_30px_80px_-20px_rgba(209,30,38,0.5)]">
              <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
              <div className="h-full w-full overflow-hidden rounded-[2.2rem] bg-gradient-to-b from-white via-red-100 to-white p-5 text-slate-900">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>9:41</span>
                  <span>●●●</span>
                </div>
                <div className="mt-6 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D11E26] text-white">
                    <span className="text-sm font-bold">u.</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Ubirt</div>
                    <div className="text-[10px] text-slate-500">Mobilidade que valoriza</div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-red-300 bg-red-100 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-red-800">
                    Saldo
                  </div>
                  <div className="mt-1 text-2xl font-bold">R$ 1.247,80</div>
                  <div className="mt-1 text-[10px] text-slate-500">+12 corridas hoje</div>
                </div>

                <div className="mt-4 space-y-2">
                  {["Nova Corrida", "Minhas Corridas", "Pontos & Ranking", "Configurações"].map(
                    (item, i) => (
                      <div
                        key={item}
                        className={`flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs ${
                          i === 0
                            ? "bg-[#D11E26] text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <span className="font-medium">{item}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    )
                  )}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Rápido", icon: Zap },
                    { label: "Offline", icon: Wifi },
                    { label: "Auto", icon: RefreshCcw },
                  ].map(({ label, icon: Icon }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-slate-200 bg-slate-100 p-2"
                    >
                      <Icon className="mx-auto h-3.5 w-3.5 text-red-800" />
                      <div className="mt-1 text-[9px] text-slate-600">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <SectionLabel>Cronograma</SectionLabel>
          <div className="mt-4">
            <GradientHeading>Da aprovação ao lançamento</GradientHeading>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-500 md:text-base">
            16 semanas de execução com entregas incrementais a cada fase.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Rocket,
              week: "Semana 1",
              title: "Kickoff + Design System",
              desc: "Alinhamento, setup do servidor, identidade visual e arquitetura base.",
            },
            {
              icon: Hammer,
              week: "Semanas 2–6",
              title: "Fase 1 — Fundação",
              desc: "Login, cadastro, dashboard motorista/passageiro, mapa, corridas e admin base.",
            },
            {
              icon: DollarSign,
              week: "Semanas 7–12",
              title: "Fase 2 — Motor Comercial",
              desc: "PIX, monetização, planos Premium, pontos, relatórios financeiros e notificações.",
            },
            {
              icon: Globe,
              week: "Semanas 13–16",
              title: "Fase 3 — Lançamento",
              desc: "Performance, segurança, multi-cidade, métricas e suporte pós-lançamento 30d.",
            },
          ].map(({ icon: Icon, week, title, desc }, i) => (
            <GlowCard key={title}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D11E26] text-white ring-1 ring-red-800/30">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-800">
                {week}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{desc}</p>
            </GlowCard>
          ))}
        </div>
      </section>

      {/* INVESTIMENTO */}
      <section id="investimento" className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <SectionLabel>Investimento por Fase</SectionLabel>
          <div className="mt-4">
            <h2 className="text-balance text-3xl font-bold md:text-5xl">
              <span className="bg-[#D11E26] bg-clip-text text-transparent">
                3x de {fmtBRL(INSTALLMENT)}
              </span>
            </h2>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-500 md:text-base">
            Investimento total de <span className="font-semibold text-slate-900">{fmtBRL(TOTAL)}</span>{" "}
            dividido em 3 parcelas — uma por fase entregue.
          </p>
        </div>

        {/* Entrada estratégica */}
        <div className="mx-auto mt-10 max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-red-800 bg-[#D11E26] p-8 text-center shadow-[0_20px_60px_-15px_rgba(209,30,38,0.5)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
              Condição desta semana
            </span>
            <div className="mt-4 text-sm text-white/85">Entrada Estratégica</div>
            <div className="mt-2 text-5xl font-bold text-white">
              {fmtBRL(INSTALLMENT)}
            </div>
            <p className="mt-3 text-xs text-white/80">
              Início imediato da Fase 1 · Equipe mobilizada em até 48h
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#D11E26] transition-all hover:scale-[1.02] hover:bg-white/95"
            >
              Aprovar e começar <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Fases */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Phase
            index="01"
            title="Fundação"
            bullets={[
              "Arquitetura do sistema",
              "Setup VPS e infraestrutura",
              "WebApp mobile-first base",
              "Cadastro de usuários e parceiros",
              "Painel administrativo inicial",
            ]}
            closer="Plataforma funcional pronta para operação interna."
          />
          <Phase
            index="02"
            title="Operação & Monetização"
            bullets={[
              "Sistema de pedidos e serviços",
              "Checkout com PIX integrado",
              "Sistema de taxas configurável",
              "Área completa do parceiro",
              "Gestão de transações e extrato",
            ]}
            closer="Produto pronto para operar e gerar receita."
          />
          <Phase
            index="03"
            title="Lançamento & Escala"
            bullets={[
              "Otimização de performance",
              "Segurança e hardening",
              "Estrutura multi-cidade",
              "Dashboard com métricas reais",
              "30 dias de suporte pós-lançamento",
            ]}
            closer="Plataforma pronta para expansão regional."
          />
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-balance text-4xl font-bold leading-tight md:text-6xl">
          Pronto para{" "}
          <span className="bg-[#D11E26] bg-clip-text text-transparent">
            dominar a região?
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-slate-600">
          Equipe mobilizada. Arquitetura definida. Escolha o pagamento e comece agora.
        </p>

        <div className="mx-auto mt-10 max-w-xl space-y-3 text-left">
          {[
            { label: "Parcela 1 — Fundação", sub: "Início imediato da Fase 1" },
            { label: "Parcela 2 — Operação", sub: "Liberada na entrega da Fase 1" },
            { label: "Parcela 3 — Escala", sub: "Liberada na entrega da Fase 2" },
          ].map((p, i) => (
            <a
              key={p.label}
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-all hover:border-red-600/40 hover:bg-red-600/5"
            >
              <div>
                <div className="text-xs uppercase tracking-wider text-red-800/80">
                  {i === 0 ? "Recomendado" : `Parcela ${i + 1}`}
                </div>
                <div className="mt-1 text-sm font-semibold">{p.label}</div>
                <div className="mt-0.5 text-xs text-slate-500">{p.sub}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-lg font-bold text-red-800">{fmtBRL(INSTALLMENT)}</div>
                  <div className="text-[10px] text-slate-500">PIX ou Cartão</div>
                </div>
                <ArrowRight className="h-4 w-4 text-red-800" />
              </div>
            </a>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Pagamento 100% seguro · Dados criptografados
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-600/30 bg-red-600/10 px-5 py-2.5 text-sm font-semibold text-red-800 transition-all hover:bg-red-600/20"
          >
            <MessageCircle className="h-4 w-4" />
            Prefere pagar pelo WhatsApp?
          </a>
          <p className="mt-3 text-xs text-slate-500">
            Investimento total: <span className="font-semibold text-slate-900">{fmtBRL(TOTAL)}</span> ·
            Condição válida para confirmação nesta semana.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-10 text-center">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D11E26] text-sm font-bold text-white">
              u.
            </div>
            <span className="text-sm font-semibold">ubirt</span>
          </div>
          <p className="text-xs text-slate-400">
            Proposta Comercial Confidencial · Fevereiro 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
