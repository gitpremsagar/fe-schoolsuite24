"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
  "SUSPENDED",
];

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

function statusVariant(status: string) {
  if (status === "ACTIVE") return "default" as const;
  if (status === "TRIAL") return "secondary" as const;
  return "destructive" as const;
}

export default function SchoolsPage() {
  const [schools, setSchools] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await platformApi.schools(
        q || undefined,
        status === "ALL" ? undefined : status,
      );
      setSchools(res.schools);
    } catch (err) {
      setError(errorMessage(err, "Failed to load schools"));
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <DashboardShell allowedRoles={["SUPER_ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Schools</h1>
          <p className="text-sm text-muted-foreground">
            Search schools and manage their subscription and payments.
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <div className="space-y-1">
            <Label>Search</Label>
            <Input
              value={q}
              placeholder="Name, email or code"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit">Search</Button>
        </form>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : schools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No schools found.
                    </TableCell>
                  </TableRow>
                ) : (
                  schools.map((school) => {
                    const sub = obj(school.subscription);
                    const owner = obj(school.owner);
                    const count = obj(school._count);
                    const st = str(sub.status) || "—";
                    return (
                      <TableRow key={str(school.id)}>
                        <TableCell>
                          <div className="font-medium">{str(school.name)}</div>
                          <div className="text-xs text-muted-foreground">
                            {str(school.code) || str(school.email)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{str(owner.name)}</div>
                          <div className="text-xs text-muted-foreground">
                            {str(owner.email)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(st)}>{st}</Badge>
                        </TableCell>
                        <TableCell>
                          {formatMoney(num(sub.pricePerStudent))}
                        </TableCell>
                        <TableCell>{num(count.studentProfiles)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedId(str(school.id))}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selectedId ? (
          <SchoolDetail
            schoolId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={() => void load()}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}

function toDateInput(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function SchoolDetail({
  schoolId,
  onClose,
  onChanged,
}: {
  schoolId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<{
    school: Row;
    activeEnrollments: number;
    dueAmount: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [sub, setSub] = useState({
    pricePerStudent: "",
    status: "TRIAL",
    isAccessEnabled: "true",
    accessNotes: "",
  });
  const [savingSub, setSavingSub] = useState(false);

  const [pay, setPay] = useState({
    studentCount: "",
    pricePerStudent: "",
    periodStart: "",
    periodEnd: "",
    paymentMethod: "manual",
    invoiceNumber: "",
    notes: "",
    grantAccess: true,
  });
  const [savingPay, setSavingPay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await platformApi.school(schoolId);
      setDetail(res);
      const s = obj(res.school.subscription);
      setSub({
        pricePerStudent: str(s.pricePerStudent),
        status: str(s.status) || "TRIAL",
        isAccessEnabled: s.isAccessEnabled ? "true" : "false",
        accessNotes: str(s.accessNotes),
      });
      setPay((prev) => ({
        ...prev,
        studentCount: String(res.activeEnrollments ?? ""),
        pricePerStudent: str(s.pricePerStudent),
      }));
    } catch (err) {
      setError(errorMessage(err, "Failed to load school"));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault();
    setSavingSub(true);
    setError("");
    setMessage("");
    try {
      await platformApi.updateSubscription(schoolId, {
        ...(sub.pricePerStudent !== ""
          ? { pricePerStudent: Number(sub.pricePerStudent) }
          : {}),
        status: sub.status,
        isAccessEnabled: sub.isAccessEnabled === "true",
        accessNotes: sub.accessNotes,
      });
      setMessage("Subscription updated.");
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Failed to update subscription"));
    } finally {
      setSavingSub(false);
    }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    setSavingPay(true);
    setError("");
    setMessage("");
    try {
      await platformApi.recordPayment(schoolId, {
        ...(pay.studentCount !== ""
          ? { studentCount: Number(pay.studentCount) }
          : {}),
        ...(pay.pricePerStudent !== ""
          ? { pricePerStudent: Number(pay.pricePerStudent) }
          : {}),
        ...(pay.periodStart ? { periodStart: pay.periodStart } : {}),
        ...(pay.periodEnd ? { periodEnd: pay.periodEnd } : {}),
        paymentMethod: pay.paymentMethod,
        ...(pay.invoiceNumber ? { invoiceNumber: pay.invoiceNumber } : {}),
        ...(pay.notes ? { notes: pay.notes } : {}),
        grantAccess: pay.grantAccess,
      });
      setMessage("Payment recorded.");
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Failed to record payment"));
    } finally {
      setSavingPay(false);
    }
  }

  const school = detail?.school ?? {};
  const subscription = obj(school.subscription);
  const payments = Array.isArray(subscription.payments)
    ? (subscription.payments as Row[])
    : [];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{str(school.name) || "School detail"}</CardTitle>
          <CardDescription>
            {loading
              ? "Loading..."
              : `${detail?.activeEnrollments ?? 0} active enrollments · Due ${formatMoney(
                  detail?.dueAmount ?? 0,
                )}`}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-3" onSubmit={saveSubscription}>
            <h3 className="font-medium">Subscription controls</h3>
            <div className="space-y-1">
              <Label>Price per student (paise)</Label>
              <Input
                type="number"
                min={0}
                value={sub.pricePerStudent}
                onChange={(e) =>
                  setSub((p) => ({ ...p, pricePerStudent: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={sub.status}
                onValueChange={(v) => setSub((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Access enabled</Label>
              <Select
                value={sub.isAccessEnabled}
                onValueChange={(v) =>
                  setSub((p) => ({ ...p, isAccessEnabled: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Enabled</SelectItem>
                  <SelectItem value="false">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Access notes</Label>
              <Textarea
                value={sub.accessNotes}
                onChange={(e) =>
                  setSub((p) => ({ ...p, accessNotes: e.target.value }))
                }
              />
            </div>
            <Button type="submit" disabled={savingSub}>
              {savingSub ? "Saving..." : "Save subscription"}
            </Button>
          </form>

          <form className="space-y-3" onSubmit={recordPayment}>
            <h3 className="font-medium">Record payment</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Student count</Label>
                <Input
                  type="number"
                  min={0}
                  value={pay.studentCount}
                  onChange={(e) =>
                    setPay((p) => ({ ...p, studentCount: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Price/student (paise)</Label>
                <Input
                  type="number"
                  min={0}
                  value={pay.pricePerStudent}
                  onChange={(e) =>
                    setPay((p) => ({ ...p, pricePerStudent: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Period start</Label>
                <Input
                  type="date"
                  value={pay.periodStart}
                  onChange={(e) =>
                    setPay((p) => ({ ...p, periodStart: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Period end</Label>
                <Input
                  type="date"
                  value={pay.periodEnd}
                  onChange={(e) =>
                    setPay((p) => ({ ...p, periodEnd: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Payment method</Label>
                <Input
                  value={pay.paymentMethod}
                  onChange={(e) =>
                    setPay((p) => ({ ...p, paymentMethod: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Invoice number</Label>
                <Input
                  value={pay.invoiceNumber}
                  onChange={(e) =>
                    setPay((p) => ({ ...p, invoiceNumber: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={pay.notes}
                onChange={(e) =>
                  setPay((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pay.grantAccess}
                onChange={(e) =>
                  setPay((p) => ({ ...p, grantAccess: e.target.checked }))
                }
              />
              Grant access and activate on payment
            </label>
            {pay.studentCount !== "" && pay.pricePerStudent !== "" ? (
              <p className="text-sm text-muted-foreground">
                Amount:{" "}
                {formatMoney(
                  Number(pay.studentCount) * Number(pay.pricePerStudent),
                )}
              </p>
            ) : null}
            <Button type="submit" disabled={savingPay}>
              {savingPay ? "Recording..." : "Record payment"}
            </Button>
          </form>
        </div>

        <div>
          <h3 className="mb-2 font-medium">Payment history</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No payments recorded.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={str(p.id)}>
                    <TableCell>
                      {toDateInput(p.paidAt || p.createdAt) || "—"}
                    </TableCell>
                    <TableCell>{formatMoney(num(p.amount))}</TableCell>
                    <TableCell>{num(p.studentCount)}</TableCell>
                    <TableCell>{str(p.paymentMethod) || "—"}</TableCell>
                    <TableCell>{str(p.invoiceNumber) || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
