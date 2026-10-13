import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getTokens, onTokens, setTokens } from "../api/client";
import type { User } from "../api/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (b: { email: string; password: string; fullName: string; phone?: string; role: "rider" | "driver" }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getTokens());

  useEffect(() => {
    if (!getTokens()) return;
    api.me().then((r) => setUser(r.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // token store emptied (logout elsewhere, revoked session, failed refresh) => back to the login screen
  useEffect(() => onTokens((t) => { if (!t) setUser(null); }), []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login({ email, password });
    setTokens(r.tokens); setUser(r.user);
  }, []);
  const register = useCallback(async (b: Parameters<typeof api.register>[0]) => {
    const r = await api.register(b);
    setTokens(r.tokens); setUser(r.user);
  }, []);
  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* token may already be dead */ }
    setTokens(null); setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
