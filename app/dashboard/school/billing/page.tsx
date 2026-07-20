"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatMoney } from "@/lib/types";

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
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}
function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
}

function ValueLoader({ className }: { className?: string }) {
  return (
    <Loader2
      className={className ?? "h-6 w-6 animate-spin text-muted-foreground"}
      aria-label="Loading"
    />
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    schoolApi.billing
      .summary()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (!active) return;
        // Billing must remain reachable even when access is blocked.
        if (isSubscriptionInactive(err)) {
          router.replace("/access-blocked");
          return;
        }
        setError(errorMessage(err, "Failed to load billing"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const subscription = obj(data?.subscription);
  const currency = str(data?.currency) || "INR";
  const payments = arr(data?.payments);

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Your subscription status and payment history.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Active enrollments</CardDescription>
              <CardTitle className="text-3xl">
                {loading ? <ValueLoader /> : num(data?.activeEnrollments)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Price per student</CardDescription>
              <CardTitle className="text-3xl">
                {loading ? (
                  <ValueLoader />
                ) : (
                  formatMoney(num(data?.pricePerStudent), currency)
                )}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Amount due</CardDescription>
              <CardTitle className="text-3xl">
                {loading ? (
                  <ValueLoader />
                ) : (
                  formatMoney(num(data?.dueAmount), currency)
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              {loading ? (
                <ValueLoader className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Badge>{str(subscription.status) || "—"}</Badge>
                  <Badge
                    variant={
                      subscription.isAccessEnabled ? "default" : "destructive"
                    }
                  >
                    {subscription.isAccessEnabled ? "Access on" : "Access off"}
                  </Badge>
                </>
              )}
            </div>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Trial ends:</span>{" "}
              {loading ? (
                <ValueLoader className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                fmtDate(subscription.trialEndsAt)
              )}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Current period:</span>{" "}
              {loading ? (
                <ValueLoader className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  {fmtDate(subscription.currentPeriodStart)} –{" "}
                  {fmtDate(subscription.currentPeriodEnd)}
                </>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex items-center justify-center py-6">
                        <ValueLoader />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No payments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={str(p.id)}>
                      <TableCell>{fmtDate(p.paidAt || p.createdAt)}</TableCell>
                      <TableCell>
                        {formatMoney(num(p.amount), str(p.currency) || currency)}
                      </TableCell>
                      <TableCell>{num(p.studentCount)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{str(p.status)}</Badge>
                      </TableCell>
                      <TableCell>{str(p.invoiceNumber) || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
