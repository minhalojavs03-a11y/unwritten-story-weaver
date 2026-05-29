import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useUploadAvatar } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIM = 400;

async function compressImage(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });

  // crop quadrado central
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const out = Math.min(side, MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

  return await new Promise<Blob>((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("falha ao comprimir"))), "image/jpeg", 0.85);
  });
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  uploadFn?: (blob: Blob) => Promise<unknown>;
  isPending?: boolean;
}

export function AvatarUploadModal({ open, onOpenChange, uploadFn, isPending }: Props) {
  const upload = useUploadAvatar();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(f.type)) {
      toast({ title: "Formato inválido", description: "Use JPG, PNG ou WEBP.", variant: "destructive" });
      return;
    }
    if (f.size > MAX_BYTES) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleSave() {
    if (!file) return;
    try {
      const blob = await compressImage(file);
      if (uploadFn) await uploadFn(blob);
      else await upload.mutateAsync(blob);
      toast({ title: "Foto atualizada", description: "Sua nova foto já está no ar." });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao enviar foto", description: e?.message ?? "Tente novamente", variant: "destructive" });
    }
  }

  function reset() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar foto de perfil</DialogTitle>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">{dragOver ? "Solte aqui" : "Arraste ou clique para selecionar"}</div>
          <div className="text-xs text-muted-foreground">JPG, PNG, WEBP — máx 5MB</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {previewUrl && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-muted-foreground">Prévia</div>
            <div className="h-32 w-32 overflow-hidden rounded-full ring-4 ring-slate-100">
              <img src={previewUrl} alt="Prévia" className="h-full w-full object-cover" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!file || (uploadFn ? !!isPending : upload.isPending)}>
            {(uploadFn ? !!isPending : upload.isPending) ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</> : "Salvar foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
