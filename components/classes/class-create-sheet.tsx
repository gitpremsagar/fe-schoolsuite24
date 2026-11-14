"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { CLASS_LEVELS } from "@/lib/class-levels";

type Row = Record<string, unknown>;
/** subjectId → staffProfileId (null = no teacher assigned) */
type SubjectTeacherMap = Record<string, string | null>;

const NO_TEACHER = "__none__";

const emptyForm = {
  academicYearId: "",
  classLevel: "",
  section: "",
  monthlyFee: "",
  subjectTeachers: {} as SubjectTeacherMap,
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

function subjectsPayload(map: SubjectTeacherMap) {
  return Object.entries(map).map(([subjectId, staffProfileId]) => ({
    subjectId,
    staffProfileId,
  }));
}

type ClassCreateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  years: Row[];
  teachers: Row[];
  subjects: Row[];
  onSubjectCreated: () => Promise<void> | void;
  onCreated: () => Promise<void> | void;
};

export function ClassCreateSheet({
  open,
  onOpenChange,
  years,
  teachers,
  subjects,
  onSubjectCreated,
  onCreated,
}: ClassCreateSheetProps) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(emptyForm);
      setNewSubjectName("");
      setError("");
      setSaving(false);
      setAddingSubject(false);
    }
    onOpenChange(next);
  }

  const defaultYearId = str(
    (years.find((y) => y.isCurrent) ?? years[0])?.id,
  );
  const academicYearId = form.academicYearId || defaultYearId;

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
      await onSubjectCreated();
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
    try {
      const fee =
        form.monthlyFee.trim() === "" ? null : Number(form.monthlyFee);
      if (fee != null && (Number.isNaN(fee) || fee < 0)) {
        setError("Monthly fee must be a non-negative number.");
        setSaving(false);
        return;
      }
      await schoolApi.classes.create({
        academicYearId,
        classLevel: form.classLevel,
        ...(form.section ? { section: form.section } : {}),
        monthlyFee: fee,
        subjects: subjectsPayload(form.subjectTeachers),
      });
      handleOpenChange(false);
      await onCreated();
    } catch (err) {
      handleErr(err, "Failed to create class");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New class</SheetTitle>
          <SheetDescription>
            Choose a class level and optional section for an academic year.
            Assign subjects and the teacher for each subject.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-4 pb-4">
          {error ? (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          ) : null}

          {years.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create an academic year first.
            </p>
          ) : (
            <form
              id="class-create-sheet-form"
              className="grid gap-3"
              onSubmit={onCreate}
            >
              <div className="space-y-1">
                <Label>Academic year</Label>
                <Select
                  value={academicYearId}
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
              <div className="space-y-2">
                <Label>Subjects</Label>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {subjects.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">
                      No subjects yet. Add one below.
                    </p>
                  ) : (
                    subjects.map((s) => {
                      const id = str(s.id);
                      const checked = Object.prototype.hasOwnProperty.call(
                        form.subjectTeachers,
                        id,
                      );
                      return (
                        <div
                          key={id}
                          className="flex flex-wrap items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                        >
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFormSubject(id)}
                            />
                            {str(s.name)}
                          </label>
                          {checked ? (
                            <Select
                              value={form.subjectTeachers[id] || NO_TEACHER}
                              onValueChange={(v) =>
                                setFormSubjectTeacher(id, v)
                              }
                            >
                              <SelectTrigger className="ml-auto h-8 w-40">
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
            </form>
          )}
        </div>

        <SheetFooter className="border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="class-create-sheet-form"
            disabled={
              saving ||
              years.length === 0 ||
              !academicYearId ||
              !form.classLevel
            }
          >
            {saving ? "Creating..." : "Create class"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
