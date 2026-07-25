"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

type FeeStatus = "PAID" | "PARTIAL" | "UNPAID" | "WAIVED";
type Row = Record<string, unknown>;
type AuditUser = { id: string; name: string; email: string };

type PaymentCell = {
  status: FeeStatus;
  amountDue: number;
  amountPaid: number;
  feeAmount: number;
  paidAt: string | null;
  notes: string | null;
  paymentId: string | null;
  createdBy: AuditUser | null;
  updatedBy: AuditUser | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type StudentRow = {
  studentProfileId: string;
  name: string;
  admissionNumber: string;
  classId: string;
  classLabel: string;
  payment: PaymentCell;
};

type SortKey = "student" | "class" | "status" | "updatedBy";
type SortDirection = "asc" | "desc";

function SortableHead({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey | null;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  const Icon = !active
    ? ArrowUpDown
    : sortDirection === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <TableHead
      aria-sort={
        active
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className="flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon
          className={cn(
            "size-3.5",
            active ? "text-foreground" : "text-muted-foreground/60",
          )}
        />
      </button>
    </TableHead>
  );
}

type EventInfo = {
  id: string;
  name: string;
  amount: number;
  scope: "SCHOOL" | "CLASSES";
  isActive: boolean;
  dueDate: string | null;
  eventDate: string | null;
  classes: Array<{ label: string }>;
  summary?: {
    totalApplicable: number;
    paid: number;
    partial: number;
    unpaid: number;
    waived: number;
  };
};

const ALL_CLASSES = "__all__";

function str(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown) {
  return typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
}

function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
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
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: FeeStatus) {
  switch (status) {
    case "PAID":
      return "Paid";
    case "PARTIAL":
      return "Partial";
    case "WAIVED":
      return "Waived";
    default:
      return "Unpaid";
  }
}

function statusBadgeClass(status: FeeStatus) {
  switch (status) {
    case "PAID":
      return "border-transparent bg-emerald-100 text-emerald-800";
    case "PARTIAL":
      return "border-transparent bg-amber-100 text-amber-800";
    case "WAIVED":
      return "border-transparent bg-sky-100 text-sky-800";
    default:
      return "border-transparent bg-rose-50 text-rose-700";
  }
}

function statusSortRank(status: FeeStatus) {
  switch (status) {
    case "UNPAID":
      return 0;
    case "PARTIAL":
      return 1;
    case "PAID":
      return 2;
    case "WAIVED":
      return 3;
  }
}

function statusFromAmounts(fee: number, paid: number): FeeStatus {
  if (paid <= 0) return "UNPAID";
  if (paid >= fee) return "PAID";
  return "PARTIAL";
}

function parseAudit(raw: unknown): AuditUser | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Row;
  if (!o.id) return null;
  return { id: str(o.id), name: str(o.name), email: str(o.email) };
}

function parsePayment(raw: Row, feeAmount: number): PaymentCell {
  return {
    status: (["PAID", "PARTIAL", "UNPAID", "WAIVED"].includes(str(raw.status))
      ? str(raw.status)
      : "UNPAID") as FeeStatus,
    amountDue: num(raw.amountDue),
    amountPaid: num(raw.amountPaid),
    feeAmount: num(raw.feeAmount) || feeAmount,
    paidAt: raw.paidAt ? str(raw.paidAt) : null,
    notes: raw.notes ? str(raw.notes) : null,
    paymentId: raw.paymentId ? str(raw.paymentId) : null,
    createdBy: parseAudit(raw.createdBy),
    updatedBy: parseAudit(raw.updatedBy),
    createdAt: raw.createdAt ? str(raw.createdAt) : null,
    updatedAt: raw.updatedAt ? str(raw.updatedAt) : null,
  };
}

