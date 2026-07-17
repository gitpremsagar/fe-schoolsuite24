"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PunchCard } from "@/components/attendance/punch-card";
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

export default function EmployeeOverviewPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<Row | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    schoolApi.staff
      .me()
      .then((res) => {
        if (active) setStaff(res.staff);
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

  const user = obj(staff?.user);

  return (
    <DashboardShell allowedRoles={["EMPLOYEE"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome{user.name ? `, ${str(user.name)}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your profile and daily attendance.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>My profile</CardTitle>
            <CardDescription>Employee details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Employee code:</span>{" "}
              {str(staff?.employeeCode) || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Designation:</span>{" "}
              {str(staff?.designation) || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Department:</span>{" "}
              {str(staff?.department) || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {str(user.email) || "—"}
            </p>
          </CardContent>
        </Card>

        <PunchCard />
      </div>
    </DashboardShell>
  );
}
