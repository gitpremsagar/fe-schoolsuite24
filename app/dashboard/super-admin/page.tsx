"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { platformApi } from "@/lib/api/platform";
import { errorMessage } from "@/lib/api/subscription";
import { formatMoney } from "@/lib/types";

type Overview = {
  totalSchools?: number;
  trialSchools?: number;
  activeSchools?: number;
  expiredSchools?: number;
  suspendedSchools?: number;
  totalStudents?: number;
  expectedMonthlyRevenue?: number;
};

export default function SuperAdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    platformApi
      .overview()
      .then((res) => {
        if (active) setData(res as Overview);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err, "Failed to load overview"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cards = [
    { label: "Total schools", value: data?.totalSchools ?? 0 },
    { label: "On trial", value: data?.trialSchools ?? 0 },
    { label: "Active", value: data?.activeSchools ?? 0 },
    { label: "Expired", value: data?.expiredSchools ?? 0 },
    { label: "Suspended", value: data?.suspendedSchools ?? 0 },
    { label: "Total students", value: data?.totalStudents ?? 0 },
  ];

  return (
    <DashboardShell allowedRoles={["SUPER_ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform overview</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot of all schools on the platform.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.label} size="sm">
              <CardHeader>
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-3xl">
                  {loading ? "—" : card.value.toLocaleString("en-IN")}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
          <Card size="sm" className="sm:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardDescription>Expected monthly revenue</CardDescription>
              <CardTitle className="text-3xl">
                {loading
                  ? "—"
                  : formatMoney(data?.expectedMonthlyRevenue ?? 0)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Based on active enrollments across trial and active schools at
                each school&apos;s per-student rate.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
