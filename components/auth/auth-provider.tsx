"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  registerSchool,
} from "@/lib/api/auth";
import { onUnauthorized } from "@/lib/api/client";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  clearAuth,
  setCredentials,
  setLoading,
  setUnauthenticated,
  setUser,
} from "@/lib/store/auth-slice";
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
  const dispatch = useAppDispatch();
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  const status = useAppSelector((s) => s.auth.status);
  const loading = status === "idle" || status === "loading";

  const refreshUser = useCallback(async () => {
    const me = await getMe();
    dispatch(setUser(me.user as PublicUser));
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      dispatch(setLoading());
      try {
        // Cookie is the only durable credential; always try refresh.
        const refreshed = await refreshSession();
        if (cancelled) return;
        dispatch(
          setCredentials({
            accessToken: refreshed.accessToken,
            user: refreshed.user,
          }),
        );
      } catch {
        if (!cancelled) dispatch(setUnauthenticated());
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    return onUnauthorized(() => {
      dispatch(clearAuth());
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path === "/login" || path === "/register") return;
      }
      router.replace("/login");
    });
  }, [dispatch, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const data = await apiLogin(email, password);
        dispatch(
          setCredentials({
            accessToken: data.accessToken,
            user: data.user,
          }),
        );
        return data.user;
      },
      async register(body) {
        const data = await registerSchool(body);
        dispatch(
          setCredentials({
            accessToken: data.accessToken,
            user: data.user,
          }),
        );
        return data.user;
      },
      async logout() {
        await apiLogout();
        dispatch(clearAuth());
      },
      refreshUser,
    }),
    [user, loading, refreshUser, dispatch],
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
