"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PunchCard } from "@/components/attendance/punch-card";

export default function TeacherPunchPage() {
  return (
    <DashboardShell allowedRoles={["TEACHER"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">My punch</h1>
          <p className="text-sm text-muted-foreground">
            Record your daily attendance.
          </p>
        </div>
        <PunchCard />
      </div>
    </DashboardShell>
  );
}
