// Regra de habilitação de consultores por faixa de crédito do lead.
//
// Faixas:
//   - 0      a 500.000     -> tier 1 (todos podem)
//   - 500k   a 800.000     -> tier 2
//   - 800k   a 2.000.000   -> tier 3
//
// Consultores autorizados POR FAIXA MÁXIMA permitida:
//   - tier 3 (até 2kk): Micaelly, Gizele, Jean, Diéssica
//   - tier 2 (até 800k): Lucas, Vinicius, Kauana
//   - tier 1 (até 500k): Renata, Flavia, Tamy, Adriana, Gregory

export const TIER_LIMITS = {
  t1: 500_000,
  t2: 800_000,
  t3: 2_000_000,
} as const;

const TIER3_NAMES = ["micaelly", "gizele", "jean", "diessica", "diéssica"];
const TIER2_NAMES = ["lucas", "vinicius", "kauana"];
const TIER1_NAMES = ["renata", "flavia", "flávia", "tamy", "adriana", "gregory"];

function normalize(str: string) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Tenta extrair o valor do crédito a partir do texto do lead.interest. */
export function parseCreditValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = normalize(String(raw));
  s = s.replace(/r\$|reais?/g, "").trim();
  if (!s) return null;

  // Captura "1,5kk", "1.2 kk", "2kk"
  const kk = s.match(/([\d]+(?:[.,]\d+)?)\s*(kk|mm|mi|milh(o|a)?es?|milhao)/);
  if (kk) {
    const n = parseFloat(kk[1].replace(",", "."));
    if (!isNaN(n)) return Math.round(n * 1_000_000);
  }

  // Captura "350k", "800 k", "1k"
  const k = s.match(/([\d]+(?:[.,]\d+)?)\s*k\b/);
  if (k) {
    const n = parseFloat(k[1].replace(",", "."));
    if (!isNaN(n)) return Math.round(n * 1_000);
  }

  // Captura número puro estilo BR (350.000 ou 350.000,00) ou US (350000.00)
  const numMatch = s.match(/[\d][\d.,]*/);
  if (numMatch) {
    let token = numMatch[0];
    if (token.includes(",")) {
      // formato BR: vírgula é decimal, ponto é milhar
      token = token.replace(/\./g, "").replace(",", ".");
    } else if ((token.match(/\./g) || []).length > 1) {
      // múltiplos pontos => são separadores de milhar
      token = token.replace(/\./g, "");
    }
    const n = parseFloat(token);
    if (!isNaN(n)) {
      // se vier muito pequeno e o texto sugere "mil", multiplica
      if (n < 1000 && /mil/.test(s)) return Math.round(n * 1_000);
      return Math.round(n);
    }
  }
  return null;
}

/** Retorna o teto permitido para um consultor pelo nome. null = sem regra (livre). */
export function getMaxAllowedForName(name: string | null | undefined): number | null {
  const n = normalize(name || "");
  if (!n) return null;
  if (TIER3_NAMES.some((x) => n.includes(x))) return TIER_LIMITS.t3;
  if (TIER2_NAMES.some((x) => n.includes(x))) return TIER_LIMITS.t2;
  if (TIER1_NAMES.some((x) => n.includes(x))) return TIER_LIMITS.t1;
  return null;
}

/** Checa se um consultor pode pegar um lead. bypass=true ignora regra (dono/supervisor). */
export function canTakeLead(opts: {
  consultantName: string | null | undefined;
  leadInterest: string | null | undefined;
  bypass?: boolean;
}): { allowed: boolean; reason?: string; max?: number | null; value?: number | null } {
  if (opts.bypass) return { allowed: true };
  const value = parseCreditValue(opts.leadInterest);
  const max = getMaxAllowedForName(opts.consultantName);
  // Sem regra definida para o nome: liberar (não bloqueia desconhecidos)
  if (max == null) return { allowed: true, value, max };
  // Sem valor identificável: liberar
  if (value == null) return { allowed: true, value, max };
  if (value <= max) return { allowed: true, value, max };
  return {
    allowed: false,
    value,
    max,
    reason: `Ainda não habilitado para leads acima de ${formatBRL(max)}.`,
  };
}

export function formatBRL(n: number): string {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  } catch {
    return `R$ ${n}`;
  }
}
