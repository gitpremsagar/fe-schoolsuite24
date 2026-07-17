"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StudentAttendanceMarker } from "@/components/attendance/student-attendance-marker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceApi, schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function fmtTime(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SchoolAttendancePage() {
  const router = useRouter();
  const [classes, setClasses] = useState<Row[]>([]);
  const [staffRecords, setStaffRecords] = useState<Row[]>([]);
  const [date, setDate] = useState(today());
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

  const loadStaff = useCallback(
    async (d: string) => {
      try {
        const res = await attendanceApi.listStaff(d, d);
        setStaffRecords(res.records);
      } catch (err) {
        handleErr(err, "Failed to load staff attendance");
      }
    },
    [handleErr],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await schoolApi.classes.list();
        setClasses(res.classes);
      } catch (err) {
        handleErr(err, "Failed to load classes");
      }
    })();
  }, [handleErr]);

  useEffect(() => {
    void loadStaff(date);
  }, [date, loadStaff]);

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Mark student attendance and review staff punches.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Student attendance</h2>
          <StudentAttendanceMarker classes={classes} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Staff attendance</h2>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Punches on {fmtDate(date)}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Punch in</TableHead>
                    <TableHead>Punch out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No staff punches for this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    staffRecords.map((r) => {
                      const staff = obj(r.staffProfile);
                      const user = obj(staff.user);
                      return (
                        <TableRow key={str(r.id)}>
                          <TableCell className="font-medium">
                            {str(user.name)}
                          </TableCell>
                          <TableCell>{str(user.role)}</TableCell>
                          <TableCell>{fmtTime(r.punchInAt)}</TableCell>
                          <TableCell>{fmtTime(r.punchOutAt)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardShell>
  );
}
