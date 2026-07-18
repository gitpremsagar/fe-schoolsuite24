"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

type Row = Record<string, unknown>;
type DayPunch = { punchInAt: string; punchOutAt: string | null } | null;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

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

function fmtTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StaffAttendancePage() {
  const router = useRouter();
  const initial = currentYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [days, setDays] = useState<number[]>([]);
  const [staff, setStaff] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    setLoading(true);
    setError("");
    try {
      const res = await attendanceApi.staffMonth(year, month);
      setDays(res.days);
      setStaff(res.staff);
    } catch (err) {
      handleErr(err, "Failed to load staff monthly attendance");
    } finally {
      setLoading(false);
    }
  }, [year, month, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
          <Button type="button" variant="outline" onClick={() => shiftMonth(-1)}>
            Prev
          </Button>
          <Button type="button" variant="outline" onClick={() => shiftMonth(1)}>
            Next
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {monthLabel(year, month)} staff attendance register. Hover a cell for
        punch times.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading register...</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">No staff members yet.</p>
      ) : (
        <div className="overflow-auto rounded-xl border">
          <table className="min-w-max w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">
                  Code
                </th>
                <th className="sticky left-16 z-10 bg-muted px-3 py-2 text-left font-medium">
                  Staff
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    className="min-w-8 px-1 py-2 text-center font-medium"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const dayMap = (s.days ?? {}) as Record<string, DayPunch>;
                return (
                  <tr key={str(s.staffProfileId)} className="border-t">
                    <td className="sticky left-0 z-10 bg-background px-3 py-1">
                      {str(s.employeeCode)}
                    </td>
                    <td className="sticky left-16 z-10 bg-background px-3 py-1 font-medium whitespace-nowrap">
                      {str(s.name)}
                      <span className="ml-1 text-muted-foreground">
                        ({str(s.staffType)})
                      </span>
                    </td>
                    {days.map((day) => {
                      const punch = dayMap[String(day)] ?? null;
                      const title = punch
                        ? `In ${fmtTime(punch.punchInAt)}${
                            punch.punchOutAt
                              ? ` · Out ${fmtTime(punch.punchOutAt)}`
                              : " · No punch out"
                          }`
                        : "No punch";
                      return (
                        <td key={day} className="p-0.5 text-center">
                          <div
                            title={title}
                            className={cn(
                              "mx-auto flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold",
                              punch
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-muted/40 text-muted-foreground",
                            )}
                          >
                            {punch ? "P" : "·"}
                          </div>
                        </td>
                      );
                    })}
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
