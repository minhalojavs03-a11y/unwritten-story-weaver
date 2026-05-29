import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Check, Loader2, Save } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { useUpdateMyProfile, type Profile, type ProfileUpdate } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";

interface Props {
  profile: Profile;
  onSave?: (patch: ProfileUpdate) => Promise<void>;
}

export function EditProfileForm({ profile, onSave }: Props) {
  const update = useUpdateMyProfile();
  const [extSaving, setExtSaving] = useState(false);
  const isPending = onSave ? extSaving : update.isPending;
  const [savedFlash, setSavedFlash] = useState(false);

  const [form, setForm] = useState<ProfileUpdate>({
    full_name: profile.full_name ?? "",
    display_name: profile.display_name ?? "",
    role_label: profile.role_label ?? "",
    bio: profile.bio ?? "",
    phone: profile.phone ?? "",
    avatar_color: profile.avatar_color ?? "#1E40AF",
    monthly_goal: profile.monthly_goal ?? 0,
    notification_whatsapp: profile.notification_whatsapp ?? true,
    notification_email: profile.notification_email ?? false,
  });

  useEffect(() => {
    setForm({
      full_name: profile.full_name ?? "",
      display_name: profile.display_name ?? "",
      role_label: profile.role_label ?? "",
      bio: profile.bio ?? "",
      phone: profile.phone ?? "",
      avatar_color: profile.avatar_color ?? "#1E40AF",
      monthly_goal: profile.monthly_goal ?? 0,
      notification_whatsapp: profile.notification_whatsapp ?? true,
      notification_email: profile.notification_email ?? false,
    });
  }, [profile.id]);

  function set<K extends keyof ProfileUpdate>(k: K, v: ProfileUpdate[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || (form.full_name as string).trim().length < 2) {
      toast({ title: "Nome obrigatório", description: "Informe seu nome completo.", variant: "destructive" });
      return;
    }
    if (form.bio && (form.bio as string).length > 160) {
      toast({ title: "Bio muito longa", description: "Máximo 160 caracteres.", variant: "destructive" });
      return;
    }
    try {
      if (onSave) {
        setExtSaving(true);
        await onSave(form);
      } else {
        await update.mutateAsync(form);
      }
      toast({ title: "Perfil salvo" });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? "Tente novamente", variant: "destructive" });
    } finally {
      setExtSaving(false);
    }
  }

  const bioLen = (form.bio as string)?.length ?? 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-card p-5 md:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Editar perfil</h2>
        <p className="text-sm text-muted-foreground">Suas informações aparecem em todo o sistema.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="full_name">Nome completo *</Label>
          <Input id="full_name" value={form.full_name as string} onChange={(e) => set("full_name", e.target.value)} maxLength={120} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="display_name">Como quer ser chamado(a)?</Label>
          <Input id="display_name" placeholder="Ex: Maria A." value={form.display_name as string} onChange={(e) => set("display_name", e.target.value)} maxLength={40} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role_label">Cargo personalizado</Label>
          <Input id="role_label" placeholder="Ex: Consultor Sênior" value={form.role_label as string} onChange={(e) => set("role_label", e.target.value)} maxLength={60} />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="bio">Bio / Apresentação</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{bioLen}/160</span>
          </div>
          <Textarea id="bio" rows={3} value={form.bio as string} onChange={(e) => set("bio", e.target.value.slice(0, 160))} placeholder="Fale um pouco sobre você e sua experiência…" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone (para notificações WhatsApp)</Label>
          <Input id="phone" inputMode="tel" placeholder="(47) 99999-0000" value={form.phone as string} onChange={(e) => set("phone", e.target.value)} maxLength={20} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="monthly_goal">Meta mensal de atendimentos</Label>
          <Input id="monthly_goal" type="number" min={0} max={9999} value={(form.monthly_goal as number) ?? 0} onChange={(e) => set("monthly_goal", Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Cor do avatar (quando sem foto)</Label>
        <ColorPicker value={(form.avatar_color as string) ?? "#1E40AF"} onChange={(c) => set("avatar_color", c)} />
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <div className="text-sm font-medium">Notificações</div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Alertas de leads via WhatsApp</div>
          <Switch checked={!!form.notification_whatsapp} onCheckedChange={(v) => set("notification_whatsapp", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Alertas por e-mail</div>
          <Switch checked={!!form.notification_email} onCheckedChange={(v) => set("notification_email", v)} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</>
          ) : savedFlash ? (
            <><Check className="mr-2 h-4 w-4" />Salvo!</>
          ) : (
            <><Save className="mr-2 h-4 w-4" />Salvar alterações</>
          )}
        </Button>
      </div>
    </form>
  );
}
