"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
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
import { Textarea } from "@/components/ui/textarea";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;
type EventScope = "SCHOOL" | "CLASSES";

type EventSummary = {
  totalApplicable: number;
  paid: number;
  partial: number;
  unpaid: number;
  waived: number;
};

type EventClass = {
  id: string;
  classId: string;
  classLevel: string;
  section: string | null;
  label: string;
};

type EventFeeRow = {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  scope: EventScope;
  eventDate: string | null;
  dueDate: string | null;
  isActive: boolean;
  academicYearId: string;
  classes: EventClass[];
  summary?: EventSummary;
};

function str(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown) {
  return typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseEvent(row: Row): EventFeeRow {
  const classesRaw = Array.isArray(row.classes) ? row.classes : [];
  const summaryRaw = (row.summary ?? {}) as Row;
  return {
    id: str(row.id),
    name: str(row.name),
    description: row.description ? str(row.description) : null,
    amount: num(row.amount),
    currency: str(row.currency) || "INR",
    scope: row.scope === "CLASSES" ? "CLASSES" : "SCHOOL",
    eventDate: row.eventDate ? str(row.eventDate) : null,
    dueDate: row.dueDate ? str(row.dueDate) : null,
    isActive: row.isActive !== false,
    academicYearId: str(row.academicYearId),
    classes: classesRaw.map((c) => {
      const item = c as Row;
      return {
        id: str(item.id),
        classId: str(item.classId),
        classLevel: str(item.classLevel),
        section: item.section ? str(item.section) : null,
        label:
          str(item.label) ||
          formatClassLabel(str(item.classLevel), item.section as string | null),
      };
    }),
    summary: {
      totalApplicable: num(summaryRaw.totalApplicable),
      paid: num(summaryRaw.paid),
      partial: num(summaryRaw.partial),
      unpaid: num(summaryRaw.unpaid),
      waived: num(summaryRaw.waived),
    },
  };
}

function emptyForm() {
  return {
    name: "",
    description: "",
    amount: "",
    scope: "SCHOOL" as EventScope,
    classIds: [] as string[],
    eventDate: "",
    dueDate: "",
    isActive: true,
  };
}

export default function EventFeesPage() {
  const router = useRouter();
  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [filterYearId, setFilterYearId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [events, setEvents] = useState<EventFeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasPayments, setHasPayments] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const yr = await schoolApi.academicYears.list();
        setYears(yr.academicYears);
        const current = yr.academicYears.find((y) => y.isCurrent);
        const currentId = current
          ? str(current.id)
          : str(yr.academicYears[0]?.id);
        setFilterYearId((prev) => prev || currentId);
      } catch (err) {
        handleErr(err, "Failed to load academic years");
      }
    })();
  }, [handleErr]);

  useEffect(() => {
    if (!filterYearId) return;
    (async () => {
      try {
        const cls = await schoolApi.classes.list(filterYearId);
        setClasses(cls.classes);
      } catch (err) {
        handleErr(err, "Failed to load classes");
      }
    })();
  }, [filterYearId, handleErr]);

  const loadEvents = useCallback(async () => {
    if (!filterYearId) return;
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.eventFees.list({
        academicYearId: filterYearId,
        includeInactive,
      });
      setEvents(res.eventFees.map((row) => parseEvent(row)));
    } catch (err) {
      handleErr(err, "Failed to load event fees");
    } finally {
      setLoading(false);
    }
  }, [filterYearId, includeInactive, handleErr]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const yearClasses = useMemo(() => {
    return classes
      .filter((c) => str(c.academicYearId) === filterYearId || !str(c.academicYearId))
      .map((c) => ({
        id: str(c.id),
        label: formatClassLabel(
          str(c.classLevel),
          c.section ? str(c.section) : null,
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [classes, filterYearId]);

  function openCreate() {
    setEditingId(null);
    setHasPayments(false);
    setForm(emptyForm());
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(event: EventFeeRow) {
    setHasPayments(
      (event.summary?.paid ?? 0) +
        (event.summary?.partial ?? 0) +
        (event.summary?.waived ?? 0) >
        0,
    );
    setEditingId(event.id);
    setForm({
      name: event.name,
      description: event.description ?? "",
      amount: String(event.amount),
      scope: event.scope,
      classIds: event.classes.map((c) => c.classId),
      eventDate: toDateInput(event.eventDate),
      dueDate: toDateInput(event.dueDate),
      isActive: event.isActive,
    });
    setFormError("");
    setDialogOpen(true);
  }

  function toggleClassId(classId: string) {
    setForm((prev) => {
      const has = prev.classIds.includes(classId);
      return {
        ...prev,
        classIds: has
          ? prev.classIds.filter((id) => id !== classId)
          : [...prev.classIds, classId],
      };
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const trimmedName = form.name.trim();
    const amount = Number(form.amount);
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Amount must be a positive number.");
      return;
    }
    if (form.scope === "CLASSES" && form.classIds.length === 0) {
      setFormError("Select at least one class.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updateBody: Record<string, unknown> = {
          name: trimmedName,
          description: form.description.trim() || null,
          amount,
          eventDate: form.eventDate || null,
          dueDate: form.dueDate || null,
          isActive: form.isActive,
        };
        if (!hasPayments) {
          updateBody.scope = form.scope;
          updateBody.classIds =
            form.scope === "CLASSES" ? form.classIds : [];
        }
        await schoolApi.eventFees.update(editingId, updateBody);
        setMessage("Event fee updated.");
      } else {
        await schoolApi.eventFees.create({
          name: trimmedName,
          description: form.description.trim() || null,
          amount,
          scope: form.scope,
          classIds: form.scope === "CLASSES" ? form.classIds : [],
          eventDate: form.eventDate || null,
          dueDate: form.dueDate || null,
          academicYearId: filterYearId,
        });
        setMessage("Event fee created.");
      }
      setDialogOpen(false);
      await loadEvents();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to save event fee"));
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(event: EventFeeRow) {
    if (!event.isActive) return;
    if (!window.confirm(`Deactivate “${event.name}”?`)) return;
    try {
      await schoolApi.eventFees.deactivate(event.id);
      setMessage("Event fee deactivated.");
      await loadEvents();
    } catch (err) {
      handleErr(err, "Failed to deactivate event fee");
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Event Fees</h1>
            <p className="text-muted-foreground text-sm">
              One-off charges such as exams, festivals, or project work. Track
              paid and unpaid separately from monthly fees.
            </p>
          </div>
          <Button type="button" onClick={openCreate} disabled={!filterYearId}>
            <Plus className="size-4" />
            Create event
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Academic year</Label>
            <Select value={filterYearId} onValueChange={setFilterYearId}>
              <SelectTrigger className="w-[220px]">
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
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        ) : null}

        {loading ? (
          <LoadingPulseCard />
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No event fees for this academic year yet.
            </p>
            <Button type="button" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" />
              Create first event
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const summary = event.summary;
                  const total = summary?.totalApplicable ?? 0;
                  const paid = summary?.paid ?? 0;
                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="font-medium">{event.name}</div>
                        {event.description ? (
                          <div className="text-muted-foreground line-clamp-1 text-xs">
                            {event.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        ₹{event.amount.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        {event.scope === "SCHOOL" ? (
                          <span className="text-sm">Entire school</span>
                        ) : (
                          <span className="text-sm">
                            {event.classes.map((c) => c.label).join(", ") ||
                              "Selected classes"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatDisplayDate(event.dueDate)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {paid}/{total} paid
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {summary?.unpaid ?? 0} unpaid
                          {(summary?.partial ?? 0) > 0
                            ? ` · ${summary?.partial} partial`
                            : ""}
                          {(summary?.waived ?? 0) > 0
                            ? ` · ${summary?.waived} waived`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            event.isActive
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {event.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/school/event-fees/${event.id}`}>
                              Register
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(event)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {event.isActive ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => void onDeactivate(event)}
                            >
                              Deactivate
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={onSave}>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit event fee" : "Create event fee"}
              </DialogTitle>
              <DialogDescription>
                Set a one-off amount for the whole school or selected classes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1">
                <Label htmlFor="event-name">Name</Label>
                <Input
                  id="event-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Saraswati Puja"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="event-amount">Amount (₹)</Label>
                <Input
                  id="event-amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="event-description">Description (optional)</Label>
                <Textarea
                  id="event-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="event-date">Event date</Label>
                  <Input
                    id="event-date"
                    type="date"
                    value={form.eventDate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        eventDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="due-date">Due date</Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, dueDate: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Apply to</Label>
                {hasPayments ? (
                  <p className="text-muted-foreground text-xs">
                    Scope cannot be changed after payments have been recorded.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={form.scope === "SCHOOL" ? "default" : "outline"}
                    disabled={hasPayments}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        scope: "SCHOOL",
                        classIds: [],
                      }))
                    }
                  >
                    Entire school
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={form.scope === "CLASSES" ? "default" : "outline"}
                    disabled={hasPayments}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, scope: "CLASSES" }))
                    }
                  >
                    Selected classes
                  </Button>
                </div>
              </div>

              {form.scope === "CLASSES" ? (
                <div className="space-y-2">
                  <Label>Classes</Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {yearClasses.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        No classes found for this year.
                      </p>
                    ) : (
                      yearClasses.map((c) => {
                        const checked = form.classIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                              checked ? "bg-muted" : "hover:bg-muted/50",
                              hasPayments && "pointer-events-none opacity-60",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 rounded border"
                              checked={checked}
                              disabled={hasPayments}
                              onChange={() => toggleClassId(c.id)}
                            />
                            {c.label}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

              {editingId ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        isActive: e.target.checked,
                      }))
                    }
                  />
                  Active
                </label>
              ) : null}

              {formError ? (
                <p className="text-destructive text-sm" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
