import { apiFetch } from "@/lib/api/client";

export const schoolApi = {
  me: () => apiFetch<{ school: Record<string, unknown> }>("/schools/me"),
  updateMe: (body: Record<string, unknown>) =>
    apiFetch("/schools/me", { method: "PATCH", body }),
  dashboard: () =>
    apiFetch<Record<string, unknown>>("/schools/dashboard"),
  academicYears: {
    list: () =>
      apiFetch<{ academicYears: Array<Record<string, unknown>> }>(
        "/academic-years",
      ),
    create: (body: Record<string, unknown>) =>
      apiFetch("/academic-years", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/academic-years/${id}`, { method: "PATCH", body }),
  },
  classes: {
    list: (academicYearId?: string) => {
      const qs = academicYearId ? `?academicYearId=${academicYearId}` : "";
      return apiFetch<{ classes: Array<Record<string, unknown>> }>(
        `/classes${qs}`,
      );
    },
    mine: () =>
      apiFetch<{ classes: Array<Record<string, unknown>> }>("/classes/mine"),
    create: (body: Record<string, unknown>) =>
      apiFetch("/classes", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/classes/${id}`, { method: "PATCH", body }),
    assignTeacher: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/classes/${id}/teachers`, { method: "POST", body }),
  },
  students: {
    list: (opts?: { academicYearId?: string; all?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.all) params.set("all", "1");
      else if (opts?.academicYearId) {
        params.set("academicYearId", opts.academicYearId);
      }
      const qs = params.toString();
      return apiFetch<{
        students: Array<Record<string, unknown>>;
        academicYearId: string | null;
      }>(`/students${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) =>
      apiFetch<{ student: Record<string, unknown> }>(`/students/${id}`),
    create: (body: Record<string, unknown>) =>
      apiFetch("/students", { method: "POST", body }),
    bulkCreate: (
      students: Array<Record<string, unknown>>,
      opts?: { rowOffset?: number },
    ) =>
      apiFetch<{
        created: number;
        failed: Array<{ row: number; email?: string; error: string }>;
      }>("/students/bulk", {
        method: "POST",
        body: {
          students,
          ...(opts?.rowOffset !== undefined
            ? { rowOffset: opts.rowOffset }
            : {}),
        },
      }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/students/${id}`, { method: "PATCH", body }),
    enroll: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/students/${id}/enrollments`, { method: "POST", body }),
    purge: (id: string, password: string) =>
      apiFetch(`/students/${id}/purge`, {
        method: "POST",
        body: { password },
      }),
    me: () => apiFetch<{ student: Record<string, unknown> }>("/students/me"),
  },
  staff: {
    list: (staffType?: string) => {
      const qs = staffType ? `?staffType=${staffType}` : "";
      return apiFetch<{ staff: Array<Record<string, unknown>> }>(`/staff${qs}`);
    },
    get: (id: string) =>
      apiFetch<{ staff: Record<string, unknown> }>(`/staff/${id}`),
    create: (body: Record<string, unknown>) =>
      apiFetch("/staff", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/staff/${id}`, { method: "PATCH", body }),
    remove: (id: string) =>
      apiFetch(`/staff/${id}`, { method: "DELETE" }),
    purge: (id: string, password: string) =>
      apiFetch(`/staff/${id}/purge`, {
        method: "POST",
        body: { password },
      }),
    me: () => apiFetch<{ staff: Record<string, unknown> }>("/staff/me"),
  },
  billing: {
    summary: () => apiFetch<Record<string, unknown>>("/billing/summary"),
  },
  fees: {
    register: (academicYearId?: string) => {
      const qs = academicYearId
        ? `?academicYearId=${encodeURIComponent(academicYearId)}`
        : "";
      return apiFetch<{
        academicYear: Record<string, unknown>;
        months: Array<{
          year: number;
          month: number;
          key: string;
          label: string;
        }>;
        students: Array<Record<string, unknown>>;
      }>(`/fees/register${qs}`);
    },
    upsertPayment: (body: Record<string, unknown>) =>
      apiFetch("/fees/payments", { method: "PUT", body }),
  },
  eventFees: {
    list: (opts?: { academicYearId?: string; includeInactive?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.academicYearId) {
        params.set("academicYearId", opts.academicYearId);
      }
      if (opts?.includeInactive) params.set("includeInactive", "1");
      const qs = params.toString();
      return apiFetch<{
        academicYear: Record<string, unknown>;
        eventFees: Array<Record<string, unknown>>;
      }>(`/event-fees${qs ? `?${qs}` : ""}`);
    },
    create: (body: Record<string, unknown>) =>
      apiFetch<{ eventFee: Record<string, unknown> }>("/event-fees", {
        method: "POST",
        body,
      }),
    get: (id: string) =>
      apiFetch<{ eventFee: Record<string, unknown> }>(`/event-fees/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ eventFee: Record<string, unknown> }>(`/event-fees/${id}`, {
        method: "PATCH",
        body,
      }),
    deactivate: (id: string) =>
      apiFetch<{ eventFee: Record<string, unknown> }>(`/event-fees/${id}`, {
        method: "DELETE",
      }),
    register: (id: string) =>
      apiFetch<{
        event: Record<string, unknown>;
        students: Array<Record<string, unknown>>;
      }>(`/event-fees/${id}/register`),
    upsertPayment: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ payment: Record<string, unknown> }>(
        `/event-fees/${id}/payments`,
        { method: "PUT", body },
      ),
  },
  holidays: {
    list: (year: number, month: number) =>
      apiFetch<{
        year: number;
        month: number;
        holidays: Array<{
          id: string;
          date: string;
          name: string | null;
          notes: string | null;
          createdBy: { id: string; name: string; email: string } | null;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/holidays?year=${year}&month=${month}`),
    create: (body: { date: string; name?: string | null; notes?: string | null }) =>
      apiFetch<{ holiday: Record<string, unknown> }>("/holidays", {
        method: "POST",
        body,
      }),
    remove: (id: string) =>
      apiFetch(`/holidays/${id}`, { method: "DELETE" }),
  },
};

export const attendanceApi = {
  classAttendance: (classId: string, date: string) =>
    apiFetch<Record<string, unknown>>(
      `/attendance/students?classId=${classId}&date=${encodeURIComponent(date)}`,
    ),
  classMonth: (classId: string | null | undefined, year: number, month: number) => {
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
    });
    if (classId) params.set("classId", classId);
    return apiFetch<{
      year: number;
      month: number;
      daysInMonth: number;
      days: number[];
      holidays: string[];
      classId: string | null;
      students: Array<Record<string, unknown>>;
    }>(`/attendance/students/month?${params.toString()}`);
  },
  saveStudentAttendance: (body: Record<string, unknown>) =>
    apiFetch("/attendance/students", { method: "POST", body }),
  saveStudentMonth: (body: Record<string, unknown>) =>
    apiFetch("/attendance/students/month", { method: "POST", body }),
  myStudentAttendance: () =>
    apiFetch<{ records: Array<Record<string, unknown>> }>(
      "/attendance/students/me",
    ),
  staffToday: () =>
    apiFetch<{ attendance: Record<string, unknown> | null }>(
      "/attendance/staff/today",
    ),
  punchIn: () => apiFetch("/attendance/staff/punch-in", { method: "POST" }),
  punchOut: () => apiFetch("/attendance/staff/punch-out", { method: "POST" }),
  listStaff: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return apiFetch<{ records: Array<Record<string, unknown>> }>(
      `/attendance/staff${qs ? `?${qs}` : ""}`,
    );
  },
  staffMonth: (year: number, month: number) =>
    apiFetch<{
      year: number;
      month: number;
      daysInMonth: number;
      days: number[];
      holidays: string[];
      staff: Array<Record<string, unknown>>;
    }>(`/attendance/staff/month?year=${year}&month=${month}`),
  saveStaffDay: (body: {
    staffProfileId: string;
    date: string;
    status: "PRESENT" | "ABSENT" | null;
    punchInAt?: string | null;
    punchOutAt?: string | null;
  }) =>
    apiFetch<{
      attendance?: Record<string, unknown>;
      deleted?: boolean;
      staffProfileId?: string;
      date?: string;
    }>("/attendance/staff/day", { method: "POST", body }),
};
