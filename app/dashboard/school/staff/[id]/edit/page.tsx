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

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

function toDateInput(v: unknown): string {
  if (v == null || v === "") return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function EditStaffPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = str(params.id);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
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
    if (!staffId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await schoolApi.staff.get(staffId);
        if (!active) return;
        const staff = res.staff;
        const user = obj(staff.user);
        const school = obj(staff.school);
        setIsAdminAccount(
          str(staff.staffType) === "ADMIN" ||
            str(user.role) === "ADMIN" ||
            str(user.role) === "SUPER_ADMIN" ||
            (str(school.ownerId) !== "" &&
              str(school.ownerId) === str(user.id)),
        );
        setAdminPassword("");
        setForm({
          name: str(user.name),
          email: str(user.email),
          password: "",
          phone: str(user.phone),
          staffType: str(staff.staffType) || "TEACHER",
          employeeCode: str(staff.employeeCode),
          designation: str(staff.designation),
          department: str(staff.department),
          joiningDate: toDateInput(staff.joiningDate),
          leavingDate: toDateInput(staff.leavingDate),
          isCurrentlyWorking:
            staff.isCurrentlyWorking === undefined
              ? true
              : Boolean(staff.isCurrentlyWorking),
          expectedPunchInTime: str(staff.expectedPunchInTime),
          expectedPunchOutTime: str(staff.expectedPunchOutTime),
        });
      } catch (err) {
        handleErr(err, "Failed to load staff");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [staffId, handleErr]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId) return;
    if (isAdminAccount && !adminPassword.trim()) {
      setError("Enter your admin password to edit this admin account.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        employeeCode: form.employeeCode,
        designation: form.designation || null,
        department: form.department || null,
        joiningDate: form.joiningDate || null,
        isCurrentlyWorking: form.isCurrentlyWorking,
        leavingDate: form.isCurrentlyWorking
          ? null
          : form.leavingDate || null,
        expectedPunchInTime: form.expectedPunchInTime || null,
        expectedPunchOutTime: form.expectedPunchOutTime || null,
      };
      if (!isAdminAccount) {
        body.staffType = form.staffType;
      }
      if (form.password.trim()) {
        body.password = form.password;
      }
      if (isAdminAccount) {
        body.adminPassword = adminPassword;
      }
      await schoolApi.staff.update(staffId, body);
      setMessage("Staff updated.");
      router.push(`/dashboard/school/staff/${staffId}`);
    } catch (err) {
      handleErr(err, "Failed to update staff");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Edit staff</h1>
            <p className="text-sm text-muted-foreground">
              Update profile and employment details.
            </p>
          </div>
          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/school/staff/${staffId}`}>
              Back to staff member
            </Link>
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading staff...</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{form.name || "Staff"}</CardTitle>
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
                  <Label>Staff type</Label>
                  {isAdminAccount ? (
                    <Input value={form.staffType} disabled readOnly />
                  ) : (
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
                  )}
                </div>
                <div className="space-y-1">
                  <Label>
                    Employee code <span className="text-destructive">*</span>
                  </Label>
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
                {isAdminAccount ? (
                  <div className="space-y-1 md:col-span-2">
                    <Label>
                      Your admin password{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      placeholder="Required to save changes to an admin account"
                    />
                    <p className="text-xs text-muted-foreground">
                      Editing an admin account requires your own admin password.
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href={`/dashboard/school/staff/${staffId}`}>
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
