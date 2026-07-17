import { apiFetch } from "@/lib/api/client";
import { setAccessToken, clearAccessToken } from "@/lib/auth/session";
import type { AuthResponse, PublicUser } from "@/lib/types";

export async function registerSchool(body: Record<string, string>) {
  const data = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body,
    auth: false,
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST", auth: false });
  } finally {
    clearAccessToken();
  }
}

export async function refreshSession() {
  const data = await apiFetch<AuthResponse>("/auth/refresh", {
    method: "POST",
    auth: false,
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function getMe() {
  return apiFetch<{ user: PublicUser & Record<string, unknown> }>("/auth/me");
}
