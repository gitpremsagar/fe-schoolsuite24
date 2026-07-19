"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

function StaffTable({
  title,
  description,
  rows,
  loading,
  emptyLabel,
}: {
  title: string;
  description: string;
  rows: Row[];
  loading: boolean;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Classes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => {
                const user = obj(s.user);
                const assignments = Array.isArray(s.classAssignments)
                  ? (s.classAssignments as Row[])
                  : [];
                const classLabels = assignments
                  .map((a) => {
                    const klass = obj(a.class);
                    return formatClassLabel(
                      str(klass.classLevel) || str(klass.name),
                      str(klass.section) || null,
                    );
                  })
                  .filter((label) => label && label !== "—");
                const detailHref = `/dashboard/school/staff/${str(s.id)}`;
                const editHref = `/dashboard/school/staff/${str(s.id)}/edit`;
                const inactive = user.isActive === false;
                return (
                  <TableRow
                    key={str(s.id)}
                    className={inactive ? "opacity-60" : undefined}
                  >
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={editHref}
                          className="inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit staff"
                          aria-label={`Edit ${str(user.name)}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <Link href={detailHref} className="hover:underline">
                          {str(user.name)}
                        </Link>
                        {inactive ? (
                          <span className="text-xs text-muted-foreground">
                            (inactive)
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>{str(s.employeeCode)}</TableCell>
                    <TableCell>{str(user.email)}</TableCell>
                    <TableCell>{str(s.designation) || "—"}</TableCell>
                    <TableCell>{str(s.department) || "—"}</TableCell>
                    <TableCell>
                      {classLabels.length > 0 ? classLabels.join(", ") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    staffType: "TEACHER",
    employeeCode: "",
    designation: "",
    department: "",
    joiningDate: "",
    leavingDate: "",
    isCurrentlyWorking: true,
    expectedPunchInTime: "",
    expectedPunchOutTime: "",
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.staff.list();
      setStaff(res.staff);
    } catch (err) {
      handleErr(err, "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const teachers = useMemo(
    () => staff.filter((s) => str(s.staffType) === "TEACHER"),
    [staff],
  );
  const otherStaff = useMemo(
    () => staff.filter((s) => str(s.staffType) !== "TEACHER"),
    [staff],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.staff.create({
        name: form.name,
        email: form.email,
        password: form.password,
        staffType: form.staffType,
        employeeCode: form.employeeCode,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.designation ? { designation: form.designation } : {}),
        ...(form.department ? { department: form.department } : {}),
        ...(form.joiningDate ? { joiningDate: form.joiningDate } : {}),
        isCurrentlyWorking: form.isCurrentlyWorking,
        ...(!form.isCurrentlyWorking && form.leavingDate
          ? { leavingDate: form.leavingDate }
          : {}),
        ...(form.expectedPunchInTime
          ? { expectedPunchInTime: form.expectedPunchInTime }
          : {}),
        ...(form.expectedPunchOutTime
          ? { expectedPunchOutTime: form.expectedPunchOutTime }
          : {}),
      });
      setMessage("Staff member created.");
      setForm((p) => ({
        ...p,
        name: "",
        email: "",
        password: "",
        phone: "",
        employeeCode: "",
        designation: "",
        department: "",
        joiningDate: "",
        leavingDate: "",
        isCurrentlyWorking: true,
        expectedPunchInTime: "",
        expectedPunchOutTime: "",
      }));
      setShowForm(false);
      await load();
    } catch (err) {
      handleErr(err, "Failed to create staff");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Staff</h1>
            <p className="text-sm text-muted-foreground">
              Create teachers and employees for your school.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add staff"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New staff member</CardTitle>
              <CardDescription>
                Teachers can mark attendance; employees can punch in/out.
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
                  <Label>Staff type</Label>
                  <Select
                    value={form.staffType}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, staffType: v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEACHER">Teacher</SelectItem>
                      <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Employee code</Label>
                  <Input
                    value={form.employeeCode}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, employeeCode: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Designation</Label>
                  <Input
                    value={form.designation}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, designation: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Department</Label>
                  <Input
                    value={form.department}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, department: e.target.value }))
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
                    value={form.isCurrentlyWorking ? "working" : "left"}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        isCurrentlyWorking: v === "working",
                        leavingDate: v === "working" ? "" : p.leavingDate,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working">Currently working</SelectItem>
                      <SelectItem value="left">Left school</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!form.isCurrentlyWorking ? (
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
                  <Label>Punch-in time</Label>
                  <Input
                    type="time"
                    value={form.expectedPunchInTime}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        expectedPunchInTime: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Punch-out time</Label>
                  <Input
                    type="time"
                    value={form.expectedPunchOutTime}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        expectedPunchOutTime: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-end md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create staff"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <StaffTable
          title="Teachers"
          description="Teaching staff who can mark class attendance."
          rows={teachers}
          loading={loading}
          emptyLabel="No teachers yet."
        />

        <StaffTable
          title="Other staff"
          description="Employees and non-teaching staff."
          rows={otherStaff}
          loading={loading}
          emptyLabel="No other staff yet."
        />
      </div>
    </DashboardShell>
  );
}
