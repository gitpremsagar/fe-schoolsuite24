"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
}

export default function AcademicYearsPage() {
  const router = useRouter();
  const [years, setYears] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    isCurrent: true,
  });
  const [saving, setSaving] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.academicYears.list();
      setYears(res.academicYears);
    } catch (err) {
      handleErr(err, "Failed to load academic years");
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await schoolApi.academicYears.create({
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        isCurrent: form.isCurrent,
      });
      setForm({ name: "", startDate: "", endDate: "", isCurrent: false });
      setShowForm(false);
      await load();
    } catch (err) {
      handleErr(err, "Failed to create academic year");
    } finally {
      setSaving(false);
    }
  }

  async function setCurrent(id: string) {
    setError("");
    try {
      await schoolApi.academicYears.update(id, { isCurrent: true });
      await load();
    } catch (err) {
      handleErr(err, "Failed to update academic year");
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Academic years</h1>
            <p className="text-sm text-muted-foreground">
              Create academic years and set the current one.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add academic year"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New academic year</CardTitle>
              <CardDescription>e.g. 2025-2026</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreate}>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isCurrent}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, isCurrent: e.target.checked }))
                      }
                    />
                    Set as current
                  </label>
                </div>
                <div className="space-y-1">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, endDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create academic year"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <LoadingPulseCard />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {years.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No academic years yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    years.map((y) => (
                      <TableRow key={str(y.id)}>
                        <TableCell className="font-medium">
                          {str(y.name)}
                        </TableCell>
                        <TableCell>{fmtDate(y.startDate)}</TableCell>
                        <TableCell>{fmtDate(y.endDate)}</TableCell>
                        <TableCell>
                          {y.isCurrent ? (
                            <Badge>Current</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {y.isCurrent ? null : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCurrent(str(y.id))}
                            >
                              Set current
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
