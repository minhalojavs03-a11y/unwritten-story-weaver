import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const VIMEO_ID = "1194521363";
const TUTORIAL_VERSION = "v2";
const storageKey = (uid: string) => `feracon.tutorialWatched.${TUTORIAL_VERSION}.${uid}`;

export function TutorialVideoDialog() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user?.id) return;
    try {
      if (!localStorage.getItem(storageKey(user.id))) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, [user?.id, loading]);

  function handleClose() {
    try {
      if (user?.id) localStorage.setItem(storageKey(user.id), "1");
    } catch {}
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : setOpen(o))}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Tutorial de boas-vindas</DialogTitle>
          <DialogDescription>
            Assista a este vídeo rápido para conhecer o sistema. Você pode fechar quando quiser.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 pt-4">
          <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ paddingTop: "56.25%" }}>
            <iframe
              src={`https://player.vimeo.com/video/${VIMEO_ID}?autoplay=1&title=0&byline=0&portrait=0`}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
              title="Tutorial"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleClose}>Fechar (já assisti)</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
