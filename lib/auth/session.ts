import { getStore } from "@/lib/store";
import { clearAuth, setAccessToken as setToken } from "@/lib/store/auth-slice";

const LEGACY_ACCESS_TOKEN_KEY = "school_erp_access_token";

/** One-time purge of the old localStorage token (access token is in-memory only now). */
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return getStore().getState().auth.accessToken;
}

export function setAccessToken(token: string) {
  getStore().dispatch(setToken(token));
}

export function clearAccessToken() {
  getStore().dispatch(clearAuth());
}
