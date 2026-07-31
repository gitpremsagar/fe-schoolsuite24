"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { formatClassLabel } from "@/lib/class-levels";
import { ClassTimetableEditor } from "@/components/classes/class-timetable-editor";

type Row = Record<string, unknown>;
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

function subjectAssignmentsFromClass(c: Row): SubjectTeacherMap {
  const map: SubjectTeacherMap = {};
  for (const link of arr(c.classSubjects)) {
    const subjectId = str(obj(link).subjectId) || str(obj(link.subject).id);
    if (!subjectId) continue;
    const teacherId = str(obj(link).staffProfileId);
    map[subjectId] = teacherId || null;
  }
  return map;
}

function subjectsPayload(map: SubjectTeacherMap) {
  return Object.entries(map).map(([subjectId, staffProfileId]) => ({
    subjectId,
    staffProfileId,
  }));
}

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = str(params.id);

  const [klass, setKlass] = useState<Row | null>(null);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [otherClasses, setOtherClasses] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [editSubjectTeachers, setEditSubjectTeachers] =
    useState<SubjectTeacherMap>({});
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [copySelectKey, setCopySelectKey] = useState(0);
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assigning, setAssigning] = useState(false);

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
    if (!classId) return;
    setLoading(true);
    setError("");
    try {
      const [classRes, subjectsRes, staffRes] = await Promise.all([
        schoolApi.classes.get(classId),
        schoolApi.subjects.list(),
        schoolApi.staff.list("TEACHER"),
      ]);
      setKlass(classRes.class);
      setSubjects(subjectsRes.subjects);
      setTeachers(staffRes.staff);

      const yearId = str(classRes.class.academicYearId);
      const classesRes = await schoolApi.classes.list(yearId || undefined);
      setOtherClasses(
        classesRes.classes.filter((c) => str(c.id) !== classId),
      );
    } catch (err) {
      handleErr(err, "Failed to load class");
    } finally {
      setLoading(false);
    }
  }, [classId, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleEditSubject(subjectId: string) {
    setEditSubjectTeachers((prev) => {
      const next = { ...prev };
      if (Object.prototype.hasOwnProperty.call(next, subjectId)) {
        delete next[subjectId];
      } else {
        next[subjectId] = null;
      }
      return next;
    });
  }

  function setEditSubjectTeacher(subjectId: string, staffProfileId: string) {
    setEditSubjectTeachers((prev) => ({
      ...prev,
      [subjectId]: staffProfileId === NO_TEACHER ? null : staffProfileId,
    }));
  }

  function copySubjectsFromClass(sourceClassId: string) {
    const source = otherClasses.find((c) => str(c.id) === sourceClassId);
    if (!source) return;
    const assignments = subjectAssignmentsFromClass(source);
    setEditSubjectTeachers(assignments);
    setCopySelectKey((k) => k + 1);
    setError("");
    const label = formatClassLabel(
      str(source.classLevel),
      str(source.section) || null,
    );
    const count = Object.keys(assignments).length;
    setMessage(
      count === 0
        ? `Copied from ${label}: no subjects assigned — review and save`
        : `Copied subjects from ${label} — review and save`,
    );
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
      const subjectsRes = await schoolApi.subjects.list();
      setSubjects(subjectsRes.subjects);
      if (!editingSubjects) {
        const current = klass
          ? subjectAssignmentsFromClass(klass)
          : {};
        setEditSubjectTeachers({ ...current, [id]: null });
        setEditingSubjects(true);
      } else {
        setEditSubjectTeachers((prev) =>
          Object.prototype.hasOwnProperty.call(prev, id)
            ? prev
            : { ...prev, [id]: null },
        );
      }
      setMessage("Subject created and selected. Save to assign it to this class.");
    } catch (err) {
      handleErr(err, "Failed to create subject");
    } finally {
      setAddingSubject(false);
    }
  }

  async function saveClassSubjects() {
    if (!classId) return;
    setSavingSubjects(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.classes.setSubjects(classId, {
        subjects: subjectsPayload(editSubjectTeachers),
      });
      setEditingSubjects(false);
      setMessage("Subjects updated.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to update subjects");
    } finally {
      setSavingSubjects(false);
    }
  }

  async function onAssignTeacher() {
    if (!classId || !assignTeacherId) {
      setError("Select a teacher to assign.");
      return;
    }
    setAssigning(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.classes.assignTeacher(classId, {
        staffProfileId: assignTeacherId,
        isPrimary: true,
      });
      setMessage("Class teacher assigned.");
      setAssignTeacherId("");
      await load();
    } catch (err) {
      handleErr(err, "Failed to assign teacher");
    } finally {
      setAssigning(false);
    }
  }

  const year = obj(klass?.academicYear);
  const classTeacher = obj(klass?.classTeacher);
  const enrollments = arr(klass?.enrollments);
  const classSubjects = arr(klass?.classSubjects);
  const title = klass
    ? formatClassLabel(str(klass.classLevel), str(klass.section) || null)
    : "Class";

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {loading ? "Class" : title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Class details, subjects, and enrolled students.
            </p>
          </div>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/school/classes">Back to classes</Link>
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading class...</p>
        ) : klass ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>
                  {str(year.name) || "Academic year"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Class" value={str(klass.classLevel)} />
                <DetailItem
                  label="Section"
                  value={str(klass.section) || "—"}
                />
                <DetailItem label="Academic year" value={str(year.name)} />
                <DetailItem
                  label="Monthly fee"
                  value={
                    klass.monthlyFee == null ? "—" : String(num(klass.monthlyFee))
                  }
                />
                <DetailItem
                  label="Students"
                  value={String(num(obj(klass._count).enrollments))}
                />
                <DetailItem
                  label="Class teacher"
                  value={str(classTeacher.name) || "—"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Class teacher</CardTitle>
                  <CardDescription>
                    Homeroom teacher for this class.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label>Assign teacher</Label>
                    <Select
                      value={assignTeacherId}
                      onValueChange={setAssignTeacherId}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Select teacher" />
                      </SelectTrigger>
                      <SelectContent>
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
                  </div>
                  <Button
                    type="button"
                    disabled={assigning || !assignTeacherId}
                    onClick={() => void onAssignTeacher()}
                  >
                    {assigning ? "Saving..." : "Assign"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Subjects</CardTitle>
                  <CardDescription>
                    Subjects taught in this class and their teachers.
                  </CardDescription>
                </div>
                {!editingSubjects ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditSubjectTeachers(subjectAssignmentsFromClass(klass));
                      setEditingSubjects(true);
                    }}
                  >
                    Edit subjects
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {editingSubjects ? (
                  <div className="space-y-3">
                    {otherClasses.length > 0 ? (
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">
                          Copy from class
                        </Label>
                        <Select
                          key={copySelectKey}
                          onValueChange={copySubjectsFromClass}
                        >
                          <SelectTrigger className="w-full sm:w-64">
                            <SelectValue placeholder="Select a class…" />
                          </SelectTrigger>
                          <SelectContent>
                            {otherClasses.map((c) => (
                              <SelectItem key={str(c.id)} value={str(c.id)}>
                                {formatClassLabel(
                                  str(c.classLevel),
                                  str(c.section) || null,
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                      {subjects.length === 0 ? (
                        <p className="px-1 py-2 text-sm text-muted-foreground">
                          No subjects in the catalog yet. Add one below.
                        </p>
                      ) : (
                        subjects.map((s) => {
                          const sid = str(s.id);
                          const checked =
                            Object.prototype.hasOwnProperty.call(
                              editSubjectTeachers,
                              sid,
                            );
                          return (
                            <div
                              key={sid}
                              className="flex flex-wrap items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                            >
                              <label className="flex min-w-[140px] cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleEditSubject(sid)}
                                />
                                {str(s.name)}
                              </label>
                              {checked ? (
                                <Select
                                  value={
                                    editSubjectTeachers[sid] || NO_TEACHER
                                  }
                                  onValueChange={(v) =>
                                    setEditSubjectTeacher(sid, v)
                                  }
                                >
                                  <SelectTrigger className="h-8 w-44">
                                    <SelectValue placeholder="Teacher" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NO_TEACHER}>
                                      No teacher
                                    </SelectItem>
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
                              ) : null}
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
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void onAddSubjectInline();
                            }
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={addingSubject || !newSubjectName.trim()}
                        onClick={() => void onAddSubjectInline()}
                      >
                        {addingSubject ? "Adding..." : "Add subject"}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingSubjects}
                        onClick={() => void saveClassSubjects()}
                      >
                        {savingSubjects ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingSubjects(false);
                          setNewSubjectName("");
                          setCopySelectKey((k) => k + 1);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : classSubjects.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      No subjects assigned yet.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[180px] flex-1 space-y-1">
                        <Label className="text-muted-foreground">
                          Add new subject
                        </Label>
                        <Input
                          value={newSubjectName}
                          placeholder="e.g. Mathematics"
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void onAddSubjectInline();
                            }
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={addingSubject || !newSubjectName.trim()}
                        onClick={() => void onAddSubjectInline()}
                      >
                        {addingSubject ? "Adding..." : "Add subject"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">#</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Teacher</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...classSubjects]
                          .sort((a, b) =>
                            str(obj(a.subject).name).localeCompare(
                              str(obj(b.subject).name),
                            ),
                          )
                          .map((link, index) => (
                            <TableRow key={str(link.id)}>
                              <TableCell className="text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-medium">
                                {str(obj(link.subject).name) || "—"}
                              </TableCell>
                              <TableCell>
                                {str(obj(obj(link.staffProfile).user).name) ||
                                  "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[180px] flex-1 space-y-1">
                        <Label className="text-muted-foreground">
                          Add new subject
                        </Label>
                        <Input
                          value={newSubjectName}
                          placeholder="e.g. Mathematics"
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void onAddSubjectInline();
                            }
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={addingSubject || !newSubjectName.trim()}
                        onClick={() => void onAddSubjectInline()}
                      >
                        {addingSubject ? "Adding..." : "Add subject"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <ClassTimetableEditor
              classId={classId}
              klass={klass}
              onClassUpdated={(updated) =>
                setKlass((prev) => (prev ? { ...prev, ...updated } : updated))
              }
              onError={handleErr}
              onMessage={(msg) => {
                setError("");
                setMessage(msg);
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Students</CardTitle>
                <CardDescription>
                  Active enrollments in this class.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No students enrolled yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Roll</TableHead>
                        <TableHead>Admission #</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollments.map((e, index) => {
                        const profile = obj(e.studentProfile);
                        const user = obj(profile.user);
                        return (
                          <TableRow key={str(e.id)}>
                            <TableCell className="text-muted-foreground">
                              {index + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              <Link
                                href={`/dashboard/school/students/${str(profile.id)}`}
                                className="hover:underline"
                              >
                                {str(user.name) || "—"}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {str(e.rollNumber) ||
                                str(profile.rollNumber) ||
                                "—"}
                            </TableCell>
                            <TableCell>
                              {str(profile.admissionNumber) || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
