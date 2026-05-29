import { jsPDF } from "jspdf";
import type { CoachingInsight } from "@/hooks/useCoachingInsights";

const TYPE_LABEL: Record<CoachingInsight["insight_type"], string> = {
  missed_buying_signal: "Sinal de compra perdido",
  should_be_audio: "Devia ter sido áudio",
  low_assertiveness: "Pouco assertivo",
  objection_unhandled: "Objeção mal tratada",
  simulation_sent: "Simulação enviada",
};

interface ExportOptions {
  insights: CoachingInsight[];
  days: number;
  tabLabel: string;
  byMember: Array<{ name: string; total: number; high: number; simulations: number }>;
}

export function exportCoachingPdf({ insights, days, tabLabel, byMember }: ExportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const text = (str: string, size = 10, opts: { bold?: boolean; color?: [number, number, number] } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(str, maxW);
    ensure(lines.length * (size + 2));
    doc.text(lines, margin, y);
    y += lines.length * (size + 2);
  };

  // Header
  text("Coaching de Atendimento — Relatório IA", 18, { bold: true });
  text(`Período: últimos ${days} dias · Filtro: ${tabLabel} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 9, { color: [110, 110, 110] });
  y += 6;
  doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 14;

  // Resumo
  text(`Total de alertas: ${insights.filter(i => i.insight_type !== "simulation_sent").length} · Simulações enviadas: ${insights.filter(i => i.insight_type === "simulation_sent").length}`, 10, { bold: true });
  y += 4;

  if (byMember.length) {
    text("Por consultor", 11, { bold: true });
    y += 2;
    for (const m of byMember) {
      const line = `• ${m.name} — ${m.total} alerta(s)${m.high ? ` · ${m.high} crítico(s)` : ""}${m.simulations ? ` · ${m.simulations} simulação(ões)` : ""}`;
      text(line, 10);
    }
    y += 8;
  }

  doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 14;
  text("Alertas detalhados", 13, { bold: true });
  y += 4;

  if (insights.length === 0) {
    text("Nenhum alerta no período.", 10, { color: [110, 110, 110] });
  }

  for (const i of insights) {
    ensure(80);
    const dateStr = new Date(i.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    text(`[${i.severity.toUpperCase()}] ${TYPE_LABEL[i.insight_type] ?? i.insight_type} — ${dateStr}`, 10, { bold: true });
    text(i.title, 11, { bold: true });
    if (i.member?.display_name) text(`Consultor: ${i.member.display_name}${i.lead?.name ? ` · Lead: ${i.lead.name}` : ""}`, 9, { color: [110, 110, 110] });
    if (i.detail) text(i.detail, 10);
    if (i.signal_quote) text(`Cliente: "${i.signal_quote}"`, 10, { color: [180, 30, 30] });
    if (i.consultant_quote) text(`Consultor: ${i.consultant_quote}`, 10, { color: [80, 80, 80] });
    if (i.suggestion) text(`Sugestão IA: ${i.suggestion}`, 10, { color: [20, 120, 70] });
    y += 6;
    doc.setDrawColor(235); doc.line(margin, y, pageW - margin, y); y += 10;
  }

  // Footer page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`${p} / ${total}`, pageW - margin, pageH - 20, { align: "right" });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`coaching-ia-${stamp}.pdf`);
}
