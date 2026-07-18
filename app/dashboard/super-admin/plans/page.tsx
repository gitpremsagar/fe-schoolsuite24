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

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    defaultPricePerStudent: "",
    currency: "INR",
    interval: "MONTHLY",
    trialDays: "30",
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await platformApi.plans();
      setPlans(res.plans);
    } catch (err) {
      setError(errorMessage(err, "Failed to load plans"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await platformApi.createPlan({
        name: form.name,
        description: form.description || undefined,
        defaultPricePerStudent: Number(form.defaultPricePerStudent),
        currency: form.currency,
        interval: form.interval,
        trialDays: Number(form.trialDays),
      });
      setForm({
        name: "",
        description: "",
        defaultPricePerStudent: "",
        currency: "INR",
        interval: "MONTHLY",
        trialDays: "30",
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to create plan"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["SUPER_ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Subscription plans</h1>
            <p className="text-sm text-muted-foreground">
              Manage the pricing plans available to schools.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add plan"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New plan</CardTitle>
              <CardDescription>Prices are in paise.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={onCreate}
              >
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
                <div className="space-y-1">
                  <Label>Default price/student (paise)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.defaultPricePerStudent}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        defaultPricePerStudent: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input
                    value={form.currency}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, currency: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Interval</Label>
                  <Select
                    value={form.interval}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, interval: v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="YEARLY">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Trial days</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.trialDays}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, trialDays: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating..." : "Create plan"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price/student</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No plans yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((plan) => (
                    <TableRow key={str(plan.id)}>
                      <TableCell>
                        <div className="font-medium">{str(plan.name)}</div>
                        <div className="text-xs text-muted-foreground">
                          {str(plan.description)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatMoney(
                          num(plan.defaultPricePerStudent),
                          str(plan.currency) || "INR",
                        )}
                      </TableCell>
                      <TableCell>{str(plan.interval)}</TableCell>
                      <TableCell>{num(plan.trialDays)} days</TableCell>
                      <TableCell>
                        <Badge variant={plan.isActive ? "default" : "outline"}>
                          {plan.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
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
