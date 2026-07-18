"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { formatClassLabel } from "@/lib/class-levels";
import {
  downloadStudentImportTemplate,
  parseStudentImportFile,
} from "@/lib/student-import";

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
  const [filterYearId, setFilterYearId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    processed: number;
    created: number;
    failed: number;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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
  const [saving, setSaving] = useState(false);

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
    try {
      const [yr, cl] = await Promise.all([
        schoolApi.academicYears.list(),
        schoolApi.classes.list(),
      ]);
      setYears(yr.academicYears);
      setClasses(cl.classes);
      const current = yr.academicYears.find((y) => y.isCurrent);
      const currentId = current ? str(current.id) : str(yr.academicYears[0]?.id);
      setFilterYearId((prev) => prev || currentId);
      if (currentId) {
        setForm((p) => ({
          ...p,
          academicYearId: p.academicYearId || currentId,
        }));
      }
    } catch (err) {
      handleErr(err, "Failed to load students");
    }
  }, [handleErr]);

  const loadStudents = useCallback(async () => {
    if (!filterYearId) return;
    setLoading(true);
    setError("");
    try {
      const st = await schoolApi.students.list({
        academicYearId: filterYearId,
      });
      setStudents(st.students);
    } catch (err) {
      handleErr(err, "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [filterYearId, handleErr]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const classesForCreate = useMemo(
    () =>
      classes.filter(
        (c) =>
          !form.academicYearId || str(c.academicYearId) === form.academicYearId,
      ),
    [classes, form.academicYearId],
  );

  const selectedYearName = useMemo(() => {
    const y = years.find((row) => str(row.id) === filterYearId);
    return y ? str(y.name) : "";
  }, [years, filterYearId]);

  async function refresh() {
    await Promise.all([loadMeta(), loadStudents()]);
  }

  async function onImportExcel(file: File) {
    setImporting(true);
    setError("");
    setMessage("");
    setImportProgress(null);
    try {
      const rows = await parseStudentImportFile(file);
      const total = rows.length;
      const batchSize = 10;
      let created = 0;
      const allFailed: Array<{
        row: number;
        email?: string;
        error: string;
      }> = [];

      setImportProgress({
        total,
        processed: 0,
        created: 0,
        failed: 0,
      });

      for (let start = 0; start < total; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        const rowOffset = start + 2; // Excel header is row 1
        const result = await schoolApi.students.bulkCreate(
          batch as Array<Record<string, unknown>>,
          { rowOffset },
        );
        created += result.created;
        allFailed.push(...result.failed);
        setImportProgress({
          total,
          processed: Math.min(start + batch.length, total),
          created,
          failed: allFailed.length,
        });
      }

      const failParts = allFailed.slice(0, 5).map((f) => {
        const who = f.email ? ` (${f.email})` : "";
        return `Row ${f.row}${who}: ${f.error}`;
      });
      const more =
        allFailed.length > 5
          ? ` …and ${allFailed.length - 5} more.`
          : "";
      setMessage(
        `Imported ${created} student(s).` +
          (allFailed.length
            ? ` ${allFailed.length} failed. ${failParts.join("; ")}${more}`
            : ""),
      );
      if (allFailed.length && created === 0) {
        setError("No students were imported. Check the errors above.");
      }
      await refresh();
    } catch (err) {
      handleErr(err, "Failed to import students");
    } finally {
      setImporting(false);
      setImportProgress(null);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

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
        ...(form.fatherName ? { fatherName: form.fatherName } : {}),
        ...(form.motherName ? { motherName: form.motherName } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.rollNumber ? { rollNumber: form.rollNumber } : {}),
        ...(form.permanentAddress
          ? { permanentAddress: form.permanentAddress }
          : {}),
        ...(form.currentAddress ? { currentAddress: form.currentAddress } : {}),
        ...(form.bloodGroup ? { bloodGroup: form.bloodGroup } : {}),
        ...(form.joiningDate ? { joiningDate: form.joiningDate } : {}),
        isCurrentlyStudying: form.isCurrentlyStudying,
        ...(!form.isCurrentlyStudying && form.leavingDate
          ? { leavingDate: form.leavingDate }
          : {}),
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
        fatherName: "",
        motherName: "",
        permanentAddress: "",
        currentAddress: "",
        bloodGroup: "",
        joiningDate: "",
        leavingDate: "",
        isCurrentlyStudying: true,
        classId: "",
      }));
      setShowCreateForm(false);
      await refresh();
    } catch (err) {
      handleErr(err, "Failed to create student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Students</h1>
            <p className="text-sm text-muted-foreground">
              Create student accounts and manage class enrollment.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Academic year</Label>
              <Select value={filterYearId} onValueChange={setFilterYearId}>
                <SelectTrigger className="w-48">
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
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => downloadStudentImportTemplate()}
            >
              Download sample Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? "Importing..." : "Import Excel"}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportExcel(file);
              }}
            />
            <Button
              type="button"
              variant={showCreateForm ? "outline" : "default"}
              disabled={importing}
              onClick={() => setShowCreateForm((v) => !v)}
            >
              {showCreateForm ? "Cancel" : "Add student"}
            </Button>
          </div>
        </div>

        {importProgress ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm">
              Importing {importProgress.processed}/{importProgress.total}
              … ({importProgress.created} created, {importProgress.failed}{" "}
              failed)
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{
                  width: `${
                    importProgress.total === 0
                      ? 0
                      : Math.round(
                          (importProgress.processed / importProgress.total) *
                            100,
                        )
                  }%`,
                }}
              />
            </div>
          </div>
        ) : null}

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
                  <Label>
                    Password <span className="text-destructive">*</span>
                  </Label>
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
                <div className="space-y-1">
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
                <div className="space-y-1">
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
                          {formatClassLabel(
                            str(c.classLevel) || str(c.name),
                            str(c.section) || null,
                          )}
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
                      {selectedYearName
                        ? `No students enrolled for ${selectedYearName}.`
                        : "No students yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((s) => {
                    const user = obj(s.user);
                    const enrollments = arr(s.enrollments);
                    const current = enrollments[0];
                    const klass = current ? obj(current.class) : {};
                    const detailHref = `/dashboard/school/students/${str(s.id)}`;
                    const editHref = filterYearId
                      ? `/dashboard/school/students/${str(s.id)}/edit?year=${encodeURIComponent(filterYearId)}`
                      : `/dashboard/school/students/${str(s.id)}/edit`;
                    return (
                      <TableRow key={str(s.id)}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              href={editHref}
                              className="inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Edit student"
                              aria-label={`Edit ${str(user.name)}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                              href={detailHref}
                              className="hover:underline"
                            >
                              {str(user.name)}
                            </Link>
                          </span>
                        </TableCell>
                        <TableCell>{str(s.admissionNumber)}</TableCell>
                        <TableCell>{str(user.email)}</TableCell>
                        <TableCell>
                          {klass.classLevel || klass.name
                            ? formatClassLabel(
                                str(klass.classLevel || klass.name),
                                str(klass.section) || null,
                              )
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
