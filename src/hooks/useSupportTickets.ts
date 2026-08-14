import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import type { TicketStatus } from "@/lib/support";

export interface SupportTicket {
  id: string;
  tenant_id: string;
  created_by: string;
  requester_name: string | null;
  requester_email: string | null;
  subject: string;
  description: string;
  images: string[];
  status: TicketStatus;
  priority: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  is_support: boolean;
  body: string;
  images: string[];
  created_at: string;
}

const TABLE = "support_tickets" as never;
const MSG_TABLE = "support_ticket_messages" as never;

/** Suporte / superadmin / dono veem todos; os demais veem só os próprios. */
export function useSupportTickets() {
  return useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupportTicket[];
    },
    staleTime: 15_000,
  });
}

export function useTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ["support-ticket-messages", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(MSG_TABLE)
        .select("*")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SupportTicketMessage[];
    },
  });
}

/** Gera URLs assinadas para os prints (bucket privado). */
export function useSignedTicketImages(paths: string[]) {
  return useQuery({
    queryKey: ["support-ticket-images", paths.join("|")],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("support-tickets")
        .createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      return (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[];
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const { user, tenantId } = useAuth();

  return useMutation({
    mutationFn: async (input: { subject: string; description: string; priority?: string; files: File[] }) => {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");

      const paths: string[] = [];
      for (const file of input.files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("support-tickets").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) throw error;
        paths.push(path);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          tenant_id: tenantId ?? FERACON_TENANT_ID,
          created_by: user.id,
          requester_name: profile?.display_name ?? profile?.full_name ?? profile?.email ?? null,
          requester_email: profile?.email ?? user.email ?? null,
          subject: input.subject,
          description: input.description,
          priority: input.priority ?? "normal",
          images: paths,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: TicketStatus; priority?: string; resolution_notes?: string }) => {
      const patch: Record<string, unknown> = {};
      if (input.status) {
        patch.status = input.status;
        patch.resolved_at = input.status === "resolvido" || input.status === "fechado" ? new Date().toISOString() : null;
      }
      if (input.priority) patch.priority = input.priority;
      if (input.resolution_notes !== undefined) patch.resolution_notes = input.resolution_notes;
      const { error } = await supabase.from(TABLE).update(patch as never).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });
}

export function useSendTicketMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { ticketId: string; body: string; isSupport: boolean; authorName?: string | null }) => {
      if (!user) throw new Error("Sessão expirada.");
      const { error } = await supabase.from(MSG_TABLE).insert({
        ticket_id: input.ticketId,
        author_id: user.id,
        author_name: input.authorName ?? user.email ?? null,
        is_support: input.isSupport,
        body: input.body,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["support-ticket-messages", vars.ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });
}

/** True quando a conta logada é a conta de Suporte (ou superadmin). */
export function useIsSupportAccount() {
  const { roles, isSuperadmin } = useAuth();
  return (roles as string[]).includes("support") || isSuperadmin;
}

export function useIsSupportRole() {
  const { roles } = useAuth();
  return (roles as string[]).includes("support");
}
