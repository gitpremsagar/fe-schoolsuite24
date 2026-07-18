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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = str(params.id);

  const [student, setStudent] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    if (!studentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await schoolApi.students.get(studentId);
        if (!active) return;
        setStudent(res.student);
      } catch (err) {
        handleErr(err, "Failed to load student");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [studentId, handleErr]);

  const user = obj(student?.user);
  const enrollments = arr(student?.enrollments);
  const studying =
    student?.isCurrentlyStudying === undefined
      ? true
      : Boolean(student?.isCurrentlyStudying);

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {loading ? "Student" : str(user.name) || "Student"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Student profile and enrollment details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/school/students">Back to students</Link>
            </Button>
            {!loading && student ? (
              <Button type="button" asChild>
                <Link href={`/dashboard/school/students/${studentId}/edit`}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading student...</p>
        ) : student ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>
                  Admission #{str(student.admissionNumber) || "—"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Name" value={str(user.name)} />
                <DetailItem label="Email" value={str(user.email)} />
                <DetailItem label="Phone" value={str(user.phone)} />
                <DetailItem
                  label="Admission number"
                  value={str(student.admissionNumber)}
                />
                <DetailItem label="Roll number" value={str(student.rollNumber)} />
                <DetailItem label="Blood group" value={str(student.bloodGroup)} />
                <DetailItem
                  label="Father's name"
                  value={str(student.fatherName)}
                />
                <DetailItem
                  label="Mother's name"
                  value={str(student.motherName)}
                />
                <DetailItem
                  label="Status"
                  value={studying ? "Currently studying" : "Left school"}
                />
                <DetailItem
                  label="Joining date"
                  value={formatDate(student.joiningDate ?? student.joinedOn)}
                />
                <DetailItem
                  label="Leaving date"
                  value={studying ? "—" : formatDate(student.leavingDate)}
                />
                <DetailItem
                  label="Permanent address"
                  value={str(student.permanentAddress)}
                />
                <DetailItem
                  label="Current address"
                  value={str(student.currentAddress)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollments</CardTitle>
                <CardDescription>
                  Classes this student is or was enrolled in.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No enrollments yet.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {enrollments.map((e) => {
                      const klass = obj(e.class);
                      const year = obj(e.academicYear);
                      return (
                        <li
                          key={str(e.id)}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {formatClassLabel(
                                str(klass.classLevel) || str(klass.name),
                                str(klass.section) || null,
                              )}
                            </p>
                            <p className="text-muted-foreground">
                              {str(year.name) || "—"}
                              {e.rollNumber
                                ? ` · Roll ${str(e.rollNumber)}`
                                : ""}
                            </p>
                          </div>
                          <p className="text-muted-foreground">
                            {e.isActive ? "Active" : "Inactive"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
