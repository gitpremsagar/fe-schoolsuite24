"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

export default function TeacherOverviewPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    schoolApi.classes
      .mine()
      .then((res) => {
        if (active) setClasses(res.classes);
      })
      .catch((err) => {
        if (!active) return;
        if (isSubscriptionInactive(err)) {
          router.replace("/access-blocked");
          return;
        }
        setError(errorMessage(err, "Failed to load classes"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <DashboardShell allowedRoles={["TEACHER"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">My classes</h1>
            <p className="text-sm text-muted-foreground">
              Classes assigned to you.
            </p>
          </div>
          <Link href="/dashboard/teacher/attendance">
            <Button>Mark attendance</Button>
          </Link>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Assigned classes</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${classes.length} class(es)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : classes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No classes assigned yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  classes.map((c) => {
                    const year = obj(c.academicYear);
                    const count = obj(c._count);
                    return (
                      <TableRow key={str(c.id)}>
                        <TableCell className="font-medium">
                          {str(c.name)}
                        </TableCell>
                        <TableCell>{str(c.section) || "—"}</TableCell>
                        <TableCell>{str(year.name) || "—"}</TableCell>
                        <TableCell>{num(count.enrollments)}</TableCell>
                        <TableCell>
                          {c.isPrimary ? (
                            <Badge>Class teacher</Badge>
                          ) : (
                            <Badge variant="secondary">Subject teacher</Badge>
                          )}
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
