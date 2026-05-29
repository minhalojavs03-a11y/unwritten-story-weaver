import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ============= MEETING TYPES (universo cons\u00f3rcio) =============
export const MEETING_TYPES = [
  { value: "simulacao", label: "Simulação", color: "info", description: "Apresentação de planos e simulação de cotas" },
  { value: "proposta", label: "Proposta", color: "warning", description: "Envio formal e revisão da proposta" },
  { value: "objecoes", label: "Quebra de objeções", color: "destructive", description: "Reunião para alinhar dúvidas finais" },
  { value: "assinatura", label: "Assinatura", color: "success", description: "Fechamento e formalização do contrato" },
  { value: "pos_venda", label: "Pós-venda", color: "stage-attended", description: "Acompanhamento e relacionamento" },
  { value: "treinamento", label: "Treinamento interno", color: "primary", description: "Reunião com a equipe" },
] as const;

export type MeetingType = typeof MEETING_TYPES[number]["value"];

export const MEETING_OUTCOMES = [
  { value: "fechou", label: "Fechou cota", color: "success" },
  { value: "pendente_decisao", label: "Pendente de decisão", color: "warning" },
  { value: "objecao", label: "Trouxe objeção", color: "info" },
  { value: "perdido", label: "Perdido", color: "destructive" },
  { value: "remarcado", label: "Remarcado", color: "muted" },
] as const;

// ============= RECORDINGS =============
export interface RecordingFilter {
  consultantId?: string | null;
  meetingType?: string | null;
  leadId?: string | null;
  featuredOnly?: boolean;
  trainingOnly?: boolean;
  search?: string;
}

export function useRecordings(filter: RecordingFilter = {}) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["meeting_recordings", tenantId, filter],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("meeting_recordings")
        .select("*, lead:leads(name, phone)")
        .order("recorded_at", { ascending: false });
      if (filter.consultantId) q = q.eq("consultant_member_id", filter.consultantId);
      if (filter.meetingType) q = q.eq("meeting_type", filter.meetingType);
      if (filter.leadId) q = q.eq("lead_id", filter.leadId);
      if (filter.featuredOnly) q = q.eq("is_featured", true);
      if (filter.trainingOnly) q = q.eq("is_training_pick", true);
      if (filter.search) q = q.ilike("title", `%${filter.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateRecording() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      meeting_type?: string;
      consultant_member_id?: string | null;
      lead_id?: string | null;
      appointment_id?: string | null;
      video_url?: string;
      thumbnail_url?: string;
      duration_seconds?: number;
      category?: string;
      tags?: string[];
      is_featured?: boolean;
      is_training_pick?: boolean;
    }) => {
      if (!tenantId) throw new Error("sem tenant");
      const { error } = await supabase.from("meeting_recordings").insert({
        ...input,
        tenant_id: tenantId,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_recordings"] }),
  });
}

export function useUpdateRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<{ title: string; description: string; is_featured: boolean; is_training_pick: boolean; category: string; tags: string[]; meeting_type: string }> }) => {
      const { error } = await supabase.from("meeting_recordings").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_recordings"] }),
  });
}

export function useDeleteRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meeting_recordings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_recordings"] }),
  });
}

// ============= GOOGLE INTEGRATION =============
export function useGoogleIntegration() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["google_integration", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_integration")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

async function callGoogleCalendar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as any;
}

export function useVerifyGoogleConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callGoogleCalendar({ action: "verify" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google_integration"] }),
  });
}

export function useSyncAppointmentToGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { appointment_id: string; create_meet?: boolean }) =>
      callGoogleCalendar({ action: "sync_appointment", ...vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useDeleteGoogleEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (appointment_id: string) =>
      callGoogleCalendar({ action: "delete_event", appointment_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useGoogleCalendarEvents(timeMin?: Date, timeMax?: Date) {
  const { data: integration } = useGoogleIntegration();
  return useQuery({
    queryKey: ["google_calendar_events", timeMin?.toISOString(), timeMax?.toISOString()],
    enabled: !!integration?.is_connected,
    queryFn: async () => {
      const data = await callGoogleCalendar({
        action: "list_events",
        time_min: timeMin?.toISOString(),
        time_max: timeMax?.toISOString(),
      });
      return data?.items ?? [];
    },
  });
}

// ============= GOOGLE DRIVE SYNC (Meet recordings) =============
export function useSyncMeetRecordings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-meet-recordings", { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { ok: boolean; scanned: number; inserted: number; skipped: number; folders_found: number; errors: string[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting_recordings"] }),
  });
}


