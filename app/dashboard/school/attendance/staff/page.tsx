"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { attendanceApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { cn } from "@/lib/utils";

type Status = "PRESENT" | "ABSENT";
type Row = Record<string, unknown>;
type DayMark = {
  status: Status;
  punchInAt: string | null;
  punchOutAt: string | null;
} | null;
type CellEditor = {
  staffId: string;
  staffName: string;
  day: number;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
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

function isSundayKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDay() === 0;
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

function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function nowTimeInput() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function localDateTimeIso(
  year: number,
  month: number,
  day: number,
  hhmm: string,
): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, 0, 0).toISOString();
}

function attendanceIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function StaffAttendancePage() {
  const router = useRouter();
  const initial = currentYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [days, setDays] = useState<number[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(() => new Set());
  const [staff, setStaff] = useState<Row[]>([]);
  /** marks[staffProfileId][day] */
  const [marks, setMarks] = useState<
    Record<string, Record<string, Status | null>>
  >({});
  const [punches, setPunches] = useState<
    Record<
      string,
      Record<string, { punchInAt: string | null; punchOutAt: string | null }>
    >
  >({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [editor, setEditor] = useState<CellEditor | null>(null);
  const [editPunchIn, setEditPunchIn] = useState(() => nowTimeInput());
  const [editPunchOut, setEditPunchOut] = useState(() => nowTimeInput());
  const [editError, setEditError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  const editorKey = editor ? String(editor.day) : "";
  const editorPunch = editor
    ? punches[editor.staffId]?.[editorKey]
    : undefined;
  const editorStatus = editor
    ? (marks[editor.staffId]?.[editorKey] ?? null)
    : null;
  const editorHasPunchIn = Boolean(editorPunch?.punchInAt);
  const editorHasPunchOut = Boolean(editorPunch?.punchOutAt);
  const editorIsAbsent = editorStatus === "ABSENT";
  const editorHasAnyMark = Boolean(
    editor && (editorStatus != null || editorHasPunchIn),
  );

  const handleErr = useCallback(
    (err: unknown, fallback: string) => {
      if (isSubscriptionInactive(err)) {
        router.replace("/access-blocked");
        return;
      }
      return errorMessage(err, fallback);
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await attendanceApi.staffMonth(year, month);
      setDays(res.days);
      setHolidaySet(new Set(res.holidays ?? []));
      setStaff(res.staff);
      const nextMarks: Record<string, Record<string, Status | null>> = {};
      const nextPunches: Record<
        string,
        Record<string, { punchInAt: string | null; punchOutAt: string | null }>
      > = {};
      for (const s of res.staff) {
        const id = str(s.staffProfileId);
        const dayMap = (s.days ?? {}) as Record<string, DayMark>;
        nextMarks[id] = {};
        nextPunches[id] = {};
        for (const [day, mark] of Object.entries(dayMap)) {
          nextMarks[id][day] = mark?.status ?? null;
          nextPunches[id][day] = {
            punchInAt: mark?.punchInAt ?? null,
            punchOutAt: mark?.punchOutAt ?? null,
          };
        }
      }
      setMarks(nextMarks);
      setPunches(nextPunches);
    } catch (err) {
      setError(handleErr(err, "Failed to load staff monthly attendance") ?? "");
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

  function isHolidayDay(day: number) {
    const key = dateKey(year, month, day);
    return holidaySet.has(key) || isSundayKey(key);
  }

  function openCell(staffId: string, staffName: string, day: number) {
    if (actionSaving || isHolidayDay(day)) return;
    const key = String(day);
    const punch = punches[staffId]?.[key];
    const now = nowTimeInput();
    setEditor({ staffId, staffName, day });
    setEditPunchIn(isoToTimeInput(punch?.punchInAt) || now);
    setEditPunchOut(isoToTimeInput(punch?.punchOutAt) || now);
    setEditError("");
    setMessage("");
  }

  function applyLocalDay(
    staffId: string,
    day: number,
    next: {
      status: Status | null;
      punchInAt: string | null;
      punchOutAt: string | null;
    },
  ) {
    const key = String(day);
    setMarks((prev) => ({
      ...prev,
      [staffId]: { ...(prev[staffId] ?? {}), [key]: next.status },
    }));
    setPunches((prev) => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] ?? {}),
        [key]: {
          punchInAt: next.punchInAt,
          punchOutAt: next.punchOutAt,
        },
      },
    }));
  }

  async function persistDay(
    body: {
      staffProfileId: string;
      date: string;
      status: Status | null;
      punchInAt?: string | null;
      punchOutAt?: string | null;
    },
    local: {
      status: Status | null;
      punchInAt: string | null;
      punchOutAt: string | null;
    },
    successMessage: string,
  ) {
    if (!editor) return;
    setActionSaving(true);
    setEditError("");
    setError("");
    try {
      const res = await attendanceApi.saveStaffDay(body);
      if (res.attendance) {
        applyLocalDay(editor.staffId, editor.day, {
          status: (str(res.attendance.status) as Status) || local.status,
          punchInAt: attendanceIso(res.attendance.punchInAt),
          punchOutAt: attendanceIso(res.attendance.punchOutAt),
        });
      } else {
        applyLocalDay(editor.staffId, editor.day, local);
      }
      setMessage(successMessage);
      setEditor(null);
    } catch (err) {
      setEditError(handleErr(err, "Failed to save attendance") ?? "");
    } finally {
      setActionSaving(false);
    }
  }

  async function punchIn() {
    if (!editor || actionSaving) return;
    if (editorHasPunchIn) {
      setEditError("Punch-in is already recorded for this day.");
      return;
    }
    if (!editPunchIn) {
      setEditError("Choose a punch-in time.");
      return;
    }
    const punchInAt = localDateTimeIso(
      year,
      month,
      editor.day,
      editPunchIn,
    );
    await persistDay(
      {
        staffProfileId: editor.staffId,
        date: dateKey(year, month, editor.day),
        status: "PRESENT",
        punchInAt,
        punchOutAt: null,
      },
      { status: "PRESENT", punchInAt, punchOutAt: null },
      "Punch-in saved.",
    );
  }

  async function punchOut() {
    if (!editor || actionSaving) return;
    const existingIn = editorPunch?.punchInAt;
    if (!existingIn) {
      setEditError("Punch in first before punching out.");
      return;
    }
    if (editorHasPunchOut) {
      setEditError("Punch-out is already recorded for this day.");
      return;
    }
    if (!editPunchOut) {
      setEditError("Choose a punch-out time.");
      return;
    }
    const punchOutAt = localDateTimeIso(
      year,
      month,
      editor.day,
      editPunchOut,
    );
    if (new Date(punchOutAt).getTime() < new Date(existingIn).getTime()) {
      setEditError("Punch-out must be after punch-in.");
      return;
    }
    await persistDay(
      {
        staffProfileId: editor.staffId,
        date: dateKey(year, month, editor.day),
        status: "PRESENT",
        punchInAt: existingIn,
        punchOutAt,
      },
      { status: "PRESENT", punchInAt: existingIn, punchOutAt },
      "Punch-out saved.",
    );
  }

  async function markAbsent() {
    if (!editor || actionSaving) return;
    if (editorHasPunchIn) {
      setEditError("Undo the punch first before marking absent.");
      return;
    }
    await persistDay(
      {
        staffProfileId: editor.staffId,
        date: dateKey(year, month, editor.day),
        status: "ABSENT",
        punchInAt: null,
        punchOutAt: null,
      },
      { status: "ABSENT", punchInAt: null, punchOutAt: null },
      "Marked absent.",
    );
  }

  async function undoMark() {
    if (!editor || actionSaving) return;
    if (!editorHasAnyMark) return;
    await persistDay(
      {
        staffProfileId: editor.staffId,
        date: dateKey(year, month, editor.day),
        status: null,
      },
      { status: null, punchInAt: null, punchOutAt: null },
      "Attendance cleared.",
    );
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
        <div className="ml-auto">
          <Button variant="outline" asChild>
            <Link href="/dashboard/school/attendance/staff/qr">
              <QrCode className="mr-1 h-4 w-4" />
              Punch QR poster
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {monthLabel(year, month)} · Click a cell to punch in, punch out, mark
        absent, or undo. Changes save immediately. IP = punched in, awaiting
        punch out. Highlighted columns are holidays (including Sundays) and
        cannot be marked.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {loading ? (
        <LoadingPulseCard />
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
                {days.map((day) => {
                  const holiday = isHolidayDay(day);
                  return (
                    <th
                      key={day}
                      title={holiday ? "Holiday" : undefined}
                      className={cn(
                        "min-w-8 px-1 py-2 text-center font-medium",
                        holiday && "bg-amber-100 text-amber-900",
                      )}
                    >
                      {day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const id = str(s.staffProfileId);
                return (
                  <tr key={id} className="border-t">
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
                      const status = marks[id]?.[String(day)] ?? null;
                      const punch = punches[id]?.[String(day)];
                      const hasPunchIn = Boolean(punch?.punchInAt);
                      const hasPunchOut = Boolean(punch?.punchOutAt);
                      const holiday = isHolidayDay(day);
                      const inProgress =
                        !holiday &&
                        status === "PRESENT" &&
                        hasPunchIn &&
                        !hasPunchOut;
                      const complete =
                        !holiday &&
                        status === "PRESENT" &&
                        hasPunchIn &&
                        hasPunchOut;
                      const title = holiday
                        ? "Holiday"
                        : inProgress
                          ? `In progress · In ${fmtTime(punch?.punchInAt)} · No punch out`
                          : complete
                            ? `In ${fmtTime(punch?.punchInAt)} · Out ${fmtTime(punch?.punchOutAt)}`
                            : status === "ABSENT"
                              ? "Absent"
                              : "Click to mark";
                      return (
                        <td
                          key={day}
                          className={cn(
                            "p-0.5 text-center",
                            holiday && "bg-amber-50",
                          )}
                        >
                          <button
                            type="button"
                            disabled={holiday}
                            title={title}
                            onClick={() => openCell(id, str(s.name), day)}
                            className={cn(
                              "mx-auto flex h-7 min-w-7 items-center justify-center rounded px-0.5 text-[10px] font-semibold",
                              holiday &&
                                "cursor-not-allowed bg-amber-100/80 text-amber-800/70",
                              complete && "bg-emerald-100 text-emerald-800",
                              inProgress && "bg-amber-100 text-amber-900",
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
                              : inProgress
                                ? "IP"
                                : complete
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

      <Dialog
        open={editor != null}
        onOpenChange={(open) => {
          if (!open && !actionSaving) setEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Staff punch</DialogTitle>
            <DialogDescription>
              {editor
                ? `${editor.staffName} · ${dateKey(year, month, editor.day)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="relative space-y-4 py-2">
            {actionSaving ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md bg-background/80">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Saving...</p>
              </div>
            ) : null}

            {editorIsAbsent ? (
              <p className="text-sm text-muted-foreground">
                Marked absent for this day.
              </p>
            ) : editorHasPunchIn ? (
              <p className="text-sm text-muted-foreground">
                Recorded: In {fmtTime(editorPunch?.punchInAt)}
                {editorHasPunchOut
                  ? ` · Out ${fmtTime(editorPunch?.punchOutAt)}`
                  : " · In progress (no punch out yet)"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No punch recorded for this day yet.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="punch-in">Punch-in time</Label>
                <Input
                  id="punch-in"
                  type="time"
                  value={editPunchIn}
                  onChange={(e) => setEditPunchIn(e.target.value)}
                  disabled={
                    actionSaving || editorHasPunchIn || editorIsAbsent
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="punch-out">Punch-out time</Label>
                <Input
                  id="punch-out"
                  type="time"
                  value={editPunchOut}
                  onChange={(e) => setEditPunchOut(e.target.value)}
                  disabled={
                    actionSaving ||
                    !editorHasPunchIn ||
                    editorHasPunchOut ||
                    editorIsAbsent
                  }
                />
              </div>
            </div>

            {editError ? (
              <p className="text-sm text-destructive">{editError}</p>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <div className="flex w-full flex-wrap gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => void punchIn()}
                disabled={
                  actionSaving || editorHasPunchIn || editorIsAbsent
                }
              >
                Punch in
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                onClick={() => void punchOut()}
                disabled={
                  actionSaving ||
                  !editorHasPunchIn ||
                  editorHasPunchOut ||
                  editorIsAbsent
                }
              >
                Punch out
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="destructive"
                onClick={() => void markAbsent()}
                disabled={
                  actionSaving || editorHasPunchIn || editorIsAbsent
                }
              >
                Absent
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="outline"
                onClick={() => void undoMark()}
                disabled={actionSaving || !editorHasAnyMark}
              >
                Undo
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setEditor(null)}
              disabled={actionSaving}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