export default function EventFeeRegisterPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = str(params.eventId);

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [filterClassId, setFilterClassId] = useState(ALL_CLASSES);
  const [statusFilter, setStatusFilter] = useState<"ALL" | FeeStatus>("ALL");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");

  const [editor, setEditor] = useState<StudentRow | null>(null);
  const [editMode, setEditMode] = useState<"view" | "edit">("view");
  const [editStatus, setEditStatus] = useState<FeeStatus>("UNPAID");
  const [editAmountPaid, setEditAmountPaid] = useState("0");
  const [editPaidAt, setEditPaidAt] = useState(todayInput());
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState("");
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

  const loadRegister = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.eventFees.register(eventId);
      const ev = res.event as Row;
      const feeAmount = num(ev.amount);
      const classesRaw = Array.isArray(ev.classes) ? ev.classes : [];
      const summaryRaw = (ev.summary ?? {}) as Row;
      setEvent({
        id: str(ev.id),
        name: str(ev.name),
        amount: feeAmount,
        scope: ev.scope === "CLASSES" ? "CLASSES" : "SCHOOL",
        isActive: ev.isActive !== false,
        dueDate: ev.dueDate ? str(ev.dueDate) : null,
        eventDate: ev.eventDate ? str(ev.eventDate) : null,
        classes: classesRaw.map((c) => ({ label: str((c as Row).label) })),
        summary: {
          totalApplicable: num(summaryRaw.totalApplicable),
          paid: num(summaryRaw.paid),
          partial: num(summaryRaw.partial),
          unpaid: num(summaryRaw.unpaid),
          waived: num(summaryRaw.waived),
        },
      });
      setStudents(
        res.students.map((s) => {
          const row = s as Row;
          return {
            studentProfileId: str(row.studentProfileId),
            name: str(row.name),
            admissionNumber: str(row.admissionNumber),
            classId: str(row.classId),
            classLabel: str(row.classLabel),
            payment: parsePayment((row.payment ?? {}) as Row, feeAmount),
          };
        }),
      );
    } catch (err) {
      handleErr(err, "Failed to load event fee register");
    } finally {
      setLoading(false);
    }
  }, [eventId, handleErr]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (!map.has(s.classId)) map.set(s.classId, s.classLabel);
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (filterClassId !== ALL_CLASSES && s.classId !== filterClassId) {
        return false;
      }
      if (statusFilter !== "ALL" && s.payment.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q)
      );
    });
  }, [students, filterClassId, statusFilter, nameQuery]);

  const sortedStudents = useMemo(() => {
    if (!sortKey) return filteredStudents;
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filteredStudents].sort((a, b) => {
      let comparison = 0;

      if (sortKey === "student") {
        comparison = a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "class") {
        comparison = a.classLabel.localeCompare(b.classLabel, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      } else if (sortKey === "status") {
        comparison =
          statusSortRank(a.payment.status) -
          statusSortRank(b.payment.status);
      } else {
        const aName = a.payment.updatedBy?.name?.trim() ?? "";
        const bName = b.payment.updatedBy?.name?.trim() ?? "";
        if (!aName && bName) return 1;
        if (aName && !bName) return -1;
        comparison = aName.localeCompare(bName, undefined, {
          sensitivity: "base",
        });
      }

      if (comparison !== 0) return comparison * direction;
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
    });
  }, [filteredStudents, sortKey, sortDirection]);

  const counts = useMemo(() => {
    if (event?.summary) return event.summary;
    return {
      totalApplicable: students.length,
      paid: students.filter((s) => s.payment.status === "PAID").length,
      partial: students.filter((s) => s.payment.status === "PARTIAL").length,
      unpaid: students.filter((s) => s.payment.status === "UNPAID").length,
      waived: students.filter((s) => s.payment.status === "WAIVED").length,
    };
  }, [event, students]);

  const feeAmount = event?.amount ?? 0;
  const calculatedDue = useMemo(() => {
    if (editStatus === "WAIVED" || editStatus === "PAID") return 0;
    const paid = Number(editAmountPaid);
    if (Number.isNaN(paid)) return feeAmount;
    return Math.max(0, feeAmount - paid);
  }, [editStatus, editAmountPaid, feeAmount]);

  function openStudent(row: StudentRow) {
    const isNewPayment = !row.payment.paymentId;
    setEditor(row);
    setEditMode(isNewPayment ? "edit" : "view");
    if (isNewPayment) {
      // Default to Paid so marking the first payment is one save click.
      setEditStatus("PAID");
      setEditAmountPaid(String(event?.amount ?? row.payment.feeAmount));
      setEditPaidAt(todayInput());
      setEditNotes("");
    } else {
      setEditStatus(row.payment.status);
      setEditAmountPaid(String(row.payment.amountPaid));
      setEditPaidAt(toDateInput(row.payment.paidAt) || todayInput());
      setEditNotes(row.payment.notes ?? "");
    }
    setEditError("");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function startEditing() {
    if (!editor) return;
    setEditMode("edit");
    setEditStatus(editor.payment.status);
    setEditAmountPaid(String(editor.payment.amountPaid));
    setEditPaidAt(toDateInput(editor.payment.paidAt) || todayInput());
    setEditNotes(editor.payment.notes ?? "");
    setEditError("");
  }

  async function savePayment() {
    if (!editor || !event) return;
    setEditError("");
    if ((editStatus === "PAID" || editStatus === "PARTIAL") && !editPaidAt) {
      setEditError("Payment date is required for paid or partial status.");
      return;
    }
    const amountPaid = Number(editAmountPaid);
    if (Number.isNaN(amountPaid) || amountPaid < 0) {
      setEditError("Amount paid must be a non-negative number.");
      return;
    }

    setSaving(true);
    try {
      await schoolApi.eventFees.upsertPayment(event.id, {
        studentProfileId: editor.studentProfileId,
        status: editStatus,
        amountPaid: editStatus === "UNPAID" ? 0 : amountPaid,
        paidAt:
          editStatus === "PAID" ||
          editStatus === "PARTIAL" ||
          (editStatus === "WAIVED" && editPaidAt)
            ? editPaidAt
            : null,
        notes: editNotes.trim() || null,
      });
      setMessage(`Updated payment for ${editor.name}.`);
      setEditor(null);
      await loadRegister();
    } catch (err) {
      setEditError(errorMessage(err, "Failed to save payment"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/dashboard/school/event-fees">
                <ArrowLeft className="size-4" />
                All event fees
              </Link>
            </Button>
            {loading && !event ? (
              <h1 className="text-2xl font-semibold tracking-tight">
                Event fee register
              </h1>
            ) : event ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {event.name}
                </h1>
                <p className="text-muted-foreground text-sm">
                  ₹{event.amount.toLocaleString("en-IN")}
                  {" · "}
                  {event.scope === "SCHOOL"
                    ? "Entire school"
                    : event.classes.map((c) => c.label).join(", ") ||
                      "Selected classes"}
                  {event.dueDate
                    ? ` · Due ${formatDisplayDate(event.dueDate)}`
                    : ""}
                  {!event.isActive ? " · Inactive" : ""}
                </p>
              </>
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">
                Event fee register
              </h1>
            )}
          </div>
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
        ) : !event ? (
          <p className="text-muted-foreground text-sm">Event fee not found.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Total {counts.totalApplicable}</Badge>
              <Badge
                variant="outline"
                className={statusBadgeClass("PAID")}
              >
                Paid {counts.paid}
              </Badge>
              <Badge
                variant="outline"
                className={statusBadgeClass("PARTIAL")}
              >
                Partial {counts.partial}
              </Badge>
              <Badge
                variant="outline"
                className={statusBadgeClass("UNPAID")}
              >
                Unpaid {counts.unpaid}
              </Badge>
              <Badge
                variant="outline"
                className={statusBadgeClass("WAIVED")}
              >
                Waived {counts.waived}
              </Badge>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="search-name">Search</Label>
                <Input
                  id="search-name"
                  className="w-[220px]"
                  placeholder="Name or admission no."
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Class</Label>
                <Select value={filterClassId} onValueChange={setFilterClassId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                    {classOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    setStatusFilter(v as "ALL" | FeeStatus)
                  }
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                    <SelectItem value="PARTIAL">Partial</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="WAIVED">Waived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Student"
                      column="student"
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label="Class"
                      column="class"
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label="Status"
                      column="status"
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                    <TableHead>Paid</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Payment date</TableHead>
                    <SortableHead
                      label="Updated by"
                      column="updatedBy"
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={toggleSort}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStudents.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-muted-foreground text-center text-sm"
                      >
                        No students match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedStudents.map((s) => (
                      <TableRow
                        key={s.studentProfileId}
                        className={cn(
                          "cursor-pointer",
                          !event.isActive && "opacity-70",
                        )}
                        onClick={() => openStudent(s)}
                      >
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {s.admissionNumber}
                          </div>
                        </TableCell>
                        <TableCell>{s.classLabel}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(s.payment.status)}
                          >
                            {statusLabel(s.payment.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          ₹{s.payment.amountPaid.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          ₹{s.payment.amountDue.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          {formatDisplayDate(s.payment.paidAt)}
                        </TableCell>
                        <TableCell>
                          {s.payment.updatedBy?.name?.trim() || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editMode === "view"
                ? "Payment details"
                : "Update event fee payment"}
            </DialogTitle>
            <DialogDescription>
              {editor
                ? `${editor.name} · ${editor.classLabel} · ₹${feeAmount.toLocaleString("en-IN")}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {editMode === "view" && editor ? (
            <>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(editor.payment.status)}
                  >
                    {statusLabel(editor.payment.status)}
                  </Badge>
                </div>
                <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="font-medium">
                    ₹{editor.payment.amountPaid.toLocaleString("en-IN")}
                  </span>
                  <span className="text-muted-foreground">Amount due</span>
                  <span className="font-medium">
                    ₹{editor.payment.amountDue.toLocaleString("en-IN")}
                  </span>
                  <span className="text-muted-foreground">Payment date</span>
                  <span className="font-medium">
                    {formatDisplayDate(editor.payment.paidAt)}
                  </span>
                  <span className="text-muted-foreground">Notes</span>
                  <span className="font-medium">
                    {editor.payment.notes?.trim() || "—"}
                  </span>
                </div>
                {editor.payment.createdAt || editor.payment.updatedAt ? (
                  <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
                      <span>Created by</span>
                      <span className="text-foreground">
                        {editor.payment.createdBy?.name ?? "—"}
                      </span>
                      <span>Created at</span>
                      <span className="text-foreground">
                        {formatDateTime(editor.payment.createdAt)}
                      </span>
                      <span>Updated by</span>
                      <span className="text-foreground">
                        {editor.payment.updatedBy?.name ?? "—"}
                      </span>
                      <span>Updated at</span>
                      <span className="text-foreground">
                        {formatDateTime(editor.payment.updatedAt)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditor(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={startEditing}
                  disabled={!event?.isActive}
                >
                  Edit details
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={editStatus}
                    onValueChange={(v) => {
                      const next = v as FeeStatus;
                      const wasPayable =
                        editStatus === "PAID" || editStatus === "PARTIAL";
                      const willBePayable =
                        next === "PAID" || next === "PARTIAL";
                      setEditStatus(next);
                      if (willBePayable && (!wasPayable || !editPaidAt)) {
                        setEditPaidAt(todayInput());
                      }
                      if (next === "PAID") {
                        setEditAmountPaid(String(feeAmount));
                      } else if (next === "UNPAID") {
                        setEditAmountPaid("0");
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PAID">Paid</SelectItem>
                      <SelectItem value="PARTIAL">Partial</SelectItem>
                      <SelectItem value="UNPAID">Unpaid</SelectItem>
                      <SelectItem value="WAIVED">Waived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Fee amount</Label>
                  <p className="text-sm font-medium">
                    ₹{feeAmount.toLocaleString("en-IN")}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="ev-amount-paid">Amount paid</Label>
                  <Input
                    id="ev-amount-paid"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editAmountPaid}
                    onChange={(e) => {
                      const nextPaid = e.target.value;
                      setEditAmountPaid(nextPaid);
                      if (editStatus === "WAIVED") return;
                      const paid = Number(nextPaid);
                      if (nextPaid.trim() === "" || Number.isNaN(paid)) return;
                      setEditStatus(statusFromAmounts(feeAmount, paid));
                      if (paid > 0 && !editPaidAt) {
                        setEditPaidAt(todayInput());
                      }
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="ev-amount-due">Amount due</Label>
                  <Input
                    id="ev-amount-due"
                    type="number"
                    value={String(calculatedDue)}
                    readOnly
                    className="bg-muted/40"
                  />
                </div>

                {(editStatus === "PAID" ||
                  editStatus === "PARTIAL" ||
                  editStatus === "WAIVED") && (
                  <div className="space-y-1">
                    <Label htmlFor="ev-paid-at">Payment date</Label>
                    <Input
                      id="ev-paid-at"
                      type="date"
                      value={editPaidAt}
                      onChange={(e) => setEditPaidAt(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="ev-notes">Notes</Label>
                  <Textarea
                    id="ev-notes"
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>

                {editError ? (
                  <p className="text-destructive text-sm" role="alert">
                    {editError}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditMode("view")}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void savePayment()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
