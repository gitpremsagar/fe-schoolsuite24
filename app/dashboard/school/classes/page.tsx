"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

export default function ClassesPage() {
  const router = useRouter();
  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [filterYear, setFilterYear] = useState<string>("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    academicYearId: "",
    name: "",
    section: "",
    gradeLevel: "",
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

  const loadClasses = useCallback(
    async (yearId?: string) => {
      try {
        const res = await schoolApi.classes.list(
          yearId && yearId !== "ALL" ? yearId : undefined,
        );
        setClasses(res.classes);
      } catch (err) {
        handleErr(err, "Failed to load classes");
      }
    },
    [handleErr],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const yr = await schoolApi.academicYears.list();
        if (!active) return;
        setYears(yr.academicYears);
        const current = yr.academicYears.find((y) => y.isCurrent);
        if (current) {
          setForm((p) => ({ ...p, academicYearId: str(current.id) }));
        }
        await loadClasses();
      } catch (err) {
        handleErr(err, "Failed to load data");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [handleErr, loadClasses]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await schoolApi.classes.create({
        academicYearId: form.academicYearId,
        name: form.name,
        ...(form.section ? { section: form.section } : {}),
        ...(form.gradeLevel ? { gradeLevel: form.gradeLevel.trim() } : {}),
      });
      setForm((p) => ({
        ...p,
        name: "",
        section: "",
        gradeLevel: "",
      }));
      setShowForm(false);
      await loadClasses(filterYear);
    } catch (err) {
      handleErr(err, "Failed to create class");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Classes</h1>
            <p className="text-sm text-muted-foreground">
              Create classes and view them by academic year.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add class"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New class</CardTitle>
              <CardDescription>
                A class belongs to a specific academic year.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {years.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create an academic year first.
                </p>
              ) : (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreate}>
                  <div className="space-y-1">
                    <Label>Academic year</Label>
                    <Select
                      value={form.academicYearId}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, academicYearId: v }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={str(y.id)} value={str(y.id)}>
                            {str(y.name)}
                            {y.isCurrent ? " (current)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={form.name}
                      placeholder="Grade 5"
                      onChange={(e) =>
                        setForm((p) => ({ ...p, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Section</Label>
                    <Input
                      value={form.section}
                      placeholder="A"
                      onChange={(e) =>
                        setForm((p) => ({ ...p, section: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Grade</Label>
                    <Input
                      value={form.gradeLevel}
                      placeholder="Nursery, LKG, UKG, 1, 2..."
                      onChange={(e) =>
                        setForm((p) => ({ ...p, gradeLevel: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex items-end md:col-span-2">
                    <Button
                      type="submit"
                      disabled={saving || !form.academicYearId}
                    >
                      {saving ? "Creating..." : "Create class"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label>Filter by year</Label>
            <Select
              value={filterYear}
              onValueChange={(v) => {
                setFilterYear(v);
                void loadClasses(v);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={str(y.id)} value={str(y.id)}>
                    {str(y.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : classes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No classes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  classes.map((c) => {
                    const year = obj(c.academicYear);
                    const count = obj(c._count);
                    return (
                      <TableRow key={str(c.id)}>
                        <TableCell className="font-medium">
                          {str(c.name)}
                        </TableCell>
                        <TableCell>{str(c.section) || "—"}</TableCell>
                        <TableCell>{str(c.gradeLevel) || "—"}</TableCell>
                        <TableCell>{str(year.name) || "—"}</TableCell>
                        <TableCell>{num(count.enrollments)}</TableCell>
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
