"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { examsApi, schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";

type Row = Record<string, unknown>;
type ExamScope = "SCHOOL" | "CLASSES";
type PaperKey = string; // classId:subjectId

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

function paperKey(classId: string, subjectId: string): PaperKey {
  return `${classId}:${subjectId}`;
}

function emptyForm() {
  return {
    name: "",
    description: "",
    examDate: "",
    academicYearId: "",
    scope: "CLASSES" as ExamScope,
    classIds: [] as string[],
    /** paperKey → maxMarks string */
    papers: {} as Record<PaperKey, string>,
  };
}

export default function SchoolExamsPage() {
  const router = useRouter();
  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [exams, setExams] = useState<Row[]>([]);
  const [filterYearId, setFilterYearId] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const loadMeta = useCallback(async () => {
    const [yearsRes, classesRes] = await Promise.all([
      schoolApi.academicYears.list(),
      schoolApi.classes.list(),
    ]);
    setYears(yearsRes.academicYears);
    setClasses(classesRes.classes);
    const current = yearsRes.academicYears.find((y) => y.isCurrent);
    const yearId = current
      ? str(current.id)
      : yearsRes.academicYears[0]
        ? str(yearsRes.academicYears[0].id)
        : "";
    setFilterYearId((prev) => prev || yearId);
    setForm((f) => ({
      ...f,
      academicYearId: f.academicYearId || yearId,
    }));
  }, []);

  const loadExams = useCallback(async () => {
    if (!filterYearId) {
      setExams([]);
      return;
    }
    const res = await examsApi.list(filterYearId);
    setExams(res.examinations);
  }, [filterYearId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadMeta()
      .catch((err) => {
        if (active) handleErr(err, "Failed to load data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadMeta, handleErr]);

  useEffect(() => {
    let active = true;
    if (!filterYearId) return;
    loadExams().catch((err) => {
      if (active) handleErr(err, "Failed to load exams");
    });
    return () => {
      active = false;
    };
  }, [filterYearId, loadExams, handleErr]);

  const formYearClasses = useMemo(() => {
    const yearId = form.academicYearId || filterYearId;
    return classes.filter((c) => str(c.academicYearId) === yearId);
  }, [classes, form.academicYearId, filterYearId]);

  const selectedClassIds = useMemo(() => {
    if (form.scope === "SCHOOL") {
      return formYearClasses.map((c) => str(c.id));
    }
    return form.classIds;
  }, [form.scope, form.classIds, formYearClasses]);

  const editYearClasses = useMemo(() => {
    const yearId = editForm.academicYearId || filterYearId;
    return classes.filter((c) => str(c.academicYearId) === yearId);
  }, [classes, editForm.academicYearId, filterYearId]);

  const editSelectedClassIds = useMemo(() => {
    if (editForm.scope === "SCHOOL") {
      return editYearClasses.map((c) => str(c.id));
    }
    return editForm.classIds;
  }, [editForm.scope, editForm.classIds, editYearClasses]);

  function toggleClass(classId: string) {
    setForm((f) => {
      const next = f.classIds.includes(classId)
        ? f.classIds.filter((id) => id !== classId)
        : [...f.classIds, classId];
      const nextPapers = { ...f.papers };
      if (!next.includes(classId)) {
        for (const key of Object.keys(nextPapers)) {
          if (key.startsWith(`${classId}:`)) delete nextPapers[key];
        }
      }
      return { ...f, classIds: next, papers: nextPapers };
    });
  }

  function togglePaper(classId: string, subjectId: string) {
    const key = paperKey(classId, subjectId);
    setForm((f) => {
      const next = { ...f.papers };
      if (key in next) {
        delete next[key];
      } else {
        next[key] = "100";
      }
      return { ...f, papers: next };
    });
  }

  function collectClassSubjectKeys(
    classIds: string[],
    yearClasses: Row[],
  ): Array<{ classId: string; subjectId: string }> {
    const items: Array<{ classId: string; subjectId: string }> = [];
    for (const classId of classIds) {
      const klass = yearClasses.find((c) => str(c.id) === classId);
      if (!klass) continue;
      for (const cs of arr(klass.classSubjects)) {
        const subject = obj(cs.subject);
        const subjectId = str(subject.id || cs.subjectId);
        if (subjectId) items.push({ classId, subjectId });
      }
    }
    return items;
  }

  /** All class IDs in the form's academic year (not only already-checked classes). */
  function yearClassIds(yearClasses: Row[]) {
    return yearClasses.map((c) => str(c.id)).filter(Boolean);
  }

  function buildPapersForItems(
    items: Array<{ classId: string; subjectId: string }>,
    existing: Record<PaperKey, string>,
  ) {
    const next: Record<PaperKey, string> = {};
    for (const a of items) {
      const key = paperKey(a.classId, a.subjectId);
      next[key] = existing[key] ?? "100";
    }
    return next;
  }

  function toggleSelectAllPapers() {
    setForm((f) => {
      const allClassIds = yearClassIds(formYearClasses);
      const items = collectClassSubjectKeys(allClassIds, formYearClasses);
      return {
        ...f,
        papers: buildPapersForItems(items, f.papers),
        ...(f.scope === "CLASSES" ? { classIds: allClassIds } : {}),
      };
    });
  }

  function clearAllPapers() {
    setForm((f) => ({
      ...f,
      papers: {},
      ...(f.scope === "CLASSES" ? { classIds: [] as string[] } : {}),
    }));
  }

  function toggleEditClass(classId: string) {
    setEditForm((f) => {
      const next = f.classIds.includes(classId)
        ? f.classIds.filter((id) => id !== classId)
        : [...f.classIds, classId];
      const nextPapers = { ...f.papers };
      if (!next.includes(classId)) {
        for (const key of Object.keys(nextPapers)) {
          if (key.startsWith(`${classId}:`)) delete nextPapers[key];
        }
      }
      return { ...f, classIds: next, papers: nextPapers };
    });
  }

  function toggleEditPaper(classId: string, subjectId: string) {
    const key = paperKey(classId, subjectId);
    setEditForm((f) => {
      const next = { ...f.papers };
      if (key in next) delete next[key];
      else next[key] = "100";
      return { ...f, papers: next };
    });
  }

  function toggleSelectAllEditPapers() {
    setEditForm((f) => {
      const allClassIds = yearClassIds(editYearClasses);
      const items = collectClassSubjectKeys(allClassIds, editYearClasses);
      return {
        ...f,
        papers: buildPapersForItems(items, f.papers),
        ...(f.scope === "CLASSES" ? { classIds: allClassIds } : {}),
      };
    });
  }

  function clearAllEditPapers() {
    setEditForm((f) => ({
      ...f,
      papers: {},
      ...(f.scope === "CLASSES" ? { classIds: [] as string[] } : {}),
    }));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Exam name is required.");
      return;
    }
    if (!form.examDate) {
      setError("Exam date is required.");
      return;
    }
    const paperEntries = Object.entries(form.papers);
    if (paperEntries.length === 0) {
      setError("Select at least one subject paper.");
      return;
    }
    if (form.scope === "CLASSES" && form.classIds.length === 0) {
      setError("Select at least one class.");
      return;
    }

    const papers = paperEntries.map(([key, maxMarksStr]) => {
      const [classId, subjectId] = key.split(":");
      const maxMarks = Number(maxMarksStr);
      return { classId, subjectId, maxMarks };
    });
    if (papers.some((p) => !p.maxMarks || p.maxMarks <= 0)) {
      setError("Each paper needs a positive max marks value.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await examsApi.create({
        name,
        description: form.description.trim() || null,
        examDate: form.examDate,
        academicYearId: form.academicYearId || filterYearId,
        scope: form.scope,
        classIds: form.scope === "CLASSES" ? form.classIds : undefined,
        papers,
      });
      setForm({
        ...emptyForm(),
        academicYearId: form.academicYearId || filterYearId,
      });
      setShowForm(false);
      setMessage("Examination created with mark sheets.");
      await loadExams();
    } catch (err) {
      handleErr(err, "Failed to create examination");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(exam: Row) {
    const papersMap: Record<PaperKey, string> = {};
    const classIdSet = new Set<string>();
    for (const p of arr(exam.papers)) {
      const classId = str(p.classId);
      const subjectId = str(p.subjectId);
      papersMap[paperKey(classId, subjectId)] = String(num(p.maxMarks) || 100);
      classIdSet.add(classId);
    }
    for (const c of arr(exam.classes)) {
      classIdSet.add(str(c.classId));
    }
    setEditingId(str(exam.id));
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

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
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
    if (editForm.scope === "CLASSES" && editForm.classIds.length === 0) {
      setError("Select at least one class.");
      return;
    }
    const papers = paperEntries.map(([key, maxMarksStr]) => {
      const [classId, subjectId] = key.split(":");
      return { classId, subjectId, maxMarks: Number(maxMarksStr) };
    });
    if (papers.some((p) => !p.maxMarks || p.maxMarks <= 0)) {
      setError("Each paper needs a positive max marks value.");
      return;
    }

    setEditSaving(true);
    setError("");
    setMessage("");
    try {
      await examsApi.update(editingId, {
        name,
        description: editForm.description.trim() || null,
        examDate: editForm.examDate,
        scope: editForm.scope,
        classIds: editForm.scope === "CLASSES" ? editForm.classIds : undefined,
        papers,
      });
      setEditOpen(false);
      setEditingId(null);
      setMessage("Examination updated.");
      await loadExams();
    } catch (err) {
      handleErr(err, "Failed to update examination");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete(exam: Row) {
    const id = str(exam.id);
    const name = str(exam.name);
    const ok = window.confirm(
      `Delete examination "${name}"?\n\nThis permanently removes all mark sheets for this exam.`,
    );
    if (!ok) return;
    setDeletingId(id);
    setError("");
    setMessage("");
    try {
      await examsApi.remove(id);
      setMessage("Examination deleted.");
      await loadExams();
    } catch (err) {
      handleErr(err, "Failed to delete examination");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
            <p className="text-muted-foreground text-sm">
              Create school-wide or class exams and generate student mark
              sheets.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
            disabled={!filterYearId}
          >
            {showForm ? "Cancel" : (
              <>
                <Plus className="size-4" />
                Create exam
              </>
            )}
          </Button>
        </div>

        <div className="space-y-1">
          <Label>Academic year</Label>
          <Select value={filterYearId} onValueChange={setFilterYearId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={str(y.id)} value={str(y.id)}>
                  {str(y.name)}
                  {y.isCurrent ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New examination</CardTitle>
              <CardDescription>
                Select classes and subjects. Mark sheets are created for every
                enrolled student and selected subject.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={onCreate}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="exam-name">Name</Label>
                    <Input
                      id="exam-name"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="Mid-term / Unit Test 1"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exam-date">Exam date</Label>
                    <Input
                      id="exam-date"
                      type="date"
                      value={form.examDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, examDate: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="exam-desc">Description (optional)</Label>
                  <Textarea
                    id="exam-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    rows={2}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Scope</Label>
                  <Select
                    value={form.scope}
                    onValueChange={(v) =>
                      setForm((f) => ({
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

                {form.scope === "CLASSES" ? (
                  <div className="space-y-2">
                    <Label>Classes</Label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {formYearClasses.map((c) => {
                        const id = str(c.id);
                        const checked = form.classIds.includes(id);
                        return (
                          <label
                            key={id}
                            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="size-4 rounded border"
                              checked={checked}
                              onChange={() => toggleClass(id)}
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
                  <div className="flex items-center justify-between gap-2">
                    <Label>Subjects / papers</Label>
                    {formYearClasses.length > 0 ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs"
                          onClick={toggleSelectAllPapers}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs"
                          onClick={clearAllPapers}
                          disabled={Object.keys(form.papers).length === 0}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {selectedClassIds.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Select classes to choose subjects.
                    </p>
                  ) : (
                    selectedClassIds.map((classId) => {
                      const klass = formYearClasses.find(
                        (c) => str(c.id) === classId,
                      );
                      if (!klass) return null;
                      const subjects = arr(klass.classSubjects);
                      return (
                        <div
                          key={classId}
                          className="space-y-2 rounded-xl border p-3"
                        >
                          <p className="text-sm font-medium">
                            {formatClassLabel(
                              str(klass.classLevel),
                              klass.section as string | null,
                            )}
                          </p>
                          {subjects.length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                              No subjects assigned to this class.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {subjects.map((cs) => {
                                const subject = obj(cs.subject);
                                const subjectId = str(subject.id || cs.subjectId);
                                const key = paperKey(classId, subjectId);
                                const selected = key in form.papers;
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
                                          togglePaper(classId, subjectId)
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
                                          value={form.papers[key]}
                                          onChange={(e) =>
                                            setForm((f) => ({
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
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <Button type="submit" disabled={saving}>
                  {saving ? "Creating…" : "Create examination"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <LoadingPulseCard />
        ) : exams.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No examinations for this academic year yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Papers</TableHead>
                  <TableHead>Mark sheets</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => {
                  const papers = arr(exam.papers);
                  const classesList = arr(exam.classes);
                  return (
                    <TableRow key={str(exam.id)}>
                      <TableCell>
                        <div className="font-medium">{str(exam.name)}</div>
                        {exam.description ? (
                          <div className="text-muted-foreground text-xs">
                            {str(exam.description)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {formatDisplayDate(str(exam.examDate))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {exam.scope === "SCHOOL"
                            ? "School"
                            : `${classesList.length} class${classesList.length === 1 ? "" : "es"}`}
                        </Badge>
                      </TableCell>
                      <TableCell>{papers.length}</TableCell>
                      <TableCell>
                        {num(exam.markedCount)}/{num(exam.markSheetCount)} marked
                        · {num(exam.publishedCount)} published
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/dashboard/school/exams/${str(exam.id)}`}
                            >
                              Open
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(exam)}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={deletingId === str(exam.id)}
                            onClick={() => onDelete(exam)}
                          >
                            <Trash2 className="size-3.5" />
                            {deletingId === str(exam.id)
                              ? "Deleting…"
                              : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

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
                    <Label htmlFor="edit-exam-name">Name</Label>
                    <Input
                      id="edit-exam-name"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-exam-date">Exam date</Label>
                    <Input
                      id="edit-exam-date"
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
                  <Label htmlFor="edit-exam-desc">Description</Label>
                  <Textarea
                    id="edit-exam-desc"
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
                  <div className="flex items-center justify-between gap-2">
                    <Label>Subjects / papers</Label>
                    {editYearClasses.length > 0 ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs"
                          onClick={toggleSelectAllEditPapers}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs"
                          onClick={clearAllEditPapers}
                          disabled={Object.keys(editForm.papers).length === 0}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {editSelectedClassIds.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Select classes to choose subjects.
                    </p>
                  ) : (
                    editSelectedClassIds.map((classId) => {
                      const klass = editYearClasses.find(
                        (c) => str(c.id) === classId,
                      );
                      if (!klass) return null;
                      const subjects = arr(klass.classSubjects);
                      return (
                        <div
                          key={classId}
                          className="space-y-2 rounded-xl border p-3"
                        >
                          <p className="text-sm font-medium">
                            {formatClassLabel(
                              str(klass.classLevel),
                              klass.section as string | null,
                            )}
                          </p>
                          {subjects.length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                              No subjects assigned to this class.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {subjects.map((cs) => {
                                const subject = obj(cs.subject);
                                const subjectId = str(
                                  subject.id || cs.subjectId,
                                );
                                const key = paperKey(classId, subjectId);
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
                                          toggleEditPaper(classId, subjectId)
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
                          )}
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
