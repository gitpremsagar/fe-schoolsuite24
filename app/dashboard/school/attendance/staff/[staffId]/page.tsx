"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attendanceApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { cn } from "@/lib/utils";

type Detail = Awaited<ReturnType<typeof attendanceApi.staffDetail>>;
type DayRow = Detail["days"][number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function fmtTime(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Minutes since local midnight for an ISO timestamp, or null. */
function minutesOfDay(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Parse "HH:mm" into minutes since midnight; null when malformed. */
function parseHHmm(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmtDuration(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "";
  const totalMinutes = Math.round((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isToday(date: string): boolean {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return date === key;
}

function rowFlags(
  row: DayRow,
  workStart: number | null,
  workEnd: number | null,
) {
  const inMinutes = minutesOfDay(row.punchInAt);
  const outMinutes = minutesOfDay(row.punchOutAt);
  const late =
    inMinutes != null && workStart != null && inMinutes > workStart;
  const earlyOut =
    outMinutes != null && workEnd != null && outMinutes < workEnd;
  return { late, earlyOut };
}

export default function StaffAttendanceDetailPage() {
  return (
    <Suspense fallback={<LoadingPulseCard />}>
      <StaffAttendanceDetailContent />
    </Suspense>
  );
}

function StaffAttendanceDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ staffId: string }>();
  const staffId = Array.isArray(params.staffId)
    ? params.staffId[0]
    : params.staffId;

  const initial = currentYearMonth();
  const queryYear = Number(searchParams.get("year"));
  const queryMonth = Number(searchParams.get("month"));
  const [year, setYear] = useState(
    Number.isInteger(queryYear) && queryYear >= 2000 && queryYear <= 2100
      ? queryYear
      : initial.year,
  );
  const [month, setMonth] = useState(
    Number.isInteger(queryMonth) && queryMonth >= 1 && queryMonth <= 12
      ? queryMonth
      : initial.month,
  );
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleErr = useCallback(
    (err: unknown, fallback: string) => {
      if (isSubscriptionInactive(err)) {
        router.replace("/access-blocked");
        return;
      }
      setError(errorMessage(err, fallback));
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    setError("");
    try {
      const res = await attendanceApi.staffDetail(staffId, year, month);
      setData(res);
    } catch (err) {
      handleErr(err, "Failed to load staff attendance");
    } finally {
      setLoading(false);
    }
  }, [staffId, year, month, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const workStart = parseHHmm(data?.workStartTime);
  const workEnd = parseHHmm(data?.workEndTime);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let earlyOut = 0;
    let missingOut = 0;
    if (!data) {
      return { present, absent, late, earlyOut, missingOut };
    }
    const today = new Date();
    for (const row of data.days) {
      const { late: isLate, earlyOut: isEarly } = rowFlags(
        row,
        workStart,
        workEnd,
      );
      if (row.status === "PRESENT") present += 1;
      if (row.status === "ABSENT") absent += 1;
      if (isLate) late += 1;
      if (isEarly) earlyOut += 1;
      const dayDate = new Date(`${row.date}T00:00:00Z`);
      if (
        row.status === "PRESENT" &&
        row.punchInAt &&
        !row.punchOutAt &&
        !row.isHoliday &&
        dayDate.getTime() <
          Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
      ) {
        missingOut += 1;
      }
    }
    return { present, absent, late, earlyOut, missingOut };
  }, [data, workStart, workEnd]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  function switchStaff(nextStaffId: string) {
    if (!nextStaffId || nextStaffId === staffId) return;
    router.replace(
      `/dashboard/school/attendance/staff/${nextStaffId}?year=${year}&month=${month}`,
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/school/attendance/staff">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Staff register
          </Link>
        </Button>
      </div>

      {data ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{data.staff.name}</h1>
            <p className="text-sm text-muted-foreground">
              {data.staff.employeeCode ? `${data.staff.employeeCode} · ` : ""}
              {data.staff.staffType}
              {data.staff.email ? ` · ${data.staff.email}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Staff</Label>
              <Select value={staffId ?? ""} onValueChange={switchStaff}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {data.staffOptions.map((option) => (
                    <SelectItem
                      key={option.staffProfileId}
                      value={option.staffProfileId}
                    >
                      {option.name}
                      {option.employeeCode ? ` · ${option.employeeCode}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Month</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Date(2000, m - 1, 1).toLocaleString("en-IN", {
                        month: "long",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => shiftMonth(-1)}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => shiftMonth(1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <p className="text-sm text-muted-foreground">
          {monthLabel(data.year, data.month)} · Work window{" "}
          {data.workStartTime}–{data.workEndTime}. Punch-in after{" "}
          {data.workStartTime} or punch-out before {data.workEndTime} is shown
          in red.
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {data && !loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard label="Present" value={summary.present} />
          <SummaryCard label="Absent" value={summary.absent} />
          <SummaryCard
            label="Late punch-in"
            value={summary.late}
            tone={summary.late > 0 ? "bad" : undefined}
          />
          <SummaryCard
            label="Early punch-out"
            value={summary.earlyOut}
            tone={summary.earlyOut > 0 ? "bad" : undefined}
          />
          <SummaryCard
            label="Missing punch-out"
            value={summary.missingOut}
            tone={summary.missingOut > 0 ? "warn" : undefined}
          />
        </div>
      ) : null}

      {loading ? (
        <LoadingPulseCard />
      ) : !data ? null : (
        <div className="overflow-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Day</th>
                <th className="px-3 py-2 text-left font-medium">Punch in</th>
                <th className="px-3 py-2 text-left font-medium">Punch out</th>
                <th className="px-3 py-2 text-left font-medium">Worked</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((row) => {
                const { late, earlyOut } = rowFlags(row, workStart, workEnd);
                const holiday = row.isHoliday;
                const today = isToday(row.date);
                return (
                  <tr
                    key={row.date}
                    className={cn(
                      "border-t",
                      holiday && "bg-amber-50/60",
                      today && "outline outline-1 -outline-offset-1 outline-primary/40",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {dateLabel(row.date)}
                      {today ? (
                        <span className="ml-1 text-xs font-medium text-primary">
                          Today
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {WEEKDAYS[row.weekday]}
                    </td>
                    <td className="px-3 py-2">
                      {row.punchInAt ? (
                        <span
                          className={cn(
                            late && "font-semibold text-red-600",
                          )}
                        >
                          {fmtTime(row.punchInAt)}
                          {late ? (
                            <span className="ml-1 text-xs font-medium">
                              Late
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.punchOutAt ? (
                        <span
                          className={cn(
                            earlyOut && "font-semibold text-red-600",
                          )}
                        >
                          {fmtTime(row.punchOutAt)}
                          {earlyOut ? (
                            <span className="ml-1 text-xs font-medium">
                              Early
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {fmtDuration(row.punchInAt, row.punchOutAt) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {holiday ? (
                        <span className="text-xs text-amber-800">Holiday</span>
                      ) : row.status === "ABSENT" ? (
                        <Badge variant="destructive">Absent</Badge>
                      ) : row.status === "PRESENT" ? (
                        <Badge variant="secondary">Present</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not marked
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold",
          tone === "bad" && "text-red-600",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}
