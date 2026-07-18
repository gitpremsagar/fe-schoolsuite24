"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Row[]>([]);
  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    admissionNumber: "",
    rollNumber: "",
    guardianName: "",
    guardianPhone: "",
    academicYearId: "",
    classId: "",
  });
  const [saving, setSaving] = useState(false);

  const [enroll, setEnroll] = useState({
    studentId: "",
    academicYearId: "",
    classId: "",
    rollNumber: "",
  });
  const [enrolling, setEnrolling] = useState(false);

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
    try {
      const [st, yr, cl] = await Promise.all([
        schoolApi.students.list(),
        schoolApi.academicYears.list(),
        schoolApi.classes.list(),
      ]);
      setStudents(st.students);
      setYears(yr.academicYears);
      setClasses(cl.classes);
      const current = yr.academicYears.find((y) => y.isCurrent);
      if (current) {
        setForm((p) => ({ ...p, academicYearId: str(current.id) }));
        setEnroll((p) => ({ ...p, academicYearId: str(current.id) }));
      }
    } catch (err) {
      handleErr(err, "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const classesForCreate = useMemo(
    () =>
      classes.filter(
        (c) => !form.academicYearId || str(c.academicYearId) === form.academicYearId,
      ),
    [classes, form.academicYearId],
  );
  const classesForEnroll = useMemo(
    () =>
      classes.filter(
        (c) =>
          !enroll.academicYearId ||
          str(c.academicYearId) === enroll.academicYearId,
      ),
    [classes, enroll.academicYearId],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.students.create({
        name: form.name,
        email: form.email,
        password: form.password,
        admissionNumber: form.admissionNumber,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.rollNumber ? { rollNumber: form.rollNumber } : {}),
        ...(form.guardianName ? { guardianName: form.guardianName } : {}),
        ...(form.guardianPhone ? { guardianPhone: form.guardianPhone } : {}),
        ...(form.classId && form.academicYearId
          ? { classId: form.classId, academicYearId: form.academicYearId }
          : {}),
      });
      setMessage("Student created.");
      setForm((p) => ({
        ...p,
        name: "",
        email: "",
        password: "",
        phone: "",
        admissionNumber: "",
        rollNumber: "",
        guardianName: "",
        guardianPhone: "",
        classId: "",
      }));
      setShowCreateForm(false);
      await load();
    } catch (err) {
      handleErr(err, "Failed to create student");
    } finally {
      setSaving(false);
    }
  }

  async function onEnroll(e: React.FormEvent) {
    e.preventDefault();
    setEnrolling(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.students.enroll(enroll.studentId, {
        classId: enroll.classId,
        academicYearId: enroll.academicYearId,
        ...(enroll.rollNumber ? { rollNumber: enroll.rollNumber } : {}),
      });
      setMessage("Student enrolled.");
      setEnroll((p) => ({ ...p, studentId: "", classId: "", rollNumber: "" }));
      setShowEnrollForm(false);
      await load();
    } catch (err) {
      handleErr(err, "Failed to enroll student");
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Students</h1>
            <p className="text-sm text-muted-foreground">
              Create student accounts and enroll them into classes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={showCreateForm ? "outline" : "default"}
              onClick={() => {
                setShowCreateForm((v) => !v);
                if (!showCreateForm) setShowEnrollForm(false);
              }}
            >
              {showCreateForm ? "Cancel" : "Add student"}
            </Button>
            <Button
              type="button"
              variant={showEnrollForm ? "outline" : "secondary"}
              onClick={() => {
                setShowEnrollForm((v) => !v);
                if (!showEnrollForm) setShowCreateForm(false);
              }}
            >
              {showEnrollForm ? "Cancel" : "Enroll student"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {showCreateForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New student</CardTitle>
              <CardDescription>
                Optionally enroll into a class right away.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreate}>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
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
                  <Label>Password</Label>
                  <Input
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                    required
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
                  <Label>Admission number</Label>
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
                  <Label>Guardian name</Label>
                  <Input
                    value={form.guardianName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, guardianName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Guardian phone</Label>
                  <Input
                    value={form.guardianPhone}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, guardianPhone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Academic year (optional)</Label>
                  <Select
                    value={form.academicYearId}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        academicYearId: v,
                        classId: "",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={str(y.id)} value={str(y.id)}>
                          {str(y.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Class (optional)</Label>
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
                      {classesForCreate.map((c) => (
                        <SelectItem key={str(c.id)} value={str(c.id)}>
                          {str(c.name)}
                          {c.section ? ` - ${str(c.section)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create student"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {showEnrollForm ? (
          <Card>
            <CardHeader>
              <CardTitle>Enroll existing student</CardTitle>
              <CardDescription>
                Move or enroll a student into a class for an academic year.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={onEnroll}>
                <div className="space-y-1">
                  <Label>Student</Label>
                  <Select
                    value={enroll.studentId}
                    onValueChange={(v) =>
                      setEnroll((p) => ({ ...p, studentId: v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((s) => {
                        const user = obj(s.user);
                        return (
                          <SelectItem key={str(s.id)} value={str(s.id)}>
                            {str(user.name)} ({str(s.admissionNumber)})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Roll number</Label>
                  <Input
                    value={enroll.rollNumber}
                    onChange={(e) =>
                      setEnroll((p) => ({ ...p, rollNumber: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Academic year</Label>
                  <Select
                    value={enroll.academicYearId}
                    onValueChange={(v) =>
                      setEnroll((p) => ({
                        ...p,
                        academicYearId: v,
                        classId: "",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={str(y.id)} value={str(y.id)}>
                          {str(y.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Class</Label>
                  <Select
                    value={enroll.classId}
                    onValueChange={(v) =>
                      setEnroll((p) => ({ ...p, classId: v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classesForEnroll.map((c) => (
                        <SelectItem key={str(c.id)} value={str(c.id)}>
                          {str(c.name)}
                          {c.section ? ` - ${str(c.section)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Button
                    type="submit"
                    disabled={
                      enrolling ||
                      !enroll.studentId ||
                      !enroll.classId ||
                      !enroll.academicYearId
                    }
                  >
                    {enrolling ? "Enrolling..." : "Enroll student"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Admission #</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No students yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((s) => {
                    const user = obj(s.user);
                    const enrollments = arr(s.enrollments);
                    const current = enrollments[0];
                    const klass = current ? obj(current.class) : {};
                    return (
                      <TableRow key={str(s.id)}>
                        <TableCell className="font-medium">
                          {str(user.name)}
                        </TableCell>
                        <TableCell>{str(s.admissionNumber)}</TableCell>
                        <TableCell>{str(user.email)}</TableCell>
                        <TableCell>
                          {klass.name
                            ? `${str(klass.name)}${
                                klass.section ? ` - ${str(klass.section)}` : ""
                              }`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
