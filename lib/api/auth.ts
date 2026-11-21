import { apiFetch, refreshAccessToken, ApiRequestError } from "@/lib/api/client";
import {
  setAccessToken,
  setUser,
  clearAccessToken,
} from "@/lib/auth/session";
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

export async function refreshSession(): Promise<AuthResponse> {
  const data = await refreshAccessToken();
  if (!data) {
    throw new ApiRequestError(401, "Refresh token missing or invalid");
  }
  return data;
}

export async function getMe() {
  return apiFetch<{ user: PublicUser & Record<string, unknown> }>("/auth/me");
}

/** Email a password reset link. The API answers the same for unknown emails. */
export async function forgotPassword(email: string) {
  return apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

/** Set a new password using a reset link token. The token is single use. */
export async function resetPassword(token: string, password: string) {
  return apiFetch<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

/**
 * Change the account's login email.
 * The server re-issues tokens for the new identity; store them and sync the user.
 */
export async function changeEmail(email: string, password: string) {
  const data = await apiFetch<AuthResponse>("/auth/me/email", {
    method: "PATCH",
    body: { email, password },
  });
  setAccessToken(data.accessToken);
  if (data.user) {
    setUser(data.user);
  }
  return data;
}

/**
 * Change the password after verifying the current one.
 * Other devices are signed out; this device receives fresh tokens.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const data = await apiFetch<AuthResponse>("/auth/me/password", {
    method: "PATCH",
    body: { currentPassword, newPassword },
  });
  setAccessToken(data.accessToken);
  if (data.user) {
    setUser(data.user);
  }
  return data;
}
