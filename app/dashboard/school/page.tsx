"use client";

import { useEffect, useState } from "react";
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
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatMoney } from "@/lib/types";

type Row = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export default function SchoolDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    schoolApi
      .dashboard()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (!active) return;
        if (isSubscriptionInactive(err)) {
          router.replace("/access-blocked");
          return;
        }
        setError(errorMessage(err, "Failed to load dashboard"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const subscription = obj(data?.subscription);
  const cards = [
    { label: "Students", value: num(data?.students) },
    { label: "Staff", value: num(data?.staff) },
    { label: "Classes", value: num(data?.classes) },
    { label: "Active enrollments", value: num(data?.activeEnrollments) },
    {
      label: "Students present today",
      value: num(data?.studentAttendanceToday),
    },
    { label: "Staff present today", value: num(data?.staffAttendanceToday) },
  ];

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">School dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your school today.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.label} size="sm">
              <CardHeader>
                <CardDescription>{c.label}</CardDescription>
                <CardTitle className="text-3xl">
                  {loading ? "—" : c.value.toLocaleString("en-IN")}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              Current billing status for your school.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <Badge>{str(subscription.status) || "—"}</Badge>
              <Badge
                variant={subscription.isAccessEnabled ? "default" : "destructive"}
              >
                {subscription.isAccessEnabled ? "Access on" : "Access off"}
              </Badge>
            </div>
            <p>
              <span className="text-muted-foreground">Price per student:</span>{" "}
              {formatMoney(num(subscription.pricePerStudent))}
            </p>
            <p>
              <span className="text-muted-foreground">Amount due:</span>{" "}
              {formatMoney(num(data?.dueAmount))}
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
