import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/auth/session";
import type { ApiError, AuthResponse } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const REFRESH_TIMEOUT_MS = 8000;

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Subscribe to auth failures (refresh failed / hard 401). Returns unsubscribe. */
export function onUnauthorized(cb: UnauthorizedListener): () => void {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

function emitUnauthorized() {
  for (const cb of unauthorizedListeners) {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  }
}

/** Shared in-flight refresh so concurrent callers share one /auth/refresh. */
let refreshPromise: Promise<AuthResponse | null> | null = null;

/**
 * Single-flight cookie refresh. Returns the full auth response or null on failure.
 * Does not emit unauthorized — callers decide how to handle failure.
 */
export async function refreshAccessToken(): Promise<AuthResponse | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      });
      if (!res.ok) {
        clearAccessToken();
        return null;
      }
      const data = (await res.json()) as AuthResponse;
      if (!data.accessToken) {
        clearAccessToken();
        return null;
      }
      setAccessToken(data.accessToken);
      return data;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Returns the in-memory access token, or attempts a single-flight cookie refresh.
 * Returns null when refresh fails (no cookie / network / timeout).
 */
export async function ensureAccessToken(): Promise<string | null> {
  const existing = getAccessToken();
  if (existing) return existing;
  const refreshed = await refreshAccessToken();
  return refreshed?.accessToken ?? null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const useAuth = options.auth !== false;
  let token = options.token ?? (useAuth ? getAccessToken() : null);

  if (useAuth && !token && options.token === undefined) {
    token = await ensureAccessToken();
    if (!token) {
      emitUnauthorized();
      throw new ApiRequestError(401, "Unauthorized");
    }
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401 && useAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.accessToken) {
      return apiFetch<T>(path, { ...options, token: refreshed.accessToken });
    }
    clearAccessToken();
    emitUnauthorized();
  }

  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      data.error || "Request failed",
      data.code,
    );
  }
  return data;
}
