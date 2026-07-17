import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/auth/session";
import type { ApiError } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const useAuth = options.auth !== false;
  const token = options.token ?? (useAuth ? getAccessToken() : null);
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
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, token: refreshed });
    }
    clearAccessToken();
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

async function tryRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    if (!data.accessToken) return null;
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}
