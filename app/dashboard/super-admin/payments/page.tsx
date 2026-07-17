"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { platformApi } from "@/lib/api/platform";
import { errorMessage } from "@/lib/api/subscription";
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
function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await platformApi.payments();
      setPayments(res.payments);
    } catch (err) {
      setError(errorMessage(err, "Failed to load payments"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell allowedRoles={["SUPER_ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            All payments recorded across schools.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Recorded by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No payments recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => {
                    const school = obj(p.school);
                    const recordedBy = obj(p.recordedBy);
                    const st = str(p.status);
                    return (
                      <TableRow key={str(p.id)}>
                        <TableCell>{fmtDate(p.paidAt || p.createdAt)}</TableCell>
                        <TableCell>{str(school.name) || "—"}</TableCell>
                        <TableCell>
                          {formatMoney(num(p.amount), str(p.currency) || "INR")}
                        </TableCell>
                        <TableCell>{num(p.studentCount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              st === "SUCCEEDED" ? "default" : "secondary"
                            }
                          >
                            {st || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{str(p.paymentMethod) || "—"}</TableCell>
                        <TableCell>{str(recordedBy.name) || "—"}</TableCell>
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
