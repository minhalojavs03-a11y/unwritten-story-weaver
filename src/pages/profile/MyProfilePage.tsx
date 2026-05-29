import { useEffect, useState } from "react";
import { PageHeader } from "@/pages/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function MyProfilePage() {
  const { user, displayName, refreshProfile } = useAuth();
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(displayName ?? ""); }, [displayName]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Salvo" }); await refreshProfile(); }
  }

  return (
    <>
      <PageHeader title="Meu perfil" />
      <div className="space-y-4 p-3 md:max-w-md md:p-8">
        <div>
          <Label>Email</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </>
  );
}
