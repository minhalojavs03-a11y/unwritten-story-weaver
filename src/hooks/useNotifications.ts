import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";

export type NotificationType =
  | "new_lead"
  | "lead_assigned"
  | "new_message"
  | "lead_status";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  href: string;
  created_at: string;
  read: boolean;
};

type LeadNotificationPayload = {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  assigned_member_id: string | null;
  assigned_member_at: string | null;
};

type MessageNotificationPayload = {
  id: string;
  lead_id: string | null;
  direction: string | null;
  body: string | null;
  content: string | null;
  created_at: string | null;
};

const STORAGE_KEY_PREFIX = "feracon:notifications:lastSeen:";

function isPrivileged(roleLabel?: string | null, username?: string | null, authRoles?: string[], hasActiveMember = false) {
  const value = `${roleLabel ?? ""} ${username ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Quando existe consultor ativo, a privacidade segue o perfil interno dele,
  // não a role ampla do login principal. Isso evita aviso/conversa de outro consultor.
  if (hasActiveMember) return /(dono|owner|proprietario|supervisor)/.test(value);
  if (/(dono|owner|proprietario|supervisor)/.test(value)) return true;
  if ((authRoles ?? []).some((r) => ["owner", "supervisor", "superadmin"].includes(r))) return true;
  return false;
}

function scopeKey(tenantId: string, memberId: string | null) {
  return `${STORAGE_KEY_PREFIX}${tenantId}:${memberId ?? "all"}`;
}

function getLastSeen(key: string): string {
  try {
    return localStorage.getItem(key) ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } catch {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
}

function setLastSeen(key: string, iso: string) {
  try { localStorage.setItem(key, iso); } catch { /* noop */ }
}

export function useNotifications() {
  const { tenantId, roles } = useAuth();
  const { member } = useActiveMember();
  const [items, setItems] = useState<NotificationItem[]>([]);

  const privileged = useMemo(
    () => isPrivileged(member?.role_label, member?.username, roles as string[], !!member),
    [member, roles]
  );
  const memberId = member?.id ?? null;
  const key = tenantId ? scopeKey(tenantId, privileged ? null : memberId) : "";

  useEffect(() => {
    if (!tenantId) return;
    // Consultor sem membro ativo não recebe nada (privacidade)
    if (!privileged && !memberId) {
      setItems([]);
      return;
    }
    setItems([]);

    let cancelled = false;
    const ls = getLastSeen(key);

    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // ---- Leads ----
      let leadsQuery = supabase
        .from("leads")
        .select("id, name, phone, source, status, created_at, updated_at, assigned_member_id, assigned_member_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "lead")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!privileged && memberId) leadsQuery = leadsQuery.eq("assigned_member_id", memberId);


      // ---- Mensagens recebidas ----
      const msgsQuery = supabase
        .from("messages")
        .select("id, lead_id, conversation_id, direction, body, content, created_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "inbound")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30);

      const [{ data: leads }, { data: msgsRaw }] = await Promise.all([leadsQuery, msgsQuery]);
      if (cancelled) return;

      let messages = msgsRaw ?? [];
      // Filtra mensagens pelas leads do consultor
      if (!privileged && memberId && messages.length > 0) {
        const leadIds = Array.from(new Set(messages.map((m) => m.lead_id).filter(Boolean) as string[]));
        if (leadIds.length === 0) {
          messages = [];
        } else {
          const { data: ownedLeads } = await supabase
            .from("leads")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("assigned_member_id", memberId)
            .in("id", leadIds);
          const owned = new Set((ownedLeads ?? []).map((l) => l.id));
          messages = messages.filter((m) => m.lead_id && owned.has(m.lead_id));
        }
      }

      const leadItems: NotificationItem[] = (leads ?? []).map((l) => {
        const assignedToCurrentMember = !privileged && !!memberId && l.assigned_member_id === memberId;
        const type: NotificationType = assignedToCurrentMember ? "lead_assigned" : "new_lead";
        return {
          id: `lead:${l.id}`,
          type,
          title: type === "lead_assigned" ? "Lead atribuído a você" : "Novo lead",
          description: `${l.name ?? l.phone ?? "Sem nome"}${l.source ? ` · ${l.source}` : ""}${l.status ? ` · ${l.status}` : ""}`,
          href: assignedToCurrentMember ? `/conversas?lead=${l.id}` : `/leads/fila?lead=${l.id}`,
          created_at: l.created_at,
          read: l.created_at <= ls,
        };
      });

      const msgItems: NotificationItem[] = (messages ?? []).map((m) => ({
        id: `msg:${m.id}`,
        type: "new_message",
        title: "Nova mensagem",
        description: (m.body ?? m.content ?? "").toString().slice(0, 80) || "Mensagem recebida",
        href: m.lead_id ? `/conversas?lead=${m.lead_id}` : "/conversas",
        created_at: m.created_at,
        read: m.created_at <= ls,
      }));

      const merged = [...leadItems, ...msgItems]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 40);
      setItems(merged);
    })();

    const suffix = Math.random().toString(36).slice(2, 8);

    const leadFilter = !privileged && memberId
      ? `tenant_id=eq.${tenantId}`
      : `tenant_id=eq.${tenantId}`;

    const leadChannel = supabase
      .channel(`notif-leads-${tenantId}-${memberId ?? "all"}-${suffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: leadFilter },
        (payload) => {
          const l = payload.new as LeadNotificationPayload;
          if (!privileged && memberId && l.assigned_member_id !== memberId) return;
          setItems((prev) => {
            const id = `lead:${l.id}`;
            if (prev.some((i) => i.id === id)) return prev;
            const assignedToCurrentMember = !privileged && !!memberId && l.assigned_member_id === memberId;
            return [{ 
              
              id,
              type: assignedToCurrentMember ? "lead_assigned" : "new_lead",
              title: assignedToCurrentMember ? "Lead atribuído a você" : "Novo lead",
              description: `${l.name ?? l.phone ?? "Sem nome"}${l.source ? ` · ${l.source}` : ""}`,
              href: assignedToCurrentMember ? `/conversas?lead=${l.id}` : `/leads/fila?lead=${l.id}`,
              created_at: l.created_at,
              read: false,
            } as NotificationItem, ...prev].slice(0, 40);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: leadFilter },
        (payload) => {
          const l = payload.new as LeadNotificationPayload;
          const old = payload.old as Partial<LeadNotificationPayload>;
          if (!privileged && memberId) {
            const becameMine = l.assigned_member_id === memberId && old?.assigned_member_id !== memberId;
            const statusChanged = l.assigned_member_id === memberId && l.status && l.status !== old?.status;
            if (!becameMine && !statusChanged) return;
            setItems((prev) => {
              const id = `lead-up:${l.id}:${l.updated_at ?? Date.now()}`;
              if (prev.some((i) => i.id === id)) return prev;
              return [{ 
              
                id,
                type: becameMine ? "lead_assigned" : "lead_status",
                title: becameMine ? "Lead atribuído a você" : `Status atualizado: ${l.status}`,
                description: `${l.name ?? l.phone ?? "Sem nome"}`,
                href: `/conversas?lead=${l.id}`,
                created_at: l.updated_at ?? new Date().toISOString(),
                read: false,
              } as NotificationItem, ...prev].slice(0, 40);
            });
          } else if (privileged && l.status && l.status !== old?.status) {
            setItems((prev) => {
              const id = `lead-up:${l.id}:${l.updated_at ?? Date.now()}`;
              if (prev.some((i) => i.id === id)) return prev;
              return [{ 
              
                id,
                type: "lead_status",
                title: `Status atualizado: ${l.status}`,
                description: `${l.name ?? l.phone ?? "Sem nome"}`,
                href: `/conversas?lead=${l.id}`,
                created_at: l.updated_at ?? new Date().toISOString(),
                read: false,
              } as NotificationItem, ...prev].slice(0, 40);
            });
          }
        }
      )
      .subscribe();

    const msgChannel = supabase
      .channel(`notif-msgs-${tenantId}-${memberId ?? "all"}-${suffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const m = payload.new as MessageNotificationPayload;
          if (m.direction !== "inbound") return;
          if (!privileged && memberId) {
            if (!m.lead_id) return;
            const { data: lead } = await supabase
              .from("leads")
              .select("assigned_member_id")
              .eq("id", m.lead_id)
              .eq("tenant_id", tenantId)
              .maybeSingle();
            if (!lead || lead.assigned_member_id !== memberId) return;
          }
          setItems((prev) => {
            const id = `msg:${m.id}`;
            if (prev.some((i) => i.id === id)) return prev;
            return [{ 
              
              id,
              type: "new_message",
              title: "Nova mensagem",
              description: (m.body ?? m.content ?? "").toString().slice(0, 80) || "Mensagem recebida",
              href: m.lead_id ? `/conversas?lead=${m.lead_id}` : "/conversas",
              created_at: m.created_at ?? new Date().toISOString(),
              read: false,
            } as NotificationItem, ...prev].slice(0, 40);
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(leadChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [tenantId, privileged, memberId, key]);

  // Defesa em profundidade: nunca mostrar a um consultor algo que não seja dele.
  const safeItems = useMemo(() => {
    if (privileged) return items;
    if (!memberId) return [];
    // Para não-privilegiados, "new_lead" (lead da fila aberta) nunca deve aparecer:
    // o consultor só vê leads atribuídos a ele, mensagens dele e status dos leads dele.
    return items.filter((i) => i.type !== "new_lead");
  }, [items, privileged, memberId]);

  const unreadCount = safeItems.filter((i) => !i.read).length;

  const markAllRead = useCallback(() => {
    if (!key) return;
    const now = new Date().toISOString();
    setLastSeen(key, now);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }, [key]);

  return { items: safeItems, unreadCount, markAllRead };
}
