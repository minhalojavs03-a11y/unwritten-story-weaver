import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";

const realtimeChannelName = (scope: string, id: string) =>
  `${scope}-${id}-${Math.random().toString(36).slice(2, 10)}`;

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: string; message?: string } | null;
    if (payload?.error || payload?.message) return payload.error ?? payload.message ?? fallback;
    if (context.status === 401) return "Sessão expirada. Saia e entre novamente para enviar mensagens.";
  }

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/non-2xx status code/i.test(message)) return fallback;
  return message || fallback;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function callWhatsAppManageOnce(body: Record<string, unknown>, accessToken: string) {
  try {
    const response = await fetch("/api/whatsapp-manage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const payload = isJson
      ? await response.json().catch(() => null) as { error?: string; message?: string } | null
      : null;
    // Proxy ausente: hospedagens sem o rewrite de /api/whatsapp-manage caem no
    // fallback SPA (HTML 200). Tratamos como proxy indisponível e caímos para
    // o invoke direto da edge function, em vez de retornar sucesso silencioso.
    if (!isJson) throw new Error("proxy_unavailable");
    if ((response.status === 404 || response.status === 405) && !payload) throw new Error("proxy_unavailable");
    if (response.status === 401) throw new Error("unauthorized");
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error ?? payload?.message ?? `Falha ao enviar pelo WhatsApp (${response.status})`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message !== "proxy_unavailable") throw error;
  }

  const { data, error } = await supabase.functions.invoke("whatsapp-manage", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (error || (data as any)?.error) {
    const ctxStatus = (error as any)?.context?.status;
    const payloadErr = (data as any)?.error as string | undefined;
    if (ctxStatus === 401 || /unauthorized/i.test(payloadErr ?? "")) throw new Error("unauthorized");
    const msg = payloadErr || await getFunctionErrorMessage(error, "Falha ao enviar pelo WhatsApp");
    throw new Error(msg);
  }
  return data;
}

async function callWhatsAppManage(body: Record<string, unknown>, accessToken: string) {
  try {
    return await callWhatsAppManageOnce(body, accessToken);
  } catch (err) {
    if (err instanceof Error && err.message === "unauthorized") {
      // Sessão pode ter expirado entre o getSession() e a chamada: tenta atualizar uma vez.
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          return await callWhatsAppManageOnce(body, refreshed);
        } catch (retryErr) {
          if (retryErr instanceof Error && retryErr.message === "unauthorized") {
            throw new Error("Sessão expirada. Saia e entre novamente para enviar mensagens.");
          }
          throw retryErr;
        }
      }
      throw new Error("Sessão expirada. Saia e entre novamente para enviar mensagens.");
    }
    throw err;
  }
}

