import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type HeaderData = { title: string; subtitle?: string; actions?: ReactNode } | null;

type Ctx = {
  header: HeaderData;
  setHeader: (h: HeaderData) => void;
};

const PageHeaderContext = createContext<Ctx | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<HeaderData>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  const ctx = useContext(PageHeaderContext);
  return ctx;
}

export function useRegisterPageHeader(data: { title: string; subtitle?: string; actions?: ReactNode }) {
  const ctx = useContext(PageHeaderContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setHeader(data);
    return () => ctx.setHeader(null);
  }, [ctx, data.title, data.subtitle, data.actions]);
}
