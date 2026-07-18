"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

function localDateTimeIso(
  year: number,
  month: number,
  day: number,
  hhmm: string,
): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, 0, 0).toISOString();
}

export default function StaffAttendancePage() {
  const router = useRouter();
  const initial = currentYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [days, setDays] = useState<number[]>([]);
  const [staff, setStaff] = useState<Row[]>([]);
  /** marks[staffProfileId][day] */
  const [marks, setMarks] = useState<Record<string, Record<string, Status | null>>>(
    {},
  );
  const [punches, setPunches] = useState<
    Record<string, Record<string, { punchInAt: string | null; punchOutAt: string | null }>>
  >({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editor, setEditor] = useState<CellEditor | null>(null);
  const [editPunchIn, setEditPunchIn] = useState("09:00");
  const [editPunchOut, setEditPunchOut] = useState("17:00");
  const [editError, setEditError] = useState("");

  const editorKey = editor ? String(editor.day) : "";
  const editorHasPunchIn = Boolean(
    editor && punches[editor.staffId]?.[editorKey]?.punchInAt,
  );
  const editorHasAnyMark = Boolean(
    editor &&
      (marks[editor.staffId]?.[editorKey] != null ||
        punches[editor.staffId]?.[editorKey]?.punchInAt),
  );

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
    setMessage("");
    try {
      const res = await attendanceApi.staffMonth(year, month);
      setDays(res.days);
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
      setDirty(false);
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

  function openCell(staffId: string, staffName: string, day: number) {
    const key = String(day);
    const punch = punches[staffId]?.[key];
    setEditor({ staffId, staffName, day });
    setEditPunchIn(isoToTimeInput(punch?.punchInAt) || "09:00");
    setEditPunchOut(isoToTimeInput(punch?.punchOutAt) || "17:00");
    setEditError("");
  }

  function markDirty() {
    setDirty(true);
    setMessage("");
  }

  function punchIn() {
    if (!editor) return;
    if (!editPunchIn) {
      setEditError("Choose a punch-in time.");
      return;
    }
    const { staffId, day } = editor;
    const key = String(day);
    const punchInAt = localDateTimeIso(year, month, day, editPunchIn);
    const existingOut = punches[staffId]?.[key]?.punchOutAt ?? null;
    const punchOutAt =
      existingOut && new Date(existingOut).getTime() >= new Date(punchInAt).getTime()
        ? existingOut
        : null;

    setMarks((prev) => ({
      ...prev,
      [staffId]: { ...(prev[staffId] ?? {}), [key]: "PRESENT" },
    }));
    setPunches((prev) => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] ?? {}),
        [key]: { punchInAt, punchOutAt },
      },
    }));
    if (!punchOutAt) {
      setEditPunchOut("17:00");
    }
    markDirty();
    setEditError("");
  }

  function punchOut() {
    if (!editor) return;
    const { staffId, day } = editor;
    const key = String(day);
    const existingIn = punches[staffId]?.[key]?.punchInAt;
    if (!existingIn) {
      setEditError("Punch in first before punching out.");
      return;
    }
    if (!editPunchOut) {
      setEditError("Choose a punch-out time.");
      return;
    }
    const punchOutAt = localDateTimeIso(year, month, day, editPunchOut);
    if (new Date(punchOutAt).getTime() < new Date(existingIn).getTime()) {
      setEditError("Punch-out must be after punch-in.");
      return;
    }

    setMarks((prev) => ({
      ...prev,
      [staffId]: { ...(prev[staffId] ?? {}), [key]: "PRESENT" },
    }));
    setPunches((prev) => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] ?? {}),
        [key]: { punchInAt: existingIn, punchOutAt },
      },
    }));
    markDirty();
    setEditError("");
  }

  function undoMark() {
    if (!editor) return;
    const { staffId, day } = editor;
    const key = String(day);
    setMarks((prev) => ({
      ...prev,
      [staffId]: { ...(prev[staffId] ?? {}), [key]: null },
    }));
    setPunches((prev) => ({
      ...prev,
      [staffId]: {
        ...(prev[staffId] ?? {}),
        [key]: { punchInAt: null, punchOutAt: null },
      },
    }));
    setEditPunchIn("09:00");
    setEditPunchOut("17:00");
    markDirty();
    setEditError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const records: Array<{
        staffProfileId: string;
        date: string;
        status: Status | null;
        punchInAt?: string | null;
        punchOutAt?: string | null;
      }> = [];
      for (const [staffId, dayMap] of Object.entries(marks)) {
        for (const [day, status] of Object.entries(dayMap)) {
          const punch = punches[staffId]?.[day];
          records.push({
            staffProfileId: staffId,
            date: dateKey(year, month, Number(day)),
            status,
            punchInAt: status === "PRESENT" ? (punch?.punchInAt ?? null) : null,
            punchOutAt:
              status === "PRESENT" ? (punch?.punchOutAt ?? null) : null,
          });
        }
      }
      if (records.length === 0) {
        setError("Mark at least one attendance cell before saving.");
        setSaving(false);
        return;
      }
      const missingPunch = records.find(
        (r) => r.status === "PRESENT" && !r.punchInAt,
      );
      if (missingPunch) {
        setError("Present marks need a punch-in time. Open the cell and set times.");
        setSaving(false);
        return;
      }
      await attendanceApi.saveStaffMonth({ records });
      setMessage("Staff monthly attendance saved.");
      setDirty(false);
      await load();
    } catch (err) {
      handleErr(err, "Failed to save staff attendance");
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

      <p className="text-sm text-muted-foreground">
        {monthLabel(year, month)} · Click a cell to punch in, punch out, or
        undo, then save.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

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
                      const title =
                        status === "PRESENT" && punch?.punchInAt
                          ? `In ${fmtTime(punch.punchInAt)}${
                              punch.punchOutAt
                                ? ` · Out ${fmtTime(punch.punchOutAt)}`
                                : " · No punch out"
                            }`
                          : status === "ABSENT"
                            ? "Absent"
                            : "Click to mark";
                      return (
                        <td key={day} className="p-0.5 text-center">
                          <button
                            type="button"
                            title={title}
                            onClick={() => openCell(id, str(s.name), day)}
                            className={cn(
                              "mx-auto flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold",
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

      <Dialog
        open={editor != null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
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

          <div className="space-y-4 py-2">
            {editorHasPunchIn ? (
              <p className="text-sm text-muted-foreground">
                Recorded: In{" "}
                {fmtTime(punches[editor!.staffId]?.[editorKey]?.punchInAt)}
                {punches[editor!.staffId]?.[editorKey]?.punchOutAt
                  ? ` · Out ${fmtTime(punches[editor!.staffId]?.[editorKey]?.punchOutAt)}`
                  : " · No punch out yet"}
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
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="punch-out">Punch-out time</Label>
                <Input
                  id="punch-out"
                  type="time"
                  value={editPunchOut}
                  onChange={(e) => setEditPunchOut(e.target.value)}
                />
              </div>
            </div>

            {editError ? (
              <p className="text-sm text-destructive">{editError}</p>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <div className="flex w-full flex-wrap gap-2">
              <Button type="button" className="flex-1" onClick={punchIn}>
                Punch in
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                onClick={punchOut}
                disabled={!editorHasPunchIn}
              >
                Punch out
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="outline"
                onClick={undoMark}
                disabled={!editorHasAnyMark}
              >
                Undo
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setEditor(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
