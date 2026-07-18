"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
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

  const load = useCallback(
    async (staffType?: string) => {
      setLoading(true);
      setError("");
      try {
        const res = await schoolApi.staff.list(
          staffType && staffType !== "ALL" ? staffType : undefined,
        );
        setStaff(res.staff);
      } catch (err) {
        handleErr(err, "Failed to load staff");
      } finally {
        setLoading(false);
      }
    },
    [handleErr],
  );

  useEffect(() => {
    void load();
  }, [load]);

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
      }));
      setShowForm(false);
      await load(filter);
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
                <div className="flex items-end md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create staff"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label>Filter</Label>
            <Select
              value={filter}
              onValueChange={(v) => {
                setFilter(v);
                void load(v);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All staff</SelectItem>
                <SelectItem value="TEACHER">Teachers</SelectItem>
                <SelectItem value="EMPLOYEE">Employees</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Designation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No staff yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((s) => {
                    const user = obj(s.user);
                    return (
                      <TableRow key={str(s.id)}>
                        <TableCell className="font-medium">
                          {str(user.name)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {str(s.staffType)}
                          </Badge>
                        </TableCell>
                        <TableCell>{str(s.employeeCode)}</TableCell>
                        <TableCell>{str(user.email)}</TableCell>
                        <TableCell>{str(s.designation) || "—"}</TableCell>
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
