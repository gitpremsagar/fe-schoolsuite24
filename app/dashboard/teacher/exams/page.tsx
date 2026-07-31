"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
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
type PaperKey = string;

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

export default function TeacherExamsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = str(user?.id);

  const [classes, setClasses] = useState<Row[]>([]);
  const [exams, setExams] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    examDate: "",
    papers: {} as Record<PaperKey, string>,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    examDate: "",
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

  const myAssignments = useMemo(() => {
    const items: Array<{
      classId: string;
      subjectId: string;
      classLabel: string;
      subjectName: string;
      academicYearId: string;
    }> = [];
    for (const klass of classes) {
      const classId = str(klass.id);
      const classLabel = formatClassLabel(
        str(klass.classLevel),
        klass.section as string | null,
      );
      const year = obj(klass.academicYear);
      for (const cs of arr(klass.classSubjects)) {
        const staff = obj(cs.staffProfile);
        const staffUser = obj(staff.user);
        if (userId && str(staffUser.id) !== userId) continue;
        const subject = obj(cs.subject);
        const subjectId = str(subject.id || cs.subjectId);
        if (!subjectId) continue;
        items.push({
          classId,
          subjectId,
          classLabel,
          subjectName: str(subject.name) || "Subject",
          academicYearId: str(klass.academicYearId || year.id),
        });
      }
    }
    return items;
  }, [classes, userId]);

  const load = useCallback(async () => {
    const [classesRes, examsRes] = await Promise.all([
      schoolApi.classes.mine(),
      examsApi.list(),
    ]);
    setClasses(classesRes.classes);
    setExams(examsRes.examinations);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((err) => {
        if (active) handleErr(err, "Failed to load exams");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, handleErr]);

  function togglePaper(classId: string, subjectId: string) {
    const key = paperKey(classId, subjectId);
    setForm((f) => {
      const next = { ...f.papers };
      if (key in next) delete next[key];
      else next[key] = "100";
      return { ...f, papers: next };
    });
  }

  function toggleSelectAllPapers() {
    setForm((f) => {
      const next: Record<PaperKey, string> = {};
      for (const a of myAssignments) {
        const key = paperKey(a.classId, a.subjectId);
        next[key] = f.papers[key] ?? "100";
      }
      return { ...f, papers: next };
    });
  }

  function clearAllPapers() {
    setForm((f) => ({ ...f, papers: {} }));
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
      setError("Select at least one assigned subject.");
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

    const classIds = [...new Set(papers.map((p) => p.classId))];
    const academicYearId =
      myAssignments.find((a) => a.classId === classIds[0])?.academicYearId ||
      undefined;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await examsApi.create({
        name,
        description: form.description.trim() || null,
        examDate: form.examDate,
        academicYearId,
        scope: "CLASSES",
        classIds,
        papers,
      });
      setForm({ name: "", description: "", examDate: "", papers: {} });
      setShowForm(false);
      setMessage("Examination created with mark sheets.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to create examination");
    } finally {
      setSaving(false);
    }
  }

  function isOwner(exam: Row) {
    return userId && str(exam.createdById) === userId;
  }

  function openEdit(exam: Row) {
    const papersMap: Record<PaperKey, string> = {};
    for (const p of arr(exam.papers)) {
      papersMap[paperKey(str(p.classId), str(p.subjectId))] = String(
        num(p.maxMarks) || 100,
      );
    }
    setEditingId(str(exam.id));
    setEditForm({
      name: str(exam.name),
      description: exam.description ? str(exam.description) : "",
      examDate: toDateInput(str(exam.examDate)),
      papers: papersMap,
    });
    setEditOpen(true);
    setError("");
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
      const next: Record<PaperKey, string> = {};
      for (const a of myAssignments) {
        const key = paperKey(a.classId, a.subjectId);
        next[key] = f.papers[key] ?? "100";
      }
      return { ...f, papers: next };
    });
  }

  function clearAllEditPapers() {
    setEditForm((f) => ({ ...f, papers: {} }));
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
      setError("Select at least one assigned subject.");
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
    const classIds = [...new Set(papers.map((p) => p.classId))];

    setEditSaving(true);
    setError("");
    setMessage("");
    try {
      await examsApi.update(editingId, {
        name,
        description: editForm.description.trim() || null,
        examDate: editForm.examDate,
        scope: "CLASSES",
        classIds,
        papers,
      });
      setEditOpen(false);
      setEditingId(null);
      setMessage("Examination updated.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to update examination");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete(exam: Row) {
    const id = str(exam.id);
    const ok = window.confirm(
      `Delete examination "${str(exam.name)}"?\n\nThis permanently removes all mark sheets for this exam.`,
    );
    if (!ok) return;
    setDeletingId(id);
    setError("");
    setMessage("");
    try {
      await examsApi.remove(id);
      setMessage("Examination deleted.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to delete examination");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <DashboardShell allowedRoles={["TEACHER"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
            <p className="text-muted-foreground text-sm">
              Create exams for your assigned subjects and enter marks.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
            disabled={myAssignments.length === 0}
          >
            {showForm ? (
              "Cancel"
            ) : (
              <>
                <Plus className="size-4" />
                Create exam
              </>
            )}
          </Button>
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
                Only your assigned class subjects are available.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={onCreate}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="t-exam-name">Name</Label>
                    <Input
                      id="t-exam-name"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="Unit Test / Chapter Test"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-exam-date">Exam date</Label>
                    <Input
                      id="t-exam-date"
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
                  <Label htmlFor="t-exam-desc">Description (optional)</Label>
                  <Textarea
                    id="t-exam-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Your subjects</Label>
                    {myAssignments.length > 0 ? (
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
                  {myAssignments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No subjects are assigned to you yet.
                    </p>
                  ) : (
                    myAssignments.map((a) => {
                      const key = paperKey(a.classId, a.subjectId);
                      const selected = key in form.papers;
                      return (
                        <div
                          key={key}
                          className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
                        >
                          <label className="flex min-w-[200px] items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-4 rounded border"
                              checked={selected}
                              onChange={() =>
                                togglePaper(a.classId, a.subjectId)
                              }
                            />
                            {a.classLabel} · {a.subjectName}
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
              No examinations for your subjects yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Papers</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={str(exam.id)}>
                    <TableCell>
                      <div className="font-medium">{str(exam.name)}</div>
                    </TableCell>
                    <TableCell>
                      {formatDisplayDate(str(exam.examDate))}
                    </TableCell>
                    <TableCell>{arr(exam.papers).length}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {num(exam.markedCount)}/{num(exam.markSheetCount)} marked
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/dashboard/teacher/exams/${str(exam.id)}`}
                          >
                            Open
                          </Link>
                        </Button>
                        {isOwner(exam) ? (
                          <>
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
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <form onSubmit={onSaveEdit}>
              <DialogHeader>
                <DialogTitle>Edit examination</DialogTitle>
                <DialogDescription>
                  Update details and your subjects. Adding creates mark sheets;
                  removing deletes that subject&apos;s marks.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="t-edit-name">Name</Label>
                    <Input
                      id="t-edit-name"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-edit-date">Exam date</Label>
                    <Input
                      id="t-edit-date"
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
                  <Label htmlFor="t-edit-desc">Description</Label>
                  <Textarea
                    id="t-edit-desc"
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Your subjects</Label>
                    {myAssignments.length > 0 ? (
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
                  {myAssignments.map((a) => {
                    const key = paperKey(a.classId, a.subjectId);
                    const selected = key in editForm.papers;
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
                      >
                        <label className="flex min-w-[200px] items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 rounded border"
                            checked={selected}
                            onChange={() =>
                              toggleEditPaper(a.classId, a.subjectId)
                            }
                          />
                          {a.classLabel} · {a.subjectName}
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