// ============= LEADS =============
export function useLeads() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["leads", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tables<"leads">[];
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(realtimeChannelName("leads-changes", tenantId))
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `tenant_id=eq.${tenantId}` }, () => {
        qc.invalidateQueries({ queryKey: ["leads"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, qc]);

  return q;
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"leads"> }) => {
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useCreateLead() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"leads">, "tenant_id">) => {
      if (!tenantId) throw new Error("sem tenant");
      const { data, error } = await supabase
        .from("leads")
        .insert({ ...input, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// ============= CONVERSATIONS + MESSAGES =============
export function useConversations() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["conversations", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, lead:leads(*)")
        .eq("tenant_id", tenantId!)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(realtimeChannelName("conv-changes", tenantId))
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
        qc.invalidateQueries({ queryKey: ["conversations"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, qc]);
  return q;
}

export function useMessages(
  conversationId: string | null,
  leadId?: string | null,
  opts?: { leadPhone?: string | null; tenantId?: string | null }
) {
  const qc = useQueryClient();
  const phone = opts?.leadPhone ?? null;
  const tenantId = opts?.tenantId ?? null;
  const q = useQuery({
    queryKey: ["messages", conversationId, leadId ?? null, phone, tenantId],
    enabled: !!conversationId || !!leadId,
    queryFn: async () => {
      // Resolve TODOS os lead ids irmãos (mesmo telefone no tenant) — o bot de
      // pré-atendimento muitas vezes grava num lead diferente do que ficou para
      // o consultor; sem isso o chat abre vazio.
      let leadIds: string[] = leadId ? [leadId] : [];
      if (tenantId && phone) {
        const digits = phone.replace(/\D/g, "");
        if (digits.length >= 8) {
          const { data: siblings } = await supabase
            .from("leads")
            .select("id, phone")
            .eq("tenant_id", tenantId);
          const matched = (siblings ?? [])
            .filter((l: any) => (l.phone ?? "").replace(/\D/g, "") === digits)
            .map((l: any) => l.id as string);
          leadIds = Array.from(new Set([...leadIds, ...matched]));
        }
      }

      let query = supabase.from("messages").select("*");
      if (conversationId && leadIds.length > 0) {
        const inList = leadIds.map((id) => `lead_id.eq.${id}`).join(",");
        query = query.or(`conversation_id.eq.${conversationId},${inList}`);
      } else if (conversationId) {
        query = query.eq("conversation_id", conversationId);
      } else if (leadIds.length > 0) {
        query = query.in("lead_id", leadIds);
      }
      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw error;
      const seenExternal = new Set<string>();
      const unique: Tables<"messages">[] = [];
      for (const msg of (data ?? []) as Tables<"messages">[]) {
        const externalId = (msg.external_id ?? "").trim();
        if (externalId) {
          if (seenExternal.has(externalId)) continue;
          seenExternal.add(externalId);
        }
        const text = (msg.body ?? msg.content ?? "").trim();
        const createdAt = new Date(msg.created_at).getTime();
        const nearDuplicate = text
          ? unique.some((prev) => {
              const prevText = (prev.body ?? prev.content ?? "").trim();
              const prevAt = new Date(prev.created_at).getTime();
              return prev.direction === msg.direction
                && prevText === text
                && Math.abs(prevAt - createdAt) <= 10_000
                && (!prev.external_id || !msg.external_id);
            })
          : false;
        if (!nearDuplicate) unique.push(msg);
      }
      return unique;
    },
  });
  useEffect(() => {
    if (!conversationId && !leadId) return;
    const key = conversationId ?? leadId!;
    const ch = supabase
      .channel(realtimeChannelName("msgs", key))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: conversationId ? `conversation_id=eq.${conversationId}` : `lead_id=eq.${leadId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", conversationId, leadId ?? null, phone, tenantId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, leadId, phone, tenantId, qc]);
  return q;
}


export function useSendMessage() {
  const { tenantId, user, roles, isSuperadmin } = useAuth();
  const { member } = useActiveMember();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, leadId, body }: { conversationId: string; leadId: string; body: string }) => {
      if (!tenantId) throw new Error("sem tenant");
      // Busca telefone do lead + instância fixada (se houver) + responsável atual
      const { data: lead } = await supabase
        .from("leads")
        .select("phone, whatsapp_instance_id, assigned_member_id, assigned_to")
        .eq("id", leadId)
        .maybeSingle();
      if (!lead?.phone) throw new Error("Lead sem telefone");

      // Trava: só o vendedor responsável (ou owner/supervisor/superadmin) pode enviar
      const canOverride = isSuperadmin || (roles ?? []).some((r) => ["superadmin", "owner", "supervisor"].includes(r as string));
      const assignedMemberId = lead.assigned_member_id ?? null;
      const assignedUserId = (lead as { assigned_to?: string | null }).assigned_to ?? null;
      const isAssignedToCurrentUser =
        (!!assignedMemberId && assignedMemberId === member?.id) ||
        (!!assignedUserId && assignedUserId === user?.id);
      if (!user?.id) throw new Error("Sessão expirada. Saia e entre novamente para enviar mensagens.");
      if ((assignedMemberId || assignedUserId) && !isAssignedToCurrentUser && !canOverride) {
        throw new Error("Este lead já está sendo atendido por outro vendedor.");
      }

      // Se ainda não tem responsável, assume automaticamente para o vendedor ativo
      if (!assignedMemberId && !assignedUserId && member?.id) {
        const { error: assumeErr } = await supabase.rpc("assume_lead", {
          _lead_id: leadId,
          _member_id: member.id,
        });
        if (assumeErr) throw new Error(assumeErr.message || "Não foi possível assumir o lead.");
      }


      // Carrega instâncias conectadas do tenant
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("id,is_connected,status,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      const connected = (instances ?? []).filter(
        (i) => i.is_connected === true || i.status === "connected",
      );
      if (connected.length === 0) throw new Error("Nenhuma instância WhatsApp conectada");

      // Decide qual instância usar (fixa por lead): mantém a já vinculada se ainda estiver conectada;
      // senão escolhe a menos carregada entre as conectadas e fixa no lead (load-balance).
      let chosenInstanceId: string | null =
        lead.whatsapp_instance_id && connected.some((i) => i.id === lead.whatsapp_instance_id)
          ? lead.whatsapp_instance_id
          : null;

      if (!chosenInstanceId) {
        // Conta leads por instância para balancear
        const counts: Record<string, number> = {};
        await Promise.all(
          connected.map(async (inst) => {
            const { count } = await supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("whatsapp_instance_id", inst.id);
            counts[inst.id] = count ?? 0;
          }),
        );
        chosenInstanceId = connected
          .slice()
          .sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0))[0].id;
        await supabase.from("leads").update({ whatsapp_instance_id: chosenInstanceId }).eq("id", leadId);
      }

      let targetConversationId = conversationId;
      if (!targetConversationId || targetConversationId.startsWith("virtual:")) {
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingConv?.id) {
          targetConversationId = existingConv.id;
        } else {
          const { data: createdConv, error: convErr } = await supabase
            .from("conversations")
            .insert({ tenant_id: tenantId, lead_id: leadId, whatsapp_instance_id: chosenInstanceId })
            .select("id")
            .single();
          if (convErr || !createdConv?.id) throw new Error(convErr?.message || "Não foi possível criar a conversa.");
          targetConversationId = createdConv.id;
        }
      }

      // Prefixa nome do vendedor (identidade interna ativa) na mensagem enviada ao lead.
      // Busca o display_name atualizado direto do tenant_members para evitar
      // usar um valor antigo cacheado em localStorage (ex.: typo corrigido depois).
      let sellerName = member?.display_name?.trim()
        || (user?.user_metadata?.display_name as string | undefined)?.trim()
        || (user?.user_metadata?.full_name as string | undefined)?.trim()
        || (user?.user_metadata?.name as string | undefined)?.trim();
      if (member?.id) {
        const { data: freshMember } = await supabase
          .from("tenant_members")
          .select("display_name")
          .eq("id", member.id)
          .maybeSingle();
        const freshName = freshMember?.display_name?.trim();
        if (freshName) sellerName = freshName;
      }
      const outgoingText = sellerName ? `*${sellerName}:*\n${body}` : body;

      // Insere mensagem como 'pending' antes de enviar
      const { data: inserted, error: insErr } = await supabase.from("messages").insert({
        tenant_id: tenantId,
        conversation_id: targetConversationId,
        lead_id: leadId,
        whatsapp_instance_id: chosenInstanceId,
        direction: "outbound",
        body: outgoingText,
        sent_by: user?.id,
        status: "pending",
      }).select("id").maybeSingle();
      if (insErr) throw insErr;
      if (!inserted) {
        throw new Error("Mensagem idêntica já registrada agora há pouco. Aguarde alguns segundos antes de repetir.");
      }

      // Envio manual: sem delay. Delay humano é aplicado apenas em disparos automáticos.



      // Chama edge function para enviar via WhatsApp na instância escolhida
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionErr || !accessToken) {
        await supabase.from("messages").update({ status: "failed" }).eq("id", inserted.id);
        throw new Error("Sessão expirada. Saia e entre novamente para enviar mensagens.");
      }

      try {
        await callWhatsAppManage({
          action: "send-text",
          tenant_id: tenantId,
          instance_id: chosenInstanceId,
          phone: lead.phone,
          text: outgoingText,
          message_id: inserted.id,
        }, accessToken);
      } catch (sendError) {
        // Se a conexão cair perto do envio, a função ainda pode ter atualizado
        // a mensagem. Confirmamos no banco antes de transformar em falha.
        await new Promise((r) => setTimeout(r, 8000));
        const { data: confirmed } = await supabase
          .from("messages")
          .select("status")
          .eq("id", inserted.id)
          .maybeSingle();
        if (!confirmed?.status || confirmed.status === "pending") {
          await supabase.from("messages").update({ status: "failed" }).eq("id", inserted.id);
          const msg = await getFunctionErrorMessage(sendError, "Falha ao enviar pelo WhatsApp");
          throw new Error(msg);
        }
        if (confirmed.status === "failed") {
          throw new Error(await getFunctionErrorMessage(sendError, "Falha ao enviar pelo WhatsApp"));
        }
        // status já é delivered/sent — envio ocorreu, ignora erro do fetch
      }


      // Atualiza preview da conversa
      await supabase.from("conversations").update({
        last_message_preview: outgoingText,
        last_message_at: new Date().toISOString(),
        whatsapp_instance_id: chosenInstanceId,
        unread_count: 0,
      }).eq("id", targetConversationId);
      await supabase.from("leads").update({ last_message_at: new Date().toISOString(), last_interaction_at: new Date().toISOString() }).eq("id", leadId);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// ============= LEAD ASSIGNMENT =============
export function useAssumeLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, memberId }: { leadId: string; memberId: string }) => {
      const { error } = await supabase.rpc("assume_lead", { _lead_id: leadId, _member_id: memberId });
      if (error) throw new Error(error.message || "Não foi possível assumir o lead.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useReleaseLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, memberId }: { leadId: string; memberId: string }) => {
      const { error } = await supabase.rpc("release_lead", { _lead_id: leadId, _member_id: memberId });
      if (error) throw new Error(error.message || "Não foi possível liberar o lead.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useTenantMembers() {
  const { tenantId } = useAuth();
  const { isOwner, isSuperadmin } = useAuth();
  const { member } = useActiveMember();
  return useQuery({
    queryKey: ["tenant_members_public", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_members_public");
      if (error) throw error;
      type Row = { id: string; username: string; display_name: string; role_label: string | null; avatar_color: string | null; avatar_url: string | null; bio: string | null; phone: string | null; last_seen_at: string | null; receives_leads: boolean | null };
      const rows = (data ?? []) as Row[];
      // Privacidade: telefone e bio de outros consultores só aparecem para
      // dono/supervisor/superadmin. Cada um continua vendo os próprios dados.
      const memberRole = (member?.role_label || "").toLowerCase();
      const memberPrivileged = /dono|owner|propriet|supervisor/.test(memberRole);
      const canSeeAll = isSuperadmin || (isOwner && memberPrivileged) || memberPrivileged;
      if (canSeeAll) return rows;
      return rows.map((r) => (r.id === member?.id ? r : { ...r, phone: null, bio: null }));
    },
  });
}



// ============= APPOINTMENTS =============
export function useAppointments(rangeStart?: Date, rangeEnd?: Date) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["appointments", tenantId, rangeStart?.toISOString(), rangeEnd?.toISOString()],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from("appointments").select("*, lead:leads(name, phone)").order("scheduled_at", { ascending: true });
      if (rangeStart) q = q.gte("scheduled_at", rangeStart.toISOString());
      if (rangeEnd) q = q.lte("scheduled_at", rangeEnd.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateAppointment() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"appointments">, "tenant_id" | "created_by">) => {
      if (!tenantId) throw new Error("sem tenant");
      const { data, error } = await supabase
        .from("appointments")
        .insert({ ...input, tenant_id: tenantId, created_by: user?.id })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"appointments"> }) => {
      const { error } = await supabase.from("appointments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

// ============= TENANT / AI / WHATSAPP =============
export function useMyTenant() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").eq("id", tenantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAiConfig() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["ai_config", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_config").select("*").eq("tenant_id", tenantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAiConfig() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"ai_config">) => {
      if (!tenantId) throw new Error("sem tenant");
      const { error } = await supabase.from("ai_config").update(patch).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_config"] }),
  });
}

export function useToggleAiPreAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; enabled: boolean } | boolean) => {
      const payload = typeof input === "boolean"
        ? { _lead_id: "", _enabled: input }
        : { _lead_id: input.leadId, _enabled: input.enabled };
      const { error } = await supabase.rpc("set_ai_pre_attendance", payload);
      if (error) throw new Error(error.message || "Não foi possível atualizar o pré-atendimento.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_config"] }),
  });
}

export function useWhatsAppInstance() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["wa_instance", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances").select("*").eq("tenant_id", tenantId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWhatsAppInstance() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ instance_name, phone_number }: { instance_name: string; phone_number: string }) => {
      if (!tenantId) throw new Error("sem tenant");
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .insert({ tenant_id: tenantId, instance_name, phone_number, status: "connecting" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa_instance"] }),
  });
}

export function useUpdateWhatsAppInstance() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"whatsapp_instances"> & { id: string }) => {
      if (!tenantId) throw new Error("sem tenant");
      const { id, ...rest } = patch;
      const { error } = await supabase.from("whatsapp_instances").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa_instance"] }),
  });
}

export function useDeleteWhatsAppInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_instances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa_instance"] }),
  });
}

// ============= TEMPLATES / AUTOMATIONS =============
export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tables<"templates">[];
    },
  });
}
export function useAutomations() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["automations", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tables<"automations">[];
    },
  });
}

// ============= SUPERADMIN =============
export function useAllTenants() {
  return useQuery({
    queryKey: ["all_tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tables<"tenants">[];
    },
  });
}

export function useAllInstances() {
  return useQuery({
    queryKey: ["all_instances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_instances").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const instances = data ?? [];
      const tenantIds = [...new Set(instances.map((instance) => instance.tenant_id).filter(Boolean))];
      if (tenantIds.length === 0) return instances.map((instance) => ({ ...instance, tenant: null }));

      const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
      const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));

      return instances.map((instance) => ({
        ...instance,
        tenant: tenantById.get(instance.tenant_id) ?? null,
      }));
    },
  });
}

// ============= DASHBOARD METRICS =============
export function useDashboardMetrics(memberId?: string | null) {
  const { tenantId } = useAuth();
  const scoped = !!memberId;
  return useQuery({
    queryKey: ["dashboard_metrics", tenantId, memberId ?? "all"],
    enabled: !!tenantId,
    queryFn: async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

      const leadsBase = () => {
        let q = supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!);
        if (scoped) q = q.eq("assigned_member_id", memberId!);
        return q;
      };
      const convBase = () => {
        if (scoped) {
          return supabase
            .from("conversations")
            .select("id, lead:leads!inner(assigned_member_id)", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .eq("lead.assigned_member_id", memberId!);
        }
        return supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!);
      };

      const [leadsToday, activeConv, appts, hot, awaiting] = await Promise.all([
        scoped
          ? leadsBase().gte("assigned_member_at", today.toISOString()).neq("stage", "historico")
          : leadsBase().gte("created_at", today.toISOString()).neq("stage", "historico"),
        convBase().eq("status", "open"),
        scoped
          ? supabase.from("appointments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("consultant_member_id", memberId!).gte("scheduled_at", today.toISOString()).lt("scheduled_at", tomorrow.toISOString())
          : supabase.from("appointments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).gte("scheduled_at", today.toISOString()).lt("scheduled_at", tomorrow.toISOString()),
        leadsBase().eq("temperature", "hot").not("stage", "in", "(comprou,perdido,historico)"),
        convBase().gt("unread_count", 0),
      ]);
      return {
        leadsToday: leadsToday.count ?? 0,
        activeConversations: activeConv.count ?? 0,
        appointmentsToday: appts.count ?? 0,
        hotOpportunities: hot.count ?? 0,
        awaitingResponse: awaiting.count ?? 0,
      };
    },
  });
}
