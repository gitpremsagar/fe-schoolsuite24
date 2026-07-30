"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { MarkSheetGrid } from "@/components/exams/mark-sheet-grid";
import { examsApi, schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";

type Row = Record<string, unknown>;
type ExamScope = "SCHOOL" | "CLASSES";
type PaperKey = string;

type SubjectCol = {
  subjectId: string;
  name: string;
  maxMarks: number;
  paperId: string;
};

type StudentRow = {
  studentProfileId: string;
  name: string;
  rollNumber: string;
  admissionNumber: string;
  /** subjectId → mark sheet */
  bySubject: Record<
    string,
    {
      id: string;
      marksObtained: number | null;
      isPublished: boolean;
      maxMarks: number;
    }
  >;
};

function str(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function num(v: unknown) {
  return typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function formatDisplayDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function compareRoll(a: string, b: string) {
  if (a && b) return a.localeCompare(b, undefined, { numeric: true });
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function paperKey(classId: string, subjectId: string): PaperKey {
  return `${classId}:${subjectId}`;
}

export default function SchoolExamDetailPage() {
  const router = useRouter();
  const params = useParams();
  const examId = str(params.id);

  const [exam, setExam] = useState<Row | null>(null);
  const [allClasses, setAllClasses] = useState<Row[]>([]);
  const [sheets, setSheets] = useState<Row[]>([]);
  /** markSheetId → input string */
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    examDate: "",
    academicYearId: "",
    scope: "CLASSES" as ExamScope,
    classIds: [] as string[],
    papers: {} as Record<PaperKey, string>,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const papers = useMemo(() => arr(exam?.papers), [exam]);

  const classOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const p of papers) {
      const id = str(p.classId);
      if (map.has(id)) continue;
      const klass = obj(p.class);
      map.set(id, {
        id,
        label: formatClassLabel(
          str(klass.classLevel),
          klass.section as string | null,
        ),
      });
    }
    // Prefer examination.classes order if present
    const examClasses = arr(exam?.classes);
    if (examClasses.length > 0) {
      return examClasses
        .map((c) => {
          const id = str(c.classId || c.id);
          return (
            map.get(id) ?? {
              id,
              label: str(c.label) || formatClassLabel(str(c.classLevel), c.section as string | null),
            }
          );
        })
        .filter((c) => papers.some((p) => str(p.classId) === c.id));
    }
    return [...map.values()];
  }, [papers, exam]);

  const subjectCols: SubjectCol[] = useMemo(() => {
    if (!classId) return [];
    return papers
      .filter((p) => str(p.classId) === classId)
      .map((p) => {
        const subject = obj(p.subject);
        return {
          subjectId: str(p.subjectId),
          name: str(subject.name) || "Subject",
          maxMarks: num(p.maxMarks),
          paperId: str(p.id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [papers, classId]);

  const maxTotal = useMemo(
    () => subjectCols.reduce((sum, c) => sum + c.maxMarks, 0),
    [subjectCols],
  );

  const studentRows: StudentRow[] = useMemo(() => {
    const byStudent = new Map<string, StudentRow>();
    for (const s of sheets) {
      const student = obj(s.student);
      const studentProfileId = str(s.studentProfileId || student.id);
      let row = byStudent.get(studentProfileId);
      if (!row) {
        row = {
          studentProfileId,
          name: str(student.name),
          rollNumber: str(student.rollNumber),
          admissionNumber: str(student.admissionNumber),
          bySubject: {},
        };
        byStudent.set(studentProfileId, row);
      }
      const subjectId = str(s.subjectId);
      row.bySubject[subjectId] = {
        id: str(s.id),
        marksObtained:
          s.marksObtained == null ? null : num(s.marksObtained),
        isPublished: !!s.isPublished,
        maxMarks: num(s.maxMarks),
      };
    }
    return [...byStudent.values()].sort(
      (a, b) =>
        compareRoll(a.rollNumber, b.rollNumber) ||
        a.name.localeCompare(b.name),
    );
  }, [sheets]);

  const rowStats = useMemo(() => {
    const totals = studentRows.map((row) => {
      let total = 0;
      let any = false;
      for (const col of subjectCols) {
        const sheet = row.bySubject[col.subjectId];
        if (!sheet) continue;
        const raw = marks[sheet.id];
        if (raw === undefined || raw.trim() === "") continue;
        any = true;
        const value = Number(raw);
        if (!Number.isNaN(value)) total += value;
      }
      return { total, any };
    });

    const rankedIndexes = totals
      .map((t, i) => ({ ...t, i }))
      .filter((t) => t.any)
      .sort((a, b) => b.total - a.total);

    const ranks = new Array<number>(totals.length).fill(0);
    let rank = 1;
    for (let k = 0; k < rankedIndexes.length; k++) {
      if (k > 0 && rankedIndexes[k].total < rankedIndexes[k - 1].total) {
        rank = k + 1;
      }
      ranks[rankedIndexes[k].i] = rank;
    }

    return totals.map((t, i) => ({
      total: t.total,
      percentage: maxTotal > 0 ? (t.total / maxTotal) * 100 : 0,
      rank: ranks[i],
    }));
  }, [studentRows, subjectCols, marks, maxTotal]);

  const classPublished = useMemo(() => {
    if (sheets.length === 0) return false;
    return sheets.every((s) => s.isPublished);
  }, [sheets]);

  const classHasPublished = useMemo(
    () => sheets.some((s) => s.isPublished),
    [sheets],
  );

  const load = useCallback(async () => {
    if (!examId) return;
    const [examRes, classesRes] = await Promise.all([
      examsApi.get(examId),
      schoolApi.classes.list(),
    ]);
    setExam(examRes.examination);
    setAllClasses(classesRes.classes);
    const paperList = arr(examRes.examination.papers);
    setClassId((prev) => {
      if (prev && paperList.some((p) => str(p.classId) === prev)) return prev;
      const first = paperList[0];
      return first ? str(first.classId) : "";
    });
  }, [examId]);

  const loadSheets = useCallback(async () => {
    if (!examId || !classId) {
      setSheets([]);
      setMarks({});
      return;
    }
    const res = await examsApi.markSheets(examId, classId);
    setSheets(res.markSheets);
    const next: Record<string, string> = {};
    for (const s of res.markSheets) {
      next[str(s.id)] =
        s.marksObtained == null ? "" : String(s.marksObtained);
    }
    setMarks(next);
    setDirty(false);
  }, [examId, classId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((err) => {
        if (active) handleErr(err, "Failed to load examination");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, handleErr]);

  useEffect(() => {
    let active = true;
    if (!classId) return;
    loadSheets().catch((err) => {
      if (active) handleErr(err, "Failed to load mark sheets");
    });
    return () => {
      active = false;
    };
  }, [classId, loadSheets, handleErr]);

  async function save() {
    if (!examId) return;
    const maxBySheet = new Map<string, number>();
    const originalById = new Map<string, number | null>();
    for (const s of sheets) {
      maxBySheet.set(str(s.id), num(s.maxMarks));
      originalById.set(
        str(s.id),
        s.marksObtained == null ? null : num(s.marksObtained),
      );
    }

    const records: Array<{ id: string; marksObtained: number | null }> = [];
    for (const s of sheets) {
      const id = str(s.id);
      const raw = marks[id]?.trim() ?? "";
      const maxMarks = maxBySheet.get(id) ?? 100;
      let value: number | null;
      if (raw === "") {
        value = null;
      } else {
        const parsed = Number(raw);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > maxMarks) {
          setError(`Marks must be between 0 and ${maxMarks}.`);
          return;
        }
        value = parsed;
      }
      const original = originalById.get(id) ?? null;
      if (original === value) continue;
      records.push({ id, marksObtained: value });
    }

    if (records.length === 0) {
      setMessage("No changes to save.");
      setDirty(false);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await examsApi.saveMarks(examId, { records });
      setMessage("Marks saved.");
      setDirty(false);
      await Promise.all([load(), loadSheets()]);
    } catch (err) {
      handleErr(err, "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  function resetMarks() {
    if (sheets.length === 0) return;
    const ok = window.confirm(
      "Clear all marks in this class mark sheet?\n\nThis only clears the form — click Save marks to persist.",
    );
    if (!ok) return;
    const cleared: Record<string, string> = {};
    for (const s of sheets) {
      cleared[str(s.id)] = "";
    }
    setMarks(cleared);
    setDirty(true);
    setError("");
    setMessage("Mark sheet cleared locally. Save to apply.");
  }

  async function publishClass(publish: boolean) {
    if (!examId || !classId) return;
    setPublishing(true);
    setError("");
    setMessage("");
    try {
      const res = await examsApi.publish(examId, {
        publish,
        classId,
      });
      setMessage(
        publish
          ? `Published mark sheets for this class (${res.updated}).`
          : `Unpublished mark sheets for this class (${res.updated}).`,
      );
      await Promise.all([load(), loadSheets()]);
    } catch (err) {
      handleErr(err, "Failed to update publish status");
    } finally {
      setPublishing(false);
    }
  }

  function openEdit() {
    if (!exam) return;
    const papersMap: Record<PaperKey, string> = {};
    const classIdSet = new Set<string>();
    for (const p of arr(exam.papers)) {
      const cId = str(p.classId);
      const subjectId = str(p.subjectId);
      papersMap[paperKey(cId, subjectId)] = String(num(p.maxMarks) || 100);
      classIdSet.add(cId);
    }
    for (const c of arr(exam.classes)) {
      classIdSet.add(str(c.classId));
    }
    setEditForm({
      name: str(exam.name),
      description: exam.description ? str(exam.description) : "",
      examDate: toDateInput(str(exam.examDate)),
      academicYearId: str(exam.academicYearId),
      scope: exam.scope === "SCHOOL" ? "SCHOOL" : "CLASSES",
      classIds: [...classIdSet],
      papers: papersMap,
    });
    setEditOpen(true);
    setError("");
  }

  const editYearClasses = useMemo(
    () =>
      allClasses.filter(
        (c) => str(c.academicYearId) === editForm.academicYearId,
      ),
    [allClasses, editForm.academicYearId],
  );

  const editSelectedClassIds = useMemo(() => {
    if (editForm.scope === "SCHOOL") {
      return editYearClasses.map((c) => str(c.id));
    }
    return editForm.classIds;
  }, [editForm.scope, editForm.classIds, editYearClasses]);

  function toggleEditClass(cId: string) {
    setEditForm((f) => {
      const next = f.classIds.includes(cId)
        ? f.classIds.filter((id) => id !== cId)
        : [...f.classIds, cId];
      const nextPapers = { ...f.papers };
      if (!next.includes(cId)) {
        for (const key of Object.keys(nextPapers)) {
          if (key.startsWith(`${cId}:`)) delete nextPapers[key];
        }
      }
      return { ...f, classIds: next, papers: nextPapers };
    });
  }

  function toggleEditPaper(cId: string, subjectId: string) {
    const key = paperKey(cId, subjectId);
    setEditForm((f) => {
      const next = { ...f.papers };
      if (key in next) delete next[key];
      else next[key] = "100";
      return { ...f, papers: next };
    });
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!examId) return;
    const name = editForm.name.trim();
    if (!name) {
      setError("Exam name is required.");
      return;
    }
    if (!editForm.examDate) {
      setError("Exam date is required.");
      return;
    }
    const paperEntries = Object.entries(editForm.papers);
    if (paperEntries.length === 0) {
      setError("Select at least one subject paper.");
      return;
    }
    const papersPayload = paperEntries.map(([key, maxMarksStr]) => {
      const [cId, subjectId] = key.split(":");
      return { classId: cId, subjectId, maxMarks: Number(maxMarksStr) };
    });
    if (papersPayload.some((p) => !p.maxMarks || p.maxMarks <= 0)) {
      setError("Each paper needs a positive max marks value.");
      return;
    }

    setEditSaving(true);
    setError("");
    setMessage("");
    try {
      await examsApi.update(examId, {
        name,
        description: editForm.description.trim() || null,
        examDate: editForm.examDate,
        scope: editForm.scope,
        classIds: editForm.scope === "CLASSES" ? editForm.classIds : undefined,
        papers: papersPayload,
      });
      setEditOpen(false);
      setMessage("Examination updated.");
      await Promise.all([load(), loadSheets()]);
    } catch (err) {
      handleErr(err, "Failed to update examination");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete() {
    if (!examId || !exam) return;
    const ok = window.confirm(
      `Delete examination "${str(exam.name)}"?\n\nThis permanently removes all mark sheets for this exam.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError("");
    try {
      await examsApi.remove(examId);
      router.replace("/dashboard/school/exams");
    } catch (err) {
      handleErr(err, "Failed to delete examination");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell allowedRoles={["ADMIN"]}>
        <LoadingPulseCard />
      </DashboardShell>
    );
  }

  if (!exam) {
    return (
      <DashboardShell allowedRoles={["ADMIN"]}>
        <p className="text-destructive text-sm">Examination not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/school/exams">Back</Link>
        </Button>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/dashboard/school/exams">
                <ArrowLeft className="size-4" />
                Exams
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">
              {str(exam.name)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatDisplayDate(str(exam.examDate))}
              {exam.description ? ` · ${str(exam.description)}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={openEdit}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-sm">
              <Badge variant="secondary">
                {num(exam.markedCount)}/{num(exam.markSheetCount)} marked
              </Badge>
              <Badge variant="secondary">
                {num(exam.publishedCount)} published
              </Badge>
              {classId ? (
                <Badge variant={classPublished ? "default" : "outline"}>
                  {classPublished ? "Class published" : "Class draft"}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Mark sheet</CardTitle>
            <CardDescription>
              Spreadsheet view by class — subjects as columns. Publish applies
              to the whole class.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Select
                  value={classId}
                  onValueChange={(v) => {
                    setClassId(v);
                    setDirty(false);
                  }}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={save}
                disabled={saving || !dirty || studentRows.length === 0}
              >
                {saving ? "Saving…" : "Save marks"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetMarks}
                disabled={saving || studentRows.length === 0}
              >
                Reset marks
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => publishClass(true)}
                disabled={publishing || sheets.length === 0 || classPublished}
              >
                Publish class
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => publishClass(false)}
                disabled={publishing || sheets.length === 0 || !classHasPublished}
              >
                Unpublish class
              </Button>
            </div>

            {studentRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No mark sheets for this class.
              </p>
            ) : (
              <MarkSheetGrid
                studentRows={studentRows}
                subjectCols={subjectCols}
                marks={marks}
                rowStats={rowStats}
                maxTotal={maxTotal}
                onMarksChange={(sheetId, value) => {
                  setMarks((m) => ({ ...m, [sheetId]: value }));
                  setDirty(true);
                }}
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <form onSubmit={onSaveEdit}>
              <DialogHeader>
                <DialogTitle>Edit examination</DialogTitle>
                <DialogDescription>
                  Update details and papers. Adding a subject creates mark
                  sheets; removing one deletes that subject&apos;s marks.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="detail-edit-name">Name</Label>
                    <Input
                      id="detail-edit-name"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="detail-edit-date">Exam date</Label>
                    <Input
                      id="detail-edit-date"
                      type="date"
                      value={editForm.examDate}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          examDate: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="detail-edit-desc">Description</Label>
                  <Textarea
                    id="detail-edit-desc"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Scope</Label>
                  <Select
                    value={editForm.scope}
                    onValueChange={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        scope: v as ExamScope,
                        classIds: v === "SCHOOL" ? [] : f.classIds,
                      }))
                    }
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLASSES">Selected classes</SelectItem>
                      <SelectItem value="SCHOOL">
                        All classes (pick subjects)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.scope === "CLASSES" ? (
                  <div className="space-y-2">
                    <Label>Classes</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {editYearClasses.map((c) => {
                        const id = str(c.id);
                        return (
                          <label
                            key={id}
                            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="size-4 rounded border"
                              checked={editForm.classIds.includes(id)}
                              onChange={() => toggleEditClass(id)}
                            />
                            {formatClassLabel(
                              str(c.classLevel),
                              c.section as string | null,
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-3">
                  <Label>Subjects / papers</Label>
                  {editSelectedClassIds.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Select classes to choose subjects.
                    </p>
                  ) : (
                    editSelectedClassIds.map((cId) => {
                      const klass = editYearClasses.find(
                        (c) => str(c.id) === cId,
                      );
                      if (!klass) return null;
                      const subjects = arr(klass.classSubjects);
                      return (
                        <div
                          key={cId}
                          className="space-y-2 rounded-xl border p-3"
                        >
                          <p className="text-sm font-medium">
                            {formatClassLabel(
                              str(klass.classLevel),
                              klass.section as string | null,
                            )}
                          </p>
                          <div className="space-y-2">
                            {subjects.map((cs) => {
                              const subject = obj(cs.subject);
                              const subjectId = str(
                                subject.id || cs.subjectId,
                              );
                              const key = paperKey(cId, subjectId);
                              const selected = key in editForm.papers;
                              return (
                                <div
                                  key={key}
                                  className="flex flex-wrap items-center gap-3"
                                >
                                  <label className="flex min-w-[160px] items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      className="size-4 rounded border"
                                      checked={selected}
                                      onChange={() =>
                                        toggleEditPaper(cId, subjectId)
                                      }
                                    />
                                    {str(subject.name) || "Subject"}
                                  </label>
                                  {selected ? (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-muted-foreground text-xs">
                                        Max
                                      </Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className="h-8 w-20"
                                        value={editForm.papers[key]}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            papers: {
                                              ...f.papers,
                                              [key]: e.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
