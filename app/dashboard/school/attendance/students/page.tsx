"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attendanceApi, schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";
import { cn } from "@/lib/utils";

type Status = "PRESENT" | "ABSENT";
type Row = Record<string, unknown>;

const ALL_CLASSES = "__all__";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** UTC Sunday check for YYYY-MM-DD (fallback if API omits holidays). */
function isSundayKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDay() === 0;
}

function cycleStatus(current: Status | null): Status | null {
  if (current == null) return "PRESENT";
  if (current === "PRESENT") return "ABSENT";
  return null;
}

function classLabel(s: Row): string {
  return formatClassLabel(
    str(s.classLevel || s.className),
    str(s.section) || null,
  );
}

export default function StudentAttendancePage() {
  return (
    <Suspense fallback={<LoadingPulseCard />}>
      <StudentAttendancePageContent />
    </Suspense>
  );
}

function StudentAttendancePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStudent = searchParams.get("student") ?? "";
  const initialQ = searchParams.get("q") ?? "";
  const initialClassId = searchParams.get("classId") ?? "";

  const initial = currentYearMonth();
  const [classes, setClasses] = useState<Row[]>([]);
  const [classId, setClassId] = useState(initialClassId || ALL_CLASSES);
  const [nameQuery, setNameQuery] = useState(initialQ);
  const [focusStudentId, setFocusStudentId] = useState(initialStudent);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [days, setDays] = useState<number[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(() => new Set());
  const [students, setStudents] = useState<Row[]>([]);
  /** marks[studentProfileId][day] */
  const [marks, setMarks] = useState<
    Record<string, Record<string, Status | null>>
  >({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showAllClasses = classId === ALL_CLASSES;

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
        if (
          initialClassId &&
          !res.classes.some((c) => str(c.id) === initialClassId)
        ) {
          setClassId(ALL_CLASSES);
        }
      } catch (err) {
        handleErr(err, "Failed to load classes");
      }
    })();
  }, [handleErr, initialClassId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await attendanceApi.classMonth(
        showAllClasses ? null : classId,
        year,
        month,
      );
      setDays(res.days);
      setHolidaySet(new Set(res.holidays ?? []));
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
  }, [classId, showAllClasses, year, month, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const studentClassById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      map.set(str(s.studentProfileId), str(s.classId));
    }
    return map;
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (focusStudentId) {
      return students.filter(
        (s) => str(s.studentProfileId) === focusStudentId,
      );
    }
    const q = nameQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => str(s.name).toLowerCase().includes(q));
  }, [students, nameQuery, focusStudentId]);

  function isHolidayDay(day: number) {
    const key = dateKey(year, month, day);
    return holidaySet.has(key) || isSundayKey(key);
  }

  function toggleCell(studentId: string, day: number) {
    if (isHolidayDay(day)) return;
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
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const records: Array<{
        studentProfileId: string;
        date: string;
        status: Status;
        classId: string;
      }> = [];
      for (const [studentId, dayMap] of Object.entries(marks)) {
        const studentClassId = showAllClasses
          ? studentClassById.get(studentId)
          : classId;
        if (!studentClassId || studentClassId === ALL_CLASSES) continue;
        for (const [day, status] of Object.entries(dayMap)) {
          if (status !== "PRESENT" && status !== "ABSENT") continue;
          const dayNum = Number(day);
          if (isHolidayDay(dayNum)) continue;
          records.push({
            studentProfileId: studentId,
            date: dateKey(year, month, dayNum),
            status,
            classId: studentClassId,
          });
        }
      }
      if (records.length === 0) {
        setError("Mark at least one attendance cell before saving.");
        setSaving(false);
        return;
      }
      await attendanceApi.saveStudentMonth({ records });
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
          <Select
            value={classId}
            onValueChange={(v) => {
              setFocusStudentId("");
              setClassId(v);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={str(c.id)} value={str(c.id)}>
                  {formatClassLabel(
                    str(c.classLevel) || str(c.name),
                    str(c.section) || null,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[14rem] flex-1 space-y-1 sm:max-w-xs">
          <Label htmlFor="attendance-student-search">Search student</Label>
          <Input
            id="attendance-student-search"
            value={nameQuery}
            onChange={(e) => {
              setFocusStudentId("");
              setNameQuery(e.target.value);
            }}
            placeholder="Search by name..."
          />
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
        <Button type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save register"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {loading ? (
        <LoadingPulseCard />
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showAllClasses
            ? "No enrolled students found."
            : "No enrolled students in this class."}
        </p>
      ) : filteredStudents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No students match the current search.
        </p>
      ) : (
        <div className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-xl border">
          <table className="min-w-max w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted">
                {showAllClasses ? (
                  <th className="sticky left-0 top-0 z-30 border-b bg-muted px-3 py-2 text-left font-medium">
                    Class
                  </th>
                ) : null}
                <th
                  className={cn(
                    "sticky top-0 z-30 border-b bg-muted px-3 py-2 text-left font-medium",
                    showAllClasses ? "left-28" : "left-0",
                  )}
                >
                  Student
                </th>
                {days.map((day) => {
                  const holiday = isHolidayDay(day);
                  return (
                    <th
                      key={day}
                      title={holiday ? "Holiday" : undefined}
                      className={cn(
                        "sticky top-0 z-20 min-w-8 border-b px-1 py-2 text-center font-medium",
                        holiday
                          ? "bg-amber-100 text-amber-900"
                          : "bg-muted",
                      )}
                    >
                      {day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s) => {
                const id = str(s.studentProfileId);
                return (
                  <tr key={id} className="group border-t hover:bg-muted">
                    {showAllClasses ? (
                      <td className="sticky left-0 z-10 bg-card px-3 py-1 whitespace-nowrap group-hover:bg-muted">
                        {classLabel(s)}
                      </td>
                    ) : null}
                    <td
                      className={cn(
                        "sticky z-10 bg-card px-3 py-1 font-medium whitespace-nowrap group-hover:bg-muted",
                        showAllClasses ? "left-28" : "left-0",
                      )}
                    >
                      {str(s.name)}
                    </td>
                    {days.map((day) => {
                      const status = marks[id]?.[String(day)] ?? null;
                      const holiday = isHolidayDay(day);
                      return (
                        <td
                          key={day}
                          className={cn(
                            "p-0.5 text-center",
                            holiday && "bg-amber-50 group-hover:bg-amber-100",
                          )}
                        >
                          <button
                            type="button"
                            disabled={holiday}
                            title={
                              holiday
                                ? "Holiday"
                                : status === "PRESENT"
                                  ? "Present"
                                  : status === "ABSENT"
                                    ? "Absent"
                                    : "Click to change"
                            }
                            onClick={() => toggleCell(id, day)}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold",
                              holiday &&
                                "cursor-not-allowed bg-amber-100/80 text-amber-800/70",
                              !holiday &&
                                status === "PRESENT" &&
                                "bg-emerald-100 text-emerald-800",
                              !holiday &&
                                status === "ABSENT" &&
                                "bg-red-100 text-red-800",
                              !holiday &&
                                status == null &&
                                "bg-muted/40 text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {holiday
                              ? "H"
                              : status === "PRESENT"
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
