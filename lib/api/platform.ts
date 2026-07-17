import { apiFetch } from "@/lib/api/client";

export const platformApi = {
  overview: () => apiFetch<Record<string, number>>("/platform/overview"),
  schools: (q?: string, status?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    return apiFetch<{ schools: Array<Record<string, unknown>> }>(
      `/platform/schools${qs ? `?${qs}` : ""}`,
    );
  },
  school: (id: string) =>
    apiFetch<{
      school: Record<string, unknown>;
      activeEnrollments: number;
      dueAmount: number;
    }>(`/platform/schools/${id}`),
  plans: () => apiFetch<{ plans: Array<Record<string, unknown>> }>("/platform/plans"),
  createPlan: (body: Record<string, unknown>) =>
    apiFetch("/platform/plans", { method: "POST", body }),
  updatePlan: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/platform/plans/${id}`, { method: "PATCH", body }),
  updateSubscription: (schoolId: string, body: Record<string, unknown>) =>
    apiFetch(`/platform/schools/${schoolId}/subscription`, {
      method: "PATCH",
      body,
    }),
  recordPayment: (schoolId: string, body: Record<string, unknown>) =>
    apiFetch(`/platform/schools/${schoolId}/payments`, {
      method: "POST",
      body,
    }),
  payments: (schoolId?: string) => {
    const qs = schoolId ? `?schoolId=${schoolId}` : "";
    return apiFetch<{ payments: Array<Record<string, unknown>> }>(
      `/platform/payments${qs}`,
    );
  },
};
