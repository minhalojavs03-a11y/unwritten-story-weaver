import { Check, MessageCircle, Phone, Users, Zap, ShieldCheck, ArrowRight, Headphones, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import proposalPortrait from "@/assets/proposal-portrait.jpg";
import proposalPhone from "@/assets/proposal-phone.jpg";
import proposalFlatlay from "@/assets/proposal-flatlay.jpg";
import proposalLaptop from "@/assets/proposal-laptop.jpg";

const WHATSAPP_URL =
  "https://wa.me/5517997091070?text=" +
  encodeURIComponent(
    "Olá! Quero aprovar a proposta Vendexfy Communication Suite. Investimento de ativação: Basic (5x R$ 300 = R$ 1.500) ou Professional (5x R$ 500 = R$ 2.500). Quero ter isso rodando em 24h ativo!"
  );

const WHATSAPP_BASIC_URL =
  "https://wa.me/5517997091070?text=" +
  encodeURIComponent(
    "Olá! Quero aprovar a proposta Vendexfy Communication Suite — Plano Basic. Investimento inicial: 5x R$ 300 (R$ 1.500). Quero ter isso rodando em 24h ativo!"
  );

const WHATSAPP_PRO_URL =
  "https://wa.me/5517997091070?text=" +
  encodeURIComponent(
    "Olá! Quero aprovar a proposta Vendexfy Communication Suite — Plano Professional. Investimento inicial: 5x R$ 500 (R$ 2.500). Quero ter isso rodando em 24h ativo!"
  );

/* ---------- Reusable bits ---------- */

function Pill({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
        dark
          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
          : "bg-primary text-primary-foreground"
      }`}
    >
      <Sparkles className="h-3 w-3" />
      {children}
    </span>
  );
}

function CheckItem({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className={`text-sm leading-relaxed ${dark ? "text-white/85" : "text-foreground/85"}`}>
        {children}
      </span>
    </li>
  );
}

function FeatureRow({
  pill,
  title,
  highlight,
  items,
  image,
  reverse = false,
  cta,
}: {
  pill: string;
  title: string;
  highlight: string;
  items: string[];
  image: string;
  reverse?: boolean;
  cta: string;
}) {
  return (
    <div
      className={`grid items-center gap-10 lg:gap-16 ${
        reverse ? "lg:grid-cols-[1.1fr_1fr]" : "lg:grid-cols-[1fr_1.1fr]"
      }`}
    >
      <div className={reverse ? "lg:order-2" : ""}>
        <div className="relative">
          <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-primary-light to-transparent blur-2xl" />
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <img src={image} alt={title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          </div>
        </div>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>
        <Pill dark>{pill}</Pill>
        <h3 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
          {title} <span className="text-primary">{highlight}</span>
        </h3>
        <ul className="mt-6 space-y-3">
          {items.map((i) => (
            <CheckItem key={i}>{i}</CheckItem>
          ))}
        </ul>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-light px-4 py-2 text-sm font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> {cta}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function ProposalWhatsappOficial() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageCircle className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight">Vendexfy</span>
          </div>
          <Button asChild size="sm" className="rounded-full">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              Aprovar proposta
            </a>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-primary-light via-background to-background">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.18),transparent_55%)]" />
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <Pill>Proposta Comercial</Pill>
            <h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Comunicação <span className="text-primary">oficial.</span>
              <br />
              Operação <span className="text-primary">no controle.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              Vendexfy Communication Suite. WhatsApp Oficial, multiatendimento, discador
              e IA — tudo integrado ao CRM que sua equipe já usa.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2 rounded-full">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  Aprovar proposta <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="#planos">Ver planos</a>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/25 to-transparent blur-3xl" />
            <div className="overflow-hidden rounded-[2.5rem] border border-border bg-card shadow-2xl">
              <img src={proposalPortrait} alt="Vendexfy" className="aspect-[4/4] w-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -left-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl md:-bottom-6 md:-left-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">WhatsApp</div>
                  <div className="text-sm font-bold">100% Oficial</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DARK PROBLEM SECTION */}
      <section className="bg-foreground text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="flex justify-center">
            <Pill>O cenário atual</Pill>
          </div>
          <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Operar sem estrutura oficial é{" "}
            <span className="bg-gradient-to-r from-primary to-[#ff6470] bg-clip-text text-transparent">
              perder produtividade todo dia.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/60">
            Bloqueios, mensagens não entregues, conversas espalhadas e zero rastreabilidade.
          </p>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-3">
            {[
              { n: "85%", l: "das operações usam WhatsApp não oficial" },
              { n: "3x", l: "mais risco de banimento sem API oficial" },
              { n: "0", l: "controle quando o consultor sai da empresa" },
            ].map((s) => (
              <div key={s.n} className="bg-foreground p-8 text-left">
                <div className="bg-gradient-to-r from-primary to-[#ff6470] bg-clip-text text-5xl font-bold text-transparent">
                  {s.n}
                </div>
                <p className="mt-3 text-sm text-white/70">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES ZIGZAG */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Pill dark>O que está incluso</Pill>
          <h2 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Quatro frentes que viram sua{" "}
            <span className="text-primary">máquina de atendimento.</span>
          </h2>
        </div>

        <div className="mt-20 space-y-24">
          <FeatureRow
            pill="WhatsApp Oficial"
            title="API oficial integrada"
            highlight="ao seu CRM."
            image={proposalLaptop}
            cta="Estrutura aprovada pelo Meta Business"
            items={[
              "Número oficial verificado e estável",
              "Multiatendimento com vários consultores no mesmo número",
              "Histórico completo de cada conversa dentro do CRM",
              "Templates e mensagens ativas com aprovação oficial",
            ]}
          />
          <FeatureRow
            pill="Multiatendimento"
            title="Toda equipe operando"
            highlight="no mesmo lugar."
            image={proposalPhone}
            reverse
            cta="Sem perder lead, sem perder consultor"
            items={[
              "Distribuição automática de leads para os consultores",
              "Transferência interna sem confundir o cliente",
              "Supervisão em tempo real do que cada um está fazendo",
              "Atendimento contínuo mesmo com troca de equipe",
            ]}
          />
          <FeatureRow
            pill="Discador Integrado"
            title="Ligações comerciais"
            highlight="direto pelo CRM."
            image={proposalFlatlay}
            cta="Click-to-call com histórico completo"
            items={[
              "Click-to-call em qualquer lead do CRM",
              "Gravação e histórico de chamadas",
              "Estatísticas de ligações por consultor",
              "Até 500 minutos inclusos no plano Professional",
            ]}
          />
          <FeatureRow
            pill="IA + Automações"
            title="Atendimento mais rápido,"
            highlight="acompanhamento sem esforço."
            image={proposalPortrait}
            reverse
            cta="Pronto para escalar 15 consultores"
            items={[
              "Respostas automáticas para o primeiro contato",
              "Triagem inteligente dos leads que chegam",
              "Sugestão de próximas ações para cada conversa",
              "Análise da operação direto no painel",
            ]}
          />
        </div>
      </section>

      {/* DARK RESULTS SECTION */}
      <section className="bg-foreground text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="flex justify-center">
            <Pill>Resultado esperado</Pill>
          </div>
          <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Mais velocidade, mais controle,{" "}
            <span className="bg-gradient-to-r from-primary to-[#ff6470] bg-clip-text text-transparent">
              mais escala.
            </span>
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Zap, label: "Velocidade de atendimento" },
              { icon: ShieldCheck, label: "Estabilidade operacional" },
              { icon: Users, label: "Controle da equipe" },
              { icon: Headphones, label: "Centralização da comunicação" },
              { icon: MessageCircle, label: "Histórico completo dos leads" },
              { icon: Phone, label: "Escalabilidade da operação" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-white">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="planos" className="bg-gradient-to-b from-primary-light/60 via-background to-background">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Pill dark>Investimento</Pill>
            <h2 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Escolha o seu nível de{" "}
              <span className="text-primary">comunicação oficial.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Dois planos mensais + ativação operacional assistida.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {/* BASIC */}
            <div className="relative flex flex-col rounded-3xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Plano Basic
              </div>
              <div className="text-2xl font-bold tracking-tight">Communication Basic</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">R$ 997</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Até 1.000 conversas oficiais/mês</p>

              <ul className="mt-8 space-y-3">
                {[
                  "WhatsApp Oficial integrado",
                  "Multiatendimento",
                  "Integração completa ao CRM",
                  "Histórico completo de mensagens",
                  "Estrutura oficial de comunicação",
                  "Suporte operacional",
                ].map((i) => (
                  <CheckItem key={i}>{i}</CheckItem>
                ))}
              </ul>

              <div className="mt-8 rounded-2xl border border-dashed border-border bg-secondary/60 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ativação assistida
                  </span>
                  <span className="text-base font-bold text-primary">5x R$ 300</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Configuração completa, integração oficial, ajustes operacionais e treinamento inicial.
                </p>
              </div>

              <Button asChild size="lg" variant="outline" className="mt-8 rounded-full">
                <a href={WHATSAPP_BASIC_URL} target="_blank" rel="noopener noreferrer">
                  Quero o plano Basic
                </a>
              </Button>
            </div>

            {/* PROFESSIONAL */}
            <div className="relative flex flex-col overflow-hidden rounded-3xl border-2 border-primary bg-foreground p-8 text-white shadow-2xl shadow-primary/20">
              <div className="absolute right-6 top-6">
                <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  Recomendado
                </span>
              </div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                Plano Professional
              </div>
              <div className="text-2xl font-bold tracking-tight">Communication Professional</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="bg-gradient-to-r from-white to-primary-light bg-clip-text text-5xl font-bold tracking-tight text-transparent">
                  R$ 1.497
                </span>
                <span className="text-white/60">/mês</span>
              </div>
              <p className="mt-2 text-xs text-white/60">
                Tudo do Basic + telefonia integrada · Até 500 min/mês
              </p>

              <ul className="mt-8 space-y-3">
                {[
                  "Tudo do plano Basic",
                  "Discador comercial integrado",
                  "Click-to-call dentro do CRM",
                  "Ligações via CRM com histórico",
                  "Até 500 minutos em ligações",
                  "Operação preparada para escalar",
                ].map((i) => (
                  <CheckItem key={i} dark>
                    {i}
                  </CheckItem>
                ))}
              </ul>

              <div className="mt-8 rounded-2xl border border-dashed border-white/20 bg-white/5 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                    Ativação assistida
                  </span>
                  <span className="text-base font-bold text-primary">5x R$ 500</span>
                </div>
                <p className="mt-2 text-xs text-white/60">
                  Configuração completa, integração da telefonia, estruturação da operação e treinamento da equipe.
                </p>
              </div>

              <Button asChild size="lg" className="mt-8 rounded-full">
                <a href={WHATSAPP_PRO_URL} target="_blank" rel="noopener noreferrer">
                  Aprovar o Professional
                </a>
              </Button>
            </div>
          </div>

          {/* Excedentes */}
          <div className="mt-10 rounded-3xl border border-border bg-card p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Pill dark>Excedentes operacionais</Pill>
                <h3 className="mt-3 text-xl font-bold tracking-tight">
                  Cobrados apenas se a operação ultrapassar os limites do plano.
                </h3>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { l: "Conversa receptiva adicional", v: "R$ 0,15" },
                { l: "Conversa ativa adicional", v: "R$ 0,45" },
                { l: "Minuto adicional de ligação", v: "R$ 0,12" },
              ].map((e) => (
                <div
                  key={e.l}
                  className="flex flex-col rounded-2xl border border-border bg-secondary/40 p-5"
                >
                  <span className="text-xs text-muted-foreground">{e.l}</span>
                  <span className="mt-1 text-2xl font-bold text-primary">{e.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ESTRUTURA + BENEFÍCIOS */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Pill dark>Estrutura prevista</Pill>
            <h2 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Dimensionada para a sua{" "}
              <span className="text-primary">operação atual.</span>
            </h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Até 15 consultores",
                "1 número oficial integrado",
                "Média de 500 leads/mês",
                "Operação centralizada",
              ].map((i) => (
                <CheckItem key={i}>{i}</CheckItem>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-border bg-gradient-to-br from-primary-light to-background p-8">
            <h3 className="text-lg font-bold tracking-tight">Benefícios da estrutura</h3>
            <ul className="mt-6 grid gap-3">
              {[
                "Comunicação oficial e estável",
                "Atendimento multi consultor",
                "Centralização operacional",
                "Continuidade total do CRM atual",
                "Maior controle da equipe",
                "Histórico completo de atendimento",
                "Mais produtividade operacional",
                "Estrutura preparada para crescimento",
              ].map((b) => (
                <CheckItem key={b}>{b}</CheckItem>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/40">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <Pill dark>Dúvidas</Pill>
            <h2 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
              Perguntas <span className="text-primary">frequentes.</span>
            </h2>
          </div>
          <Accordion type="single" collapsible className="mt-10 space-y-3">
            {[
              {
                q: "O CRM atual continua sendo usado?",
                a: "Sim. A suíte integra o WhatsApp Oficial e o discador diretamente ao CRM já existente — nenhuma migração de dados é necessária.",
              },
              {
                q: "Quanto tempo leva a ativação?",
                a: "A ativação operacional assistida é executada em etapas e normalmente leva entre 7 e 15 dias úteis, dependendo da agilidade da homologação oficial.",
              },
              {
                q: "O que acontece se ultrapassarmos o limite de conversas?",
                a: "Apenas o excedente é cobrado conforme a tabela: conversa receptiva R$ 0,15, conversa ativa R$ 0,45 e minuto adicional de ligação R$ 0,12.",
              },
              {
                q: "É possível trocar de plano depois?",
                a: "Sim. A migração entre Basic e Professional é simples e pode ser feita a qualquer momento, sem nova ativação.",
              },
            ].map((f) => (
              <AccordionItem
                key={f.q}
                value={f.q}
                className="rounded-2xl border border-border bg-card px-5"
              >
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-foreground text-white">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <Pill>Próximo passo</Pill>
          <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Pronto para ativar a sua{" "}
            <span className="bg-gradient-to-r from-primary to-[#ff6470] bg-clip-text text-transparent">
              comunicação oficial?
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Aprove a proposta direto pelo WhatsApp e iniciamos a ativação assistida da sua operação.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="gap-2 rounded-full">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Aprovar proposta <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Falar com comercial
              </a>
            </Button>
          </div>
          <p className="mt-5 text-xs text-white/50">
            Atendimento direto via WhatsApp · (17) 99709-1070
          </p>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-xs text-white/40">
          Vendexfy Communication Suite — Proposta Comercial
        </div>
      </section>
    </div>
  );
}
