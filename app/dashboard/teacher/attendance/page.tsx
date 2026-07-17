"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StudentAttendanceMarker } from "@/components/attendance/student-attendance-marker";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

export default function TeacherAttendancePage() {
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
        <div>
          <h1 className="text-2xl font-semibold">Student attendance</h1>
          <p className="text-sm text-muted-foreground">
            Mark attendance for your assigned classes.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have no assigned classes.
          </p>
        ) : (
          <StudentAttendanceMarker classes={classes} />
        )}
      </div>
    </DashboardShell>
  );
}
