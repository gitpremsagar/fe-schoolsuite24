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
import { attendanceApi, schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { cn } from "@/lib/utils";

type Status = "PRESENT" | "ABSENT";
type Row = Record<string, unknown>;

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

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cycleStatus(current: Status | null): Status | null {
  if (current == null) return "PRESENT";
  if (current === "PRESENT") return "ABSENT";
  return null;
}

export default function StudentAttendancePage() {
  const router = useRouter();
  const initial = currentYearMonth();
  const [classes, setClasses] = useState<Row[]>([]);
  const [classId, setClassId] = useState("");
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [days, setDays] = useState<number[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  /** marks[studentProfileId][day] */
  const [marks, setMarks] = useState<Record<string, Record<string, Status | null>>>(
    {},
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await schoolApi.classes.list();
        setClasses(res.classes);
      } catch (err) {
        handleErr(err, "Failed to load classes");
      }
    })();
  }, [handleErr]);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await attendanceApi.classMonth(classId, year, month);
      setDays(res.days);
      setStudents(res.students);
      const next: Record<string, Record<string, Status | null>> = {};
      for (const s of res.students) {
        const id = str(s.studentProfileId);
        const dayMap = (s.days ?? {}) as Record<string, Status | null>;
        next[id] = { ...dayMap };
      }
      setMarks(next);
      setDirty(false);
    } catch (err) {
      handleErr(err, "Failed to load monthly attendance");
    } finally {
      setLoading(false);
    }
  }, [classId, year, month, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  function toggleCell(studentId: string, day: number) {
    setMarks((prev) => {
      const row = { ...(prev[studentId] ?? {}) };
      const key = String(day);
      row[key] = cycleStatus(row[key] ?? null);
      return { ...prev, [studentId]: row };
    });
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!classId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const records: Array<{
        studentProfileId: string;
        date: string;
        status: Status;
      }> = [];
      for (const [studentId, dayMap] of Object.entries(marks)) {
        for (const [day, status] of Object.entries(dayMap)) {
          if (status === "PRESENT" || status === "ABSENT") {
            records.push({
              studentProfileId: studentId,
              date: dateKey(year, month, Number(day)),
              status,
            });
          }
        }
      }
      if (records.length === 0) {
        setError("Mark at least one attendance cell before saving.");
        setSaving(false);
        return;
      }
      await attendanceApi.saveStudentMonth({ classId, records });
      setMessage("Monthly attendance saved.");
      setDirty(false);
      await load();
    } catch (err) {
      handleErr(err, "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={str(c.id)} value={str(c.id)}>
                  {str(c.name)}
                  {c.section ? ` - ${str(c.section)}` : ""}
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
          <Button type="button" variant="outline" onClick={() => shiftMonth(-1)}>
            Prev
          </Button>
          <Button type="button" variant="outline" onClick={() => shiftMonth(1)}>
            Next
          </Button>
        </div>
        <Button type="button" onClick={save} disabled={!classId || saving || !dirty}>
          {saving ? "Saving..." : "Save register"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {monthLabel(year, month)} · Click a cell to cycle Present → Absent →
        blank, then save.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {!classId ? (
        <p className="text-sm text-muted-foreground">
          Select a class to open the monthly register.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading register...</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No enrolled students in this class.
        </p>
      ) : (
        <div className="overflow-auto rounded-xl border">
          <table className="min-w-max w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">
                  Roll
                </th>
                <th className="sticky left-14 z-10 bg-muted px-3 py-2 text-left font-medium">
                  Student
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
              {students.map((s) => {
                const id = str(s.studentProfileId);
                return (
                  <tr key={id} className="border-t">
                    <td className="sticky left-0 z-10 bg-background px-3 py-1">
                      {str(s.rollNumber) || "—"}
                    </td>
                    <td className="sticky left-14 z-10 bg-background px-3 py-1 font-medium whitespace-nowrap">
                      {str(s.name)}
                    </td>
                    {days.map((day) => {
                      const status = marks[id]?.[String(day)] ?? null;
                      return (
                        <td key={day} className="p-0.5 text-center">
                          <button
                            type="button"
                            title="Click to change"
                            onClick={() => toggleCell(id, day)}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold",
                              status === "PRESENT" &&
                                "bg-emerald-100 text-emerald-800",
                              status === "ABSENT" &&
                                "bg-red-100 text-red-800",
                              status == null &&
                                "bg-muted/40 text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {status === "PRESENT"
                              ? "P"
                              : status === "ABSENT"
                                ? "A"
                                : "·"}
                          </button>
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
