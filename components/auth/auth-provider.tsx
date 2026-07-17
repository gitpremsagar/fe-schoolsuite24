"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getMe, login as apiLogin, logout as apiLogout, refreshSession, registerSchool } from "@/lib/api/auth";
import { clearAccessToken, getAccessToken } from "@/lib/auth/session";
import type { PublicUser } from "@/lib/types";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (body: Record<string, string>) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const me = await getMe();
    setUser(me.user as PublicUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const token = getAccessToken();
        if (!token) {
          try {
            const refreshed = await refreshSession();
            if (!cancelled) setUser(refreshed.user);
          } catch {
            if (!cancelled) setUser(null);
          }
        } else {
          await refreshUser();
        }
      } catch {
        clearAccessToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const data = await apiLogin(email, password);
        setUser(data.user);
        return data.user;
      },
      async register(body) {
        const data = await registerSchool(body);
        setUser(data.user);
        return data.user;
      },
      async logout() {
        await apiLogout();
        setUser(null);
      },
      refreshUser,
    }),
    [user, loading, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
