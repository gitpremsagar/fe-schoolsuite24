import { ApiRequestError } from "@/lib/api/client";

export function isSubscriptionInactive(err: unknown): boolean {
  return (
    err instanceof ApiRequestError && err.code === "SUBSCRIPTION_INACTIVE"
  );
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
