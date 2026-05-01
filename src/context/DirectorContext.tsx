import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type DirectorNote = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
};

type Ctx = {
  notes: DirectorNote[];
  push: (title: string, body: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const DirectorContext = createContext<Ctx | null>(null);

export function DirectorProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<DirectorNote[]>([]);

  const push = useCallback((title: string, body: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotes((list) => [{ id, title, body, createdAt: Date.now() }, ...list].slice(0, 8));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotes((list) => list.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotes([]), []);

  const value = useMemo(() => ({ notes, push, dismiss, clear }), [notes, push, dismiss, clear]);

  return <DirectorContext.Provider value={value}>{children}</DirectorContext.Provider>;
}

export function useDirector() {
  const ctx = useContext(DirectorContext);
  if (!ctx) throw new Error('useDirector must be used inside DirectorProvider');
  return ctx;
}
