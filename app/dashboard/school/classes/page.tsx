"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { CLASS_LEVELS, formatClassLabel } from "@/lib/class-levels";

type Row = Record<string, unknown>;
/** subjectId → staffProfileId (null = no teacher assigned) */
type SubjectTeacherMap = Record<string, string | null>;

const NO_TEACHER = "__none__";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function teacherNameFromClass(c: Row): string {
  const primary = obj(c.classTeacher);
  if (primary.name) return str(primary.name);
  const teachers = arr(c.teachers);
  const first = teachers[0] ? obj(obj(teachers[0]).staffProfile).user : null;
  const user = obj(first);
  return str(user.name) || "—";
}

function subjectsPayload(map: SubjectTeacherMap) {
  return Object.entries(map).map(([subjectId, staffProfileId]) => ({
    subjectId,
    staffProfileId,
  }));
}

export default function ClassesPage() {
  const router = useRouter();
  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [filterYear, setFilterYear] = useState<string>("ALL");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    academicYearId: "",
    classLevel: "",
    section: "",
    monthlyFee: "",
    subjectTeachers: {} as SubjectTeacherMap,
  });
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFee, setEditFee] = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [assigningClassId, setAssigningClassId] = useState<string | null>(null);
  const [assignTeacherId, setAssignTeacherId] = useState<
    Record<string, string>
  >({});

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

  const loadClasses = useCallback(
    async (yearId?: string) => {
      try {
        const res = await schoolApi.classes.list(
          yearId && yearId !== "ALL" ? yearId : undefined,
        );
        setClasses(res.classes);
      } catch (err) {
        handleErr(err, "Failed to load classes");
      }
    },
    [handleErr],
  );

  const loadSubjects = useCallback(async () => {
    const res = await schoolApi.subjects.list();
    setSubjects(res.subjects);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [yr, staffRes, subjectsRes] = await Promise.all([
          schoolApi.academicYears.list(),
          schoolApi.staff.list("TEACHER"),
          schoolApi.subjects.list(),
        ]);
        if (!active) return;
        setYears(yr.academicYears);
        setTeachers(staffRes.staff);
        setSubjects(subjectsRes.subjects);
        const current = yr.academicYears.find((y) => y.isCurrent);
        if (current) {
          setForm((p) => ({ ...p, academicYearId: str(current.id) }));
        }
        await loadClasses();
      } catch (err) {
        handleErr(err, "Failed to load data");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [handleErr, loadClasses]);

  function toggleFormSubject(subjectId: string) {
    setForm((prev) => {
      const next = { ...prev.subjectTeachers };
      if (Object.prototype.hasOwnProperty.call(next, subjectId)) {
        delete next[subjectId];
      } else {
        next[subjectId] = null;
      }
      return { ...prev, subjectTeachers: next };
    });
  }

  function setFormSubjectTeacher(subjectId: string, staffProfileId: string) {
    setForm((prev) => ({
      ...prev,
      subjectTeachers: {
        ...prev.subjectTeachers,
        [subjectId]: staffProfileId === NO_TEACHER ? null : staffProfileId,
      },
    }));
  }

  async function onAddSubjectInline() {
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    setAddingSubject(true);
    setError("");
    try {
      const res = await schoolApi.subjects.create({ name: trimmed });
      const id = str(res.subject.id);
      setNewSubjectName("");
      await loadSubjects();
      setForm((p) => ({
        ...p,
        subjectTeachers: Object.prototype.hasOwnProperty.call(
          p.subjectTeachers,
          id,
        )
          ? p.subjectTeachers
          : { ...p.subjectTeachers, [id]: null },
      }));
    } catch (err) {
      handleErr(err, "Failed to create subject");
    } finally {
      setAddingSubject(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const fee =
        form.monthlyFee.trim() === "" ? null : Number(form.monthlyFee);
      if (fee != null && (Number.isNaN(fee) || fee < 0)) {
        setError("Monthly fee must be a non-negative number.");
        setSaving(false);
        return;
      }
      await schoolApi.classes.create({
        academicYearId: form.academicYearId,
        classLevel: form.classLevel,
        ...(form.section ? { section: form.section } : {}),
        monthlyFee: fee,
        subjects: subjectsPayload(form.subjectTeachers),
      });
      setForm((p) => ({
        ...p,
        classLevel: "",
        section: "",
        monthlyFee: "",
        subjectTeachers: {},
      }));
      setNewSubjectName("");
      setShowForm(false);
      setMessage("Class created.");
      await loadClasses(filterYear);
    } catch (err) {
      handleErr(err, "Failed to create class");
    } finally {
      setSaving(false);
    }
  }

  async function saveMonthlyFee(classId: string) {
    setSavingFee(true);
    setError("");
    setMessage("");
    try {
      const fee = editFee.trim() === "" ? null : Number(editFee);
      if (fee != null && (Number.isNaN(fee) || fee < 0)) {
        setError("Monthly fee must be a non-negative number.");
        setSavingFee(false);
        return;
      }
      await schoolApi.classes.update(classId, { monthlyFee: fee });
      setEditingId(null);
      setMessage("Monthly fee updated.");
      await loadClasses(filterYear);
    } catch (err) {
      handleErr(err, "Failed to update monthly fee");
    } finally {
      setSavingFee(false);
    }
  }

  async function onAssignTeacher(classId: string) {
    const staffProfileId = assignTeacherId[classId];
    if (!staffProfileId) {
      setError("Select a teacher to assign.");
      return;
    }
    setAssigningClassId(classId);
    setError("");
    setMessage("");
    try {
      await schoolApi.classes.assignTeacher(classId, {
        staffProfileId,
        isPrimary: true,
      });
      setMessage("Teacher assigned to class.");
      await loadClasses(filterYear);
    } catch (err) {
      handleErr(err, "Failed to assign teacher");
    } finally {
      setAssigningClassId(null);
    }
  }

  function renderTeacherSelect(
    subjectId: string,
    value: string | null | undefined,
    onChange: (staffProfileId: string) => void,
  ) {
    return (
      <Select value={value || NO_TEACHER} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-40">
          <SelectValue placeholder="Teacher" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEACHER}>No teacher</SelectItem>
          {teachers.map((t) => {
            const user = obj(t.user);
            return (
              <SelectItem key={str(t.id)} value={str(t.id)}>
                {str(user.name)}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Classes</h1>
            <p className="text-sm text-muted-foreground">
              Classes are identified by class level and section. Open a class to
              view subjects and students.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add class"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New class</CardTitle>
              <CardDescription>
                Choose a class level and optional section for an academic year.
                Assign subjects and the teacher for each subject.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {years.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create an academic year first.
                </p>
              ) : (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreate}>
                  <div className="space-y-1">
                    <Label>Academic year</Label>
                    <Select
                      value={form.academicYearId}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, academicYearId: v }))
                      }
                    >
                      <SelectTrigger className="w-full">
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
                  <div className="space-y-1">
                    <Label>Class</Label>
                    <Select
                      value={form.classLevel}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, classLevel: v }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Section</Label>
                    <Input
                      value={form.section}
                      placeholder="A"
                      onChange={(e) =>
                        setForm((p) => ({ ...p, section: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Monthly fee</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.monthlyFee}
                      placeholder="Amount"
                      onChange={(e) =>
                        setForm((p) => ({ ...p, monthlyFee: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Subjects</Label>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                      {subjects.length === 0 ? (
                        <p className="px-1 py-2 text-sm text-muted-foreground">
                          No subjects yet. Add one below.
                        </p>
                      ) : (
                        subjects.map((s) => {
                          const id = str(s.id);
                          const checked =
                            Object.prototype.hasOwnProperty.call(
                              form.subjectTeachers,
                              id,
                            );
                          return (
                            <div
                              key={id}
                              className="flex flex-wrap items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                            >
                              <label className="flex min-w-[140px] cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleFormSubject(id)}
                                />
                                {str(s.name)}
                              </label>
                              {checked
                                ? renderTeacherSelect(
                                    id,
                                    form.subjectTeachers[id],
                                    (v) => setFormSubjectTeacher(id, v),
                                  )
                                : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[180px] flex-1 space-y-1">
                        <Label className="text-muted-foreground">
                          Add new subject
                        </Label>
                        <Input
                          value={newSubjectName}
                          placeholder="e.g. Mathematics"
                          onChange={(e) => setNewSubjectName(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={addingSubject || !newSubjectName.trim()}
                        onClick={() => void onAddSubjectInline()}
                      >
                        {addingSubject ? "Adding..." : "Add subject"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-end md:col-span-2">
                    <Button
                      type="submit"
                      disabled={
                        saving || !form.academicYearId || !form.classLevel
                      }
                    >
                      {saving ? "Creating..." : "Create class"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label>Filter by year</Label>
            <Select
              value={filterYear}
              onValueChange={(v) => {
                setFilterYear(v);
                void loadClasses(v);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={str(y.id)} value={str(y.id)}>
                    {str(y.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <LoadingPulseCard />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Monthly fee</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Class teacher</TableHead>
                    <TableHead>Assign teacher</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No classes yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    classes.map((c) => {
                      const year = obj(c.academicYear);
                      const count = obj(c._count);
                      const id = str(c.id);
                      const isEditing = editingId === id;
                      return (
                        <TableRow key={id}>
                          <TableCell className="font-medium">
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 font-medium"
                              asChild
                            >
                              <Link href={`/dashboard/school/classes/${id}`}>
                                {formatClassLabel(
                                  str(c.classLevel),
                                  str(c.section) || null,
                                )}
                              </Link>
                            </Button>
                          </TableCell>
                          <TableCell>{str(c.section) || "—"}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="h-8 w-28"
                                  value={editFee}
                                  onChange={(e) => setEditFee(e.target.value)}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingFee}
                                  onClick={() => void saveMonthlyFee(id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="text-left hover:underline"
                                onClick={() => {
                                  setEditingId(id);
                                  setEditFee(
                                    c.monthlyFee == null
                                      ? ""
                                      : String(c.monthlyFee),
                                  );
                                }}
                              >
                                {c.monthlyFee == null
                                  ? "Set fee"
                                  : num(c.monthlyFee)}
                              </button>
                            )}
                          </TableCell>
                          <TableCell>{str(year.name) || "—"}</TableCell>
                          <TableCell>{num(count.enrollments)}</TableCell>
                          <TableCell>{teacherNameFromClass(c)}</TableCell>
                          <TableCell>
                            <div className="flex min-w-[220px] items-center gap-2">
                              <Select
                                value={assignTeacherId[id] ?? ""}
                                onValueChange={(v) =>
                                  setAssignTeacherId((p) => ({
                                    ...p,
                                    [id]: v,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 w-40">
                                  <SelectValue placeholder="Select teacher" />
                                </SelectTrigger>
                                <SelectContent>
                                  {teachers.map((t) => {
                                    const user = obj(t.user);
                                    return (
                                      <SelectItem
                                        key={str(t.id)}
                                        value={str(t.id)}
                                      >
                                        {str(user.name)}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  assigningClassId === id ||
                                  !assignTeacherId[id] ||
                                  teachers.length === 0
                                }
                                onClick={() => void onAssignTeacher(id)}
                              >
                                {assigningClassId === id
                                  ? "Saving..."
                                  : "Assign"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
