import { useMemo } from "react";
import { useLeads } from "@/hooks/useData";
import { CLOSERS, closerById, type Closer } from "@/lib/closers";
import type { Tables } from "@/integrations/supabase/types";

export type MeetingItem = {
  leadId: string;
  leadName: string;
  phone: string | null;
  at: Date;
  closerId: string | null;
  closerName: string | null;
  value: number | null;
  valueSource: "manual" | "auto" | null;
  consultantMemberId: string | null;
  status: "agendado" | "compareceu" | "nao_compareceu" | "fechou" | "perdido";
  rescheduledTo: string | null;
  isRescheduled: boolean;
};

/** Reconhece o valor do lead automaticamente quando o consultor não anotou. */
export function autoLeadValue(lead: Tables<"leads">): number | null {
  const meta = (lead.metadata ?? {}) as Record<string, any>;
  const candidates = [meta.sale_value, meta.lead_value, lead.credit_value];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const interest = lead.interest ?? "";
  const m = interest.replace(/\./g, "").match(/(\d{4,})/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function leadValueInfo(lead: Tables<"leads">): { value: number | null; source: "manual" | "auto" | null } {
  const meta = (lead.metadata ?? {}) as Record<string, any>;
  const manual = Number(meta.lead_value ?? meta.sale_value);
  if (Number.isFinite(manual) && manual > 0) return { value: manual, source: "manual" };
  const auto = autoLeadValue(lead);
  return { value: auto, source: auto ? "auto" : null };
}

function statusOf(lead: Tables<"leads">): MeetingItem["status"] {
  const meta = (lead.metadata ?? {}) as Record<string, any>;
  if (lead.stage === "comprou" || lead.status === "won") return "fechou";
  if (lead.stage === "perdido" || lead.status === "lost") return "perdido";
  if (meta.meeting_attended === true || lead.stage === "compareceu") return "compareceu";
  if (meta.meeting_attended === false) return "nao_compareceu";
  return "agendado";
}

export function meetingsFromLeads(leads: Tables<"leads">[]): MeetingItem[] {
  const out: MeetingItem[] = [];
  for (const lead of leads) {
    const meta = (lead.metadata ?? {}) as Record<string, any>;
    const raw = meta.meeting_rescheduled && meta.meeting_rescheduled_to
      ? `${meta.meeting_rescheduled_to}T${(meta.meeting_rescheduled_time || "09:00")}:00`
      : meta.meeting_scheduled_at;
    if (!raw) continue;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) continue;
    const isRescheduled = !!meta.meeting_rescheduled && !!meta.meeting_rescheduled_to;
    const closerId = isRescheduled ? meta.meeting_rescheduled_closer_id : meta.meeting_closer_id;
    const closerName = isRescheduled ? meta.meeting_rescheduled_closer_name : meta.meeting_closer_name;
    const closer = closerById(closerId);
    const { value, source } = leadValueInfo(lead);
    out.push({
      leadId: lead.id,
      leadName: lead.name || lead.phone || "Lead",
      phone: lead.phone,
      at,
      closerId: closer?.id ?? closerId ?? null,
      closerName: closer?.name ?? (closerName ?? null),
      value,
      valueSource: source,
      consultantMemberId: lead.assigned_member_id ?? null,
      status: statusOf(lead),
      rescheduledTo: meta.meeting_rescheduled_to ?? null,
      isRescheduled,
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Reuniões (baseadas nas anotações do consultor) dentro de um intervalo. */
export function useCloserMeetings(rangeStart?: Date, rangeEnd?: Date, scope?: { tenantId?: string | null; memberId?: string | null }) {
  const { data: leads = [], isLoading } = useLeads({ kind: "all", ...(scope ?? {}) });
  const meetings = useMemo(() => {
    const all = meetingsFromLeads(leads as Tables<"leads">[]);
    if (!rangeStart && !rangeEnd) return all;
    return all.filter((m) => {
      if (rangeStart && m.at < rangeStart) return false;
      if (rangeEnd && m.at >= rangeEnd) return false;
      return true;
    });
  }, [leads, rangeStart?.getTime(), rangeEnd?.getTime()]);

  const byCloser = useMemo(() => {
    const map = new Map<string, MeetingItem[]>();
    for (const c of CLOSERS) map.set(c.id, []);
    const unassigned: MeetingItem[] = [];
    for (const m of meetings) {
      if (m.closerId && map.has(m.closerId)) map.get(m.closerId)!.push(m);
      else unassigned.push(m);
    }
    return { map, unassigned };
  }, [meetings]);

  return { meetings, byCloser, isLoading, closers: CLOSERS as Closer[] };
}
