"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { schoolApi } from "@/lib/api/school";
import {
  buildTimetableColumns,
  downloadClassTimetablePdf,
} from "@/lib/timetable-pdf";

type Row = Record<string, unknown>;

type ClassSubject = {
  subjectId: string;
  name: string;
  teacherName: string;
};

type SlotMap = Record<string, string>; // "day:period" -> subjectId

type DragPayload =
  | { kind: "palette"; subjectId: string }
  | { kind: "cell"; dayOfWeek: number; periodIndex: number; subjectId: string };

const DAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const DAY_FULL_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const DRAG_MIME = "application/x-timetable";

function periodOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function slotKey(day: number, period: number) {
  return `${day}:${period}`;
}

function parseClassSubjects(klass: Row): ClassSubject[] {
  return arr(klass.classSubjects)
    .map((link) => {
      const subject = obj(link.subject);
      const subjectId = str(link.subjectId) || str(subject.id);
      if (!subjectId) return null;
      return {
        subjectId,
        name: str(subject.name) || "Subject",
        teacherName: str(obj(obj(link.staffProfile).user).name) || "—",
      };
    })
    .filter((s): s is ClassSubject => s != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

type Props = {
  classId: string;
  klass: Row;
  onClassUpdated: (klass: Row) => void;
  onError: (err: unknown, fallback: string) => void;
  onMessage: (msg: string) => void;
};

export function ClassTimetableEditor({
  classId,
  klass,
  onClassUpdated,
  onError,
  onMessage,
}: Props) {
  const classSubjects = useMemo(() => parseClassSubjects(klass), [klass]);
  const subjectById = useMemo(() => {
    const map = new Map<string, ClassSubject>();
    for (const s of classSubjects) map.set(s.subjectId, s);
    return map;
  }, [classSubjects]);

  const [periodCount, setPeriodCount] = useState(8);
  const [recessAfter, setRecessAfter] = useState<number[]>([]);
  const [saturdayIsWorkingDay, setSaturdayIsWorkingDay] = useState(true);
  const [slots, setSlots] = useState<SlotMap>({});
  const [loading, setLoading] = useState(true);
  const [savingStructure, setSavingStructure] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [structureDirty, setStructureDirty] = useState(false);
  const [draftPeriodCount, setDraftPeriodCount] = useState(8);
  const [draftRecessAfter, setDraftRecessAfter] = useState<number[]>([]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showTeacherNames, setShowTeacherNames] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await schoolApi.classes.getTimetable(classId);
      const pc = res.periodCount || 8;
      const ra = Array.isArray(res.recessAfter) ? res.recessAfter : [];
      setPeriodCount(pc);
      setRecessAfter(ra);
      setDraftPeriodCount(pc);
      setDraftRecessAfter(ra);
      setSaturdayIsWorkingDay(res.saturdayIsWorkingDay !== false);
      const next: SlotMap = {};
      for (const slot of res.slots) {
        const day = Number(slot.dayOfWeek);
        const period = Number(slot.periodIndex);
        const subjectId = str(slot.subjectId);
        if (day && period && subjectId) {
          next[slotKey(day, period)] = subjectId;
        }
      }
      setSlots(next);
      setDirty(false);
      setStructureDirty(false);
    } catch (err) {
      onError(err, "Failed to load timetable");
    } finally {
      setLoading(false);
    }
  }, [classId, onError]);

  useEffect(() => {
    void loadTimetable();
  }, [loadTimetable]);

  // Sync from class when periodCount/recessAfter updated via parent
  useEffect(() => {
    if (typeof klass.periodCount === "number") {
      setPeriodCount(klass.periodCount);
      setDraftPeriodCount(klass.periodCount);
    }
    if (Array.isArray(klass.recessAfter)) {
      const ra = klass.recessAfter.filter(
        (n): n is number => typeof n === "number",
      );
      setRecessAfter(ra);
      setDraftRecessAfter(ra);
    }
  }, [klass.periodCount, klass.recessAfter]);

  const workingDays = useMemo(() => {
    const days = [1, 2, 3, 4, 5];
    if (saturdayIsWorkingDay) days.push(6);
    return days;
  }, [saturdayIsWorkingDay]);

  type GridRow =
    | { kind: "period"; periodIndex: number; label: string }
    | { kind: "recess"; afterPeriod: number; label: string };

  const gridRows = useMemo((): GridRow[] => {
    const rows: GridRow[] = [];
    const count = draftPeriodCount;
    const recessSet = new Set(draftRecessAfter);
    for (let p = 1; p <= count; p++) {
      rows.push({
        kind: "period",
        periodIndex: p,
        label: periodOrdinal(p),
      });
      if (recessSet.has(p)) {
        rows.push({
          kind: "recess",
          afterPeriod: p,
          label: "Recess",
        });
      }
    }
    return rows;
  }, [draftPeriodCount, draftRecessAfter]);

  function setCell(day: number, period: number, subjectId: string | null) {
    setSlots((prev) => {
      const next = { ...prev };
      const key = slotKey(day, period);
      if (subjectId) next[key] = subjectId;
      else delete next[key];
      return next;
    });
    setDirty(true);
  }

  function isDayFullyFilled(day: number, map: SlotMap = slots): boolean {
    if (draftPeriodCount < 1) return false;
    for (let p = 1; p <= draftPeriodCount; p++) {
      if (!map[slotKey(day, p)]) return false;
    }
    return true;
  }

  function copyDayFrom(fromDay: number, toDay: number) {
    setSlots((prev) => {
      const next = { ...prev };
      for (let p = 1; p <= draftPeriodCount; p++) {
        const fromKey = slotKey(fromDay, p);
        const toKey = slotKey(toDay, p);
        const subjectId = prev[fromKey];
        if (subjectId) next[toKey] = subjectId;
        else delete next[toKey];
      }
      return next;
    });
    setDirty(true);
  }

  function onDragStartPalette(
    e: React.DragEvent,
    subjectId: string,
  ) {
    const payload: DragPayload = { kind: "palette", subjectId };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copyMove";
  }

  function onDragStartCell(
    e: React.DragEvent,
    dayOfWeek: number,
    periodIndex: number,
    subjectId: string,
  ) {
    const payload: DragPayload = {
      kind: "cell",
      dayOfWeek,
      periodIndex,
      subjectId,
    };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOverCell(
    e: React.DragEvent,
    dayOfWeek: number,
    periodIndex: number,
  ) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const key = slotKey(dayOfWeek, periodIndex);
    setDragOverKey((prev) => (prev === key ? prev : key));
  }

  function onDragLeaveCell(
    e: React.DragEvent,
    dayOfWeek: number,
    periodIndex: number,
  ) {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    const key = slotKey(dayOfWeek, periodIndex);
    setDragOverKey((prev) => (prev === key ? null : prev));
  }

  function clearDragHighlight() {
    setDragOverKey(null);
  }

  function onDropCell(
    e: React.DragEvent,
    dayOfWeek: number,
    periodIndex: number,
  ) {
    e.preventDefault();
    clearDragHighlight();
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }

    const targetKey = slotKey(dayOfWeek, periodIndex);
    const existingTarget = slots[targetKey] ?? null;

    if (payload.kind === "palette") {
      setCell(dayOfWeek, periodIndex, payload.subjectId);
      return;
    }

    if (payload.kind === "cell") {
      if (
        payload.dayOfWeek === dayOfWeek &&
        payload.periodIndex === periodIndex
      ) {
        return;
      }
      setSlots((prev) => {
        const next = { ...prev };
        const fromKey = slotKey(payload.dayOfWeek, payload.periodIndex);
        delete next[fromKey];
        if (existingTarget) {
          next[fromKey] = existingTarget;
        }
        next[targetKey] = payload.subjectId;
        return next;
      });
      setDirty(true);
    }
  }

  function onDropTrash(e: React.DragEvent) {
    e.preventDefault();
    clearDragHighlight();
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    if (payload.kind === "cell") {
      setCell(payload.dayOfWeek, payload.periodIndex, null);
    }
  }

  function toggleDraftRecess(afterPeriod: number) {
    setDraftRecessAfter((prev) => {
      const has = prev.includes(afterPeriod);
      const next = has
        ? prev.filter((n) => n !== afterPeriod)
        : [...prev, afterPeriod].sort((a, b) => a - b);
      return next;
    });
    setStructureDirty(true);
  }

  async function saveStructure() {
    setSavingStructure(true);
    try {
      const res = await schoolApi.classes.update(classId, {
        periodCount: draftPeriodCount,
        recessAfter: draftRecessAfter.filter(
          (n) => n >= 1 && n < draftPeriodCount,
        ),
      });
      onClassUpdated(res.class);
      setPeriodCount(draftPeriodCount);
      const nextRecess = draftRecessAfter.filter(
        (n) => n >= 1 && n < draftPeriodCount,
      );
      setRecessAfter(nextRecess);
      setDraftRecessAfter(nextRecess);
      setSlots((prev) => {
        const next: SlotMap = {};
        for (const [key, subjectId] of Object.entries(prev)) {
          const [, p] = key.split(":").map(Number);
          if (p <= draftPeriodCount) next[key] = subjectId;
        }
        return next;
      });
      setStructureDirty(false);
      onMessage(
        dirty
          ? "Period structure saved. Save the timetable to keep your slot changes."
          : "Period structure saved.",
      );
    } catch (err) {
      onError(err, "Failed to save period structure");
    } finally {
      setSavingStructure(false);
    }
  }

  async function saveTimetable() {
    setSavingSlots(true);
    try {
      const payload = Object.entries(slots).map(([key, subjectId]) => {
        const [dayOfWeek, periodIndex] = key.split(":").map(Number);
        return { dayOfWeek, periodIndex, subjectId };
      });
      await schoolApi.classes.setTimetable(classId, { slots: payload });
      setDirty(false);
      setEditing(false);
      onMessage("Timetable saved.");
      await loadTimetable();
    } catch (err) {
      onError(err, "Failed to save timetable");
    } finally {
      setSavingSlots(false);
    }
  }

  async function onDownloadPdf() {
    setDownloadingPdf(true);
    try {
      let schoolName: string | undefined;
      try {
        const me = await schoolApi.me();
        schoolName = str(obj(me.school).name) || undefined;
      } catch {
        // School name is optional on the PDF
      }
      const columns = buildTimetableColumns(
        draftPeriodCount,
        draftRecessAfter,
      );
      const cells: Record<
        string,
        { subjectName: string; teacherName: string } | undefined
      > = {};
      for (const [key, subjectId] of Object.entries(slots)) {
        const subject = subjectById.get(subjectId);
        if (!subject) continue;
        cells[key] = {
          subjectName: subject.name,
          teacherName: subject.teacherName,
        };
      }
      downloadClassTimetablePdf({
        schoolName,
        classLevel: str(klass.classLevel),
        section: str(klass.section) || null,
        academicYearName: str(obj(klass.academicYear).name) || undefined,
        workingDays,
        columns,
        cells,
        showTeacherNames,
      });
      onMessage("Timetable PDF downloaded.");
    } catch (err) {
      onError(err, "Failed to download timetable PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily routine</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading timetable...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Daily routine</CardTitle>
          <CardDescription>
            Weekly timetable for this class. Sunday is always a holiday
            {saturdayIsWorkingDay ? "" : "; Saturday is off for this school"}
            {editing ? ". Drag subjects onto periods." : "."}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showTeacherNames}
              onChange={(e) => setShowTeacherNames(e.target.checked)}
            />
            Show teacher names
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingPdf || classSubjects.length === 0}
            onClick={() => void onDownloadPdf()}
          >
            {downloadingPdf ? "Preparing..." : "Download PDF"}
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (dirty || structureDirty) {
                  void loadTimetable();
                }
                setEditing(false);
                clearDragHighlight();
              }}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit timetable
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {editing ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Period structure</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Periods per day</Label>
              <Select
                value={String(draftPeriodCount)}
                onValueChange={(v) => {
                  const n = Number(v);
                  setDraftPeriodCount(n);
                  setDraftRecessAfter((prev) =>
                    prev.filter((r) => r >= 1 && r < n),
                  );
                  setStructureDirty(true);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={savingStructure || !structureDirty}
              onClick={() => void saveStructure()}
            >
              {savingStructure ? "Saving..." : "Save structure"}
            </Button>
          </div>
          {draftPeriodCount > 1 ? (
            <div className="space-y-2">
              <Label>Recess after period</Label>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  { length: draftPeriodCount - 1 },
                  (_, i) => i + 1,
                ).map((n) => {
                  const checked = draftRecessAfter.includes(n);
                  return (
                    <label
                      key={n}
                      className="flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDraftRecess(n)}
                      />
                      After {n}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        ) : null}

        {classSubjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Assign subjects to this class before building the timetable.
          </p>
        ) : (
          <>
            {editing ? (
            <>
            <div className="space-y-2">
              <Label>Subjects (drag onto the grid)</Label>
              <div className="flex flex-wrap gap-2">
                {classSubjects.map((s) => (
                  <div
                    key={s.subjectId}
                    draggable
                    onDragStart={(e) => onDragStartPalette(e, s.subjectId)}
                    onDragEnd={clearDragHighlight}
                    className="cursor-grab rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm active:cursor-grabbing"
                  >
                    <span className="font-medium">{s.name}</span>
                    {showTeacherNames ? (
                      <span className="ml-1 text-muted-foreground">
                        ({s.teacherName})
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="flex min-h-12 items-center justify-center rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={onDropTrash}
            >
              Drop here to clear a period
            </div>
            </>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border bg-muted/40 px-2 py-2 text-left font-medium">
                      Day
                    </th>
                    {gridRows.map((col) =>
                      col.kind === "recess" ? (
                        <th
                          key={`recess-h-${col.afterPeriod}`}
                          className="w-0 border bg-amber-50 px-0 py-2 text-center text-[10px] font-medium leading-tight text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                          style={{ width: "1%", maxWidth: "1.25rem" }}
                          title="Recess"
                        >
                          <span className="inline-block [writing-mode:vertical-rl] rotate-180">
                            Recess
                          </span>
                        </th>
                      ) : (
                        <th
                          key={`period-h-${col.periodIndex}`}
                          className="border bg-muted/40 px-2 py-2 text-center font-medium whitespace-nowrap"
                        >
                          {col.label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {workingDays.map((day, dayIndex) => {
                    const prevDay =
                      dayIndex > 0 ? workingDays[dayIndex - 1] : null;
                    const showCopyFromPrev =
                      editing &&
                      day !== 6 &&
                      prevDay != null &&
                      isDayFullyFilled(prevDay) &&
                      !isDayFullyFilled(day);
                    return (
                    <tr key={day}>
                      <td className="border px-2 py-2 font-medium whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span>{DAY_LABELS[day]}</span>
                          {showCopyFromPrev && prevDay != null ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => copyDayFrom(prevDay, day)}
                            >
                              Copy from {DAY_FULL_LABELS[prevDay]}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      {gridRows.map((col) => {
                        if (col.kind === "recess") {
                          return (
                            <td
                              key={`${day}-recess-${col.afterPeriod}`}
                              className="w-0 border bg-amber-50 px-0 py-1 text-center align-middle dark:bg-amber-950/30"
                              style={{ width: "1%", maxWidth: "1.25rem" }}
                              title="Recess"
                            >
                              <span className="inline-block text-[10px] font-medium leading-none text-amber-900 dark:text-amber-100 [writing-mode:vertical-rl] rotate-180">
                                Recess
                              </span>
                            </td>
                          );
                        }
                        const key = slotKey(day, col.periodIndex);
                        const subjectId = slots[key];
                        const subject = subjectId
                          ? subjectById.get(subjectId)
                          : null;
                        const isDragOver = editing && dragOverKey === key;
                        return (
                          <td
                            key={key}
                            className={
                              isDragOver
                                ? "border border-primary bg-primary/10 p-1 align-top ring-2 ring-inset ring-primary/40"
                                : "border p-1 align-top"
                            }
                            onDragOver={
                              editing
                                ? (e) =>
                                    onDragOverCell(e, day, col.periodIndex)
                                : undefined
                            }
                            onDragLeave={
                              editing
                                ? (e) =>
                                    onDragLeaveCell(e, day, col.periodIndex)
                                : undefined
                            }
                            onDrop={
                              editing
                                ? (e) => onDropCell(e, day, col.periodIndex)
                                : undefined
                            }
                          >
                            {subject ? (
                              <div
                                draggable={editing}
                                onDragStart={
                                  editing
                                    ? (e) =>
                                        onDragStartCell(
                                          e,
                                          day,
                                          col.periodIndex,
                                          subject.subjectId,
                                        )
                                    : undefined
                                }
                                onDragEnd={
                                  editing ? clearDragHighlight : undefined
                                }
                                className={
                                  editing
                                    ? "group relative cursor-grab rounded border bg-background px-2 py-1.5 active:cursor-grabbing"
                                    : "rounded border bg-background px-2 py-1.5"
                                }
                              >
                                <p className="font-medium leading-tight">
                                  {subject.name}
                                </p>
                                {showTeacherNames ? (
                                  <p className="text-xs text-muted-foreground">
                                    {subject.teacherName}
                                  </p>
                                ) : null}
                                {editing ? (
                                  <button
                                    type="button"
                                    className="absolute top-0.5 right-0.5 hidden rounded px-1 text-xs text-muted-foreground hover:bg-muted group-hover:inline"
                                    onClick={() =>
                                      setCell(day, col.periodIndex, null)
                                    }
                                    aria-label="Clear"
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </div>
                            ) : editing ? (
                              <div
                                className={
                                  isDragOver
                                    ? "flex h-12 items-center justify-center rounded border border-primary bg-primary/5 text-xs font-medium text-primary"
                                    : "flex h-12 items-center justify-center rounded border border-dashed text-xs text-muted-foreground"
                                }
                              >
                                Drop
                              </div>
                            ) : (
                              <div className="h-12" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={savingSlots || !dirty}
                onClick={() => void saveTimetable()}
              >
                {savingSlots ? "Saving..." : "Save timetable"}
              </Button>
              {dirty ? (
                <p className="text-sm text-muted-foreground">
                  Unsaved timetable changes
                </p>
              ) : null}
            </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
