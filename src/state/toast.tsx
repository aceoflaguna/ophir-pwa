import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Kind = "ok" | "bad" | "info";
interface Toast { id: number; msg: string; kind: Kind }
const Ctx = createContext<{ push: (msg: string, kind?: Kind) => void }>({ push: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Kind = "info") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), kind === "bad" ? 5500 : 3200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="nr-toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`nr-toast nr-toast--${t.kind}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
