"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = str(params.id);

  const [staff, setStaff] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [deactivating, setDeactivating] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [purging, setPurging] = useState(false);

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
    if (!staffId) return;
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.staff.get(staffId);
      setStaff(res.staff);
    } catch (err) {
      handleErr(err, "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [staffId, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDeactivate() {
    if (!staffId) return;
    if (
      !window.confirm(
        "Deactivate this staff member? They will no longer be able to sign in.",
      )
    ) {
      return;
    }
    setDeactivating(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.staff.remove(staffId);
      setMessage("Staff member deactivated.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to deactivate staff");
    } finally {
      setDeactivating(false);
    }
  }

  async function onPurge(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId || !adminPassword.trim()) {
      setError("Enter your admin password to permanently delete.");
      return;
    }
    setPurging(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.staff.purge(staffId, adminPassword);
      setPurgeOpen(false);
      setAdminPassword("");
      setMessage("Staff member permanently deleted.");
      router.push("/dashboard/school/staff");
    } catch (err) {
      handleErr(err, "Failed to permanently delete staff");
    } finally {
      setPurging(false);
    }
  }

  const user = obj(staff?.user);
  const school = obj(staff?.school);
  const assignments = arr(staff?.classAssignments);
  const working =
    staff?.isCurrentlyWorking === undefined
      ? true
      : Boolean(staff?.isCurrentlyWorking);
  const isAdminAccount =
    str(staff?.staffType) === "ADMIN" ||
    str(user.role) === "ADMIN" ||
    str(user.role) === "SUPER_ADMIN" ||
    (str(school.ownerId) !== "" && str(school.ownerId) === str(user.id));

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {loading ? "Staff" : str(user.name) || "Staff"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Staff profile and class assignments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/school/staff">Back to staff</Link>
            </Button>
            {!loading && staff ? (
              <>
                <Button type="button" asChild>
                  <Link href={`/dashboard/school/staff/${staffId}/edit`}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
                {!isAdminAccount ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deactivating || user.isActive === false}
                      onClick={() => void onDeactivate()}
                    >
                      {deactivating
                        ? "Deactivating..."
                        : user.isActive === false
                          ? "Inactive"
                          : "Deactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setError("");
                        setAdminPassword("");
                        setPurgeOpen(true);
                      }}
                    >
                      Delete permanently
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading staff...</p>
        ) : staff ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>
                  {str(staff.staffType)} · Code {str(staff.employeeCode) || "—"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Name" value={str(user.name)} />
                <DetailItem label="Email" value={str(user.email)} />
                <DetailItem label="Phone" value={str(user.phone)} />
                <DetailItem label="Staff type" value={str(staff.staffType)} />
                <DetailItem
                  label="Employee code"
                  value={str(staff.employeeCode)}
                />
                <DetailItem
                  label="Designation"
                  value={str(staff.designation)}
                />
                <DetailItem label="Department" value={str(staff.department)} />
                <DetailItem
                  label="Account status"
                  value={user.isActive === false ? "Inactive" : "Active"}
                />
                <DetailItem
                  label="Employment status"
                  value={working ? "Currently working" : "Left school"}
                />
                <DetailItem
                  label="Joining date"
                  value={formatDate(staff.joiningDate)}
                />
                <DetailItem
                  label="Leaving date"
                  value={working ? "—" : formatDate(staff.leavingDate)}
                />
                <DetailItem
                  label="Punch-in time"
                  value={str(staff.expectedPunchInTime)}
                />
                <DetailItem
                  label="Punch-out time"
                  value={str(staff.expectedPunchOutTime)}
                />
              </CardContent>
            </Card>

            {str(staff.staffType) === "TEACHER" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Assigned classes</CardTitle>
                  <CardDescription>
                    Classes this teacher is assigned to.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No class assignments yet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {assignments.map((a) => {
                        const klass = obj(a.class);
                        return (
                          <li
                            key={str(a.id)}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                          >
                            <p className="font-medium">
                              {formatClassLabel(
                                str(klass.classLevel) || str(klass.name),
                                str(klass.section) || null,
                              )}
                            </p>
                            <p className="text-muted-foreground">
                              {a.isPrimary ? "Primary" : "Assigned"}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}

        <Dialog
          open={purgeOpen}
          onOpenChange={(open) => {
            setPurgeOpen(open);
            if (!open) setAdminPassword("");
          }}
        >
          <DialogContent>
            <form onSubmit={onPurge}>
              <DialogHeader>
                <DialogTitle>Permanently delete staff?</DialogTitle>
                <DialogDescription>
                  This removes {str(user.name) || "this staff member"} and their
                  account forever. Attendance they marked will be reassigned to
                  you. Enter your admin password to confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <Label htmlFor="admin-password">Your admin password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={purging}
                  onClick={() => setPurgeOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={purging}>
                  {purging ? "Deleting..." : "Delete permanently"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
