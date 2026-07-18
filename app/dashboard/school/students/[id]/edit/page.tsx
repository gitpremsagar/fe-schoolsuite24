"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function toDateInput(v: unknown): string {
  if (v == null || v === "") return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function EditStudentPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = str(params.id);
  const yearQuery = searchParams.get("year") ?? "";

  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    admissionNumber: "",
    rollNumber: "",
    fatherName: "",
    motherName: "",
    permanentAddress: "",
    currentAddress: "",
    bloodGroup: "",
    joiningDate: "",
    leavingDate: "",
    isCurrentlyStudying: true,
    academicYearId: "",
    classId: "",
  });

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
    if (!studentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [yr, cl, st] = await Promise.all([
          schoolApi.academicYears.list(),
          schoolApi.classes.list(),
          schoolApi.students.get(studentId),
        ]);
        if (!active) return;

        setYears(yr.academicYears);
        setClasses(cl.classes);

        const student = st.student;
        const user = obj(student.user);
        const enrollments = arr(student.enrollments);
        const currentYear =
          yr.academicYears.find((y) => y.isCurrent) ?? yr.academicYears[0];
        const preferredYearId =
          (yearQuery &&
          yr.academicYears.some((y) => str(y.id) === yearQuery)
            ? yearQuery
            : "") ||
          str(enrollments[0]?.academicYearId) ||
          str(currentYear?.id);

        const enrollmentForYear =
          enrollments.find(
            (e) => str(e.academicYearId) === preferredYearId,
          ) ?? null;

        setForm({
          name: str(user.name),
          email: str(user.email),
          password: "",
          phone: str(user.phone),
          admissionNumber: str(student.admissionNumber),
          rollNumber: str(
            enrollmentForYear?.rollNumber ?? student.rollNumber,
          ),
          fatherName: str(student.fatherName),
          motherName: str(student.motherName),
          permanentAddress: str(student.permanentAddress),
          currentAddress: str(student.currentAddress),
          bloodGroup: str(student.bloodGroup),
          joiningDate: toDateInput(student.joiningDate ?? student.joinedOn),
          leavingDate: toDateInput(student.leavingDate),
          isCurrentlyStudying:
            student.isCurrentlyStudying === undefined
              ? true
              : Boolean(student.isCurrentlyStudying),
          academicYearId: preferredYearId,
          classId: str(enrollmentForYear?.classId),
        });
        setStudentEnrollments(enrollments);
      } catch (err) {
        handleErr(err, "Failed to load student");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [studentId, yearQuery, handleErr]);

  const classesForYear = useMemo(
    () =>
      classes.filter(
        (c) =>
          !form.academicYearId ||
          str(c.academicYearId) === form.academicYearId,
      ),
    [classes, form.academicYearId],
  );

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        admissionNumber: form.admissionNumber,
        rollNumber: form.rollNumber || null,
        fatherName: form.fatherName || null,
        motherName: form.motherName || null,
        permanentAddress: form.permanentAddress || null,
        currentAddress: form.currentAddress || null,
        bloodGroup: form.bloodGroup || null,
        joiningDate: form.joiningDate || null,
        isCurrentlyStudying: form.isCurrentlyStudying,
        leavingDate: form.isCurrentlyStudying
          ? null
          : form.leavingDate || null,
      };
      if (form.password.trim()) {
        body.password = form.password;
      }
      if (form.academicYearId && form.classId) {
        body.academicYearId = form.academicYearId;
        body.classId = form.classId;
      }
      await schoolApi.students.update(studentId, body);
      setMessage("Student updated.");
      router.push(`/dashboard/school/students/${studentId}`);
    } catch (err) {
      handleErr(err, "Failed to update student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Edit student</h1>
            <p className="text-sm text-muted-foreground">
              Update profile details and class enrollment.
            </p>
          </div>
          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/school/students/${studentId}`}>
              Back to student
            </Link>
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading student...</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{form.name || "Student"}</CardTitle>
              <CardDescription>
                Leave password blank to keep the current password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={onSave}>
                <div className="space-y-1">
                  <Label>
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>New password</Label>
                  <Input
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Admission number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.admissionNumber}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        admissionNumber: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Roll number</Label>
                  <Input
                    value={form.rollNumber}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, rollNumber: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Father&apos;s name</Label>
                  <Input
                    value={form.fatherName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, fatherName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mother&apos;s name</Label>
                  <Input
                    value={form.motherName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, motherName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Permanent address</Label>
                  <Input
                    value={form.permanentAddress}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        permanentAddress: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Current address</Label>
                  <Input
                    value={form.currentAddress}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        currentAddress: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Blood group</Label>
                  <Input
                    value={form.bloodGroup}
                    placeholder="e.g. O+"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, bloodGroup: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Joining date</Label>
                  <Input
                    type="date"
                    value={form.joiningDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, joiningDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.isCurrentlyStudying ? "studying" : "left"}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        isCurrentlyStudying: v === "studying",
                        leavingDate: v === "studying" ? "" : p.leavingDate,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="studying">Currently studying</SelectItem>
                      <SelectItem value="left">Left school</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!form.isCurrentlyStudying ? (
                  <div className="space-y-1">
                    <Label>Leaving date</Label>
                    <Input
                      type="date"
                      value={form.leavingDate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, leavingDate: e.target.value }))
                      }
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Academic year</Label>
                  <Select
                    value={form.academicYearId}
                    onValueChange={(v) => {
                      const enrollment = studentEnrollments.find(
                        (e) => str(e.academicYearId) === v,
                      );
                      setForm((p) => ({
                        ...p,
                        academicYearId: v,
                        classId: str(enrollment?.classId),
                        rollNumber: str(
                          enrollment?.rollNumber ?? p.rollNumber,
                        ),
                      }));
                    }}
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
                    value={form.classId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, classId: v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classesForYear.map((c) => (
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
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href={`/dashboard/school/students/${studentId}`}>
                      Cancel
                    </Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
