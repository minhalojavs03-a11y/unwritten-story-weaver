import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LOGIN_GATE_CODE, LOGIN_GATE_MESSAGE, LOGIN_GATE_TITLE } from "@/lib/loginGate";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LoginGateDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">{LOGIN_GATE_TITLE}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-left text-sm leading-relaxed">
            {LOGIN_GATE_MESSAGE}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
          {LOGIN_GATE_CODE} · billing_quota_exceeded
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
