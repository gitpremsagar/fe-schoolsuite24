"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function StudentOverviewPage() {
  const router = useRouter();
  const [student, setStudent] = useState<Row | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    schoolApi.students
      .me()
      .then((res) => {
        if (active) setStudent(res.student);
      })
      .catch((err) => {
        if (!active) return;
        if (isSubscriptionInactive(err)) {
          router.replace("/access-blocked");
          return;
        }
        setError(errorMessage(err, "Failed to load profile"));
      });
    return () => {
      active = false;
    };
  }, [router]);

  const user = obj(student?.user);
  const enrollments = arr(student?.enrollments);
  const current = obj(enrollments[0]);
  const klass = obj(current.class);
  const year = obj(current.academicYear);

  return (
    <DashboardShell allowedRoles={["STUDENT"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome{user.name ? `, ${str(user.name)}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your student profile and class.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Admission #:</span>{" "}
                {str(student?.admissionNumber) || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Roll #:</span>{" "}
                {str(student?.rollNumber) || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                {str(user.email) || "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current class</CardTitle>
              <CardDescription>Active enrollment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Class:</span>{" "}
                {klass.name
                  ? `${str(klass.name)}${
                      klass.section ? ` - ${str(klass.section)}` : ""
                    }`
                  : "Not enrolled"}
              </p>
              <p>
                <span className="text-muted-foreground">Academic year:</span>{" "}
                {str(year.name) || "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
