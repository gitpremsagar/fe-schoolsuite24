"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
}

export default function StudentAttendancePage() {
  const router = useRouter();
  const [records, setRecords] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    attendanceApi
      .myStudentAttendance()
      .then((res) => {
        if (active) setRecords(res.records);
      })
      .catch((err) => {
        if (!active) return;
        if (isSubscriptionInactive(err)) {
          router.replace("/access-blocked");
          return;
        }
        setError(errorMessage(err, "Failed to load attendance"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const stats = useMemo(() => {
    const present = records.filter((r) => r.status === "PRESENT").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const total = present + absent;
    const rate = total ? Math.round((present / total) * 100) : 0;
    return { present, absent, total, rate };
  }, [records]);

  return (
    <DashboardShell allowedRoles={["STUDENT"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">My attendance</h1>
          <p className="text-sm text-muted-foreground">
            Your recent attendance records.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Present</CardDescription>
              <CardTitle className="text-3xl">{stats.present}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Absent</CardDescription>
              <CardTitle className="text-3xl">{stats.absent}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Attendance rate</CardDescription>
              <CardTitle className="text-3xl">{stats.rate}%</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No attendance records yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => {
                    const klass = obj(r.class);
                    const status = str(r.status);
                    return (
                      <TableRow key={str(r.id)}>
                        <TableCell>{fmtDate(r.date)}</TableCell>
                        <TableCell>
                          {klass.name
                            ? `${str(klass.name)}${
                                klass.section ? ` - ${str(klass.section)}` : ""
                              }`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === "PRESENT" ? "default" : "destructive"
                            }
                          >
                            {status}
                          </Badge>
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
