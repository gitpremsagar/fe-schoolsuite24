"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StudentEditSheet } from "@/components/students/student-edit-sheet";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { CLASS_LEVELS, formatClassLabel } from "@/lib/class-levels";
import { cn } from "@/lib/utils";

type FeeStatus = "PAID" | "PARTIAL" | "UNPAID" | "WAIVED";
type Row = Record<string, unknown>;
type MonthCol = { year: number; month: number; key: string; label: string };
type AuditUser = { id: string; name: string; email: string };
type MonthCell = {
  status: FeeStatus;
  amountDue: number | null;
  amountPaid: number;
  feeAmount?: number | null;
  paidAt: string | null;
  notes: string | null;
  paymentId: string | null;
  /** False for months before the student's admission date. */
  isApplicable?: boolean;
  createdBy: AuditUser | null;
  updatedBy: AuditUser | null;
  createdAt: string | null;
  updatedAt: string | null;
};
type SortKey = "name" | "class" | string; // month keys look like "2026-04"
type SortDir = "asc" | "desc";

const ALL_CLASSES = "__all__";

function getMonthCell(
  student: Row,
  monthKey: string,
): MonthCell | undefined {
  const monthsMap = (student.months ?? {}) as Record<string, MonthCell>;
  return monthsMap[monthKey];
}

/** Lower rank sorts first in ascending month sort (unpaid on top). */
function monthPaymentRank(cell: MonthCell | undefined): number {
  if (!cell || cell.isApplicable === false) return 3; // N/A last
  if (cell.status === "UNPAID") return 0;
  if (cell.status === "PARTIAL") return 1;
  return 2; // PAID / WAIVED
}

function paidAtTimestamp(cell: MonthCell | undefined): number {
  if (!cell?.paidAt) return Number.POSITIVE_INFINITY;
  const t = new Date(cell.paidAt).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Compare two students for a month-column sort starting at `startKey`.
 *
 * 1. Payment status cascades through the clicked month and every later month
 *    (unpaid, then partial, then paid/waived) so later unpaid cells still rise
 *    within earlier paid groups.
 * 2. Only after statuses match through those months, payment dates cascade —
 *    each month uses its own paidAt.
 */
function compareStudentsByMonthCascade(
  a: Row,
  b: Row,
  startKey: string,
  monthCols: MonthCol[],
  dir: number,
): number {
  const startIdx = monthCols.findIndex((m) => m.key === startKey);
  if (startIdx < 0) return 0;

  for (let i = startIdx; i < monthCols.length; i++) {
    const key = monthCols[i].key;
    const ra = monthPaymentRank(getMonthCell(a, key));
    const rb = monthPaymentRank(getMonthCell(b, key));
    if (ra !== rb) return dir * (ra - rb);
  }

  for (let i = startIdx; i < monthCols.length; i++) {
    const key = monthCols[i].key;
    const ca = getMonthCell(a, key);
    const cb = getMonthCell(b, key);
    const rank = monthPaymentRank(ca);
    // Only compare dates for partial/paid/waived months.
    if (rank !== 1 && rank !== 2) continue;
    const ta = paidAtTimestamp(ca);
    const tb = paidAtTimestamp(cb);
    if (ta !== tb) return dir * (ta - tb);
  }

  return dir * str(a.name).localeCompare(str(b.name), undefined, {
    sensitivity: "base",
  });
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (dateOnly) return dateOnly[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return localDateInput(d);
}

function localDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string | null | undefined): string {
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

function todayInput(): string {
  return localDateInput(new Date());
}

function monthYearLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusLetter(status: FeeStatus): string {
  switch (status) {
    case "PAID":
      return "P";
    case "PARTIAL":
      return "H";
    case "WAIVED":
      return "W";
    default:
      return "U";
  }
}

/** Compact day/month for register cells (avoids timezone drift on date-only ISO). */
function formatPaidAtShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (dateOnly) {
    const day = Number(dateOnly[3]);
    const monthName = months[Number(dateOnly[2]) - 1];
    if (!monthName || !Number.isFinite(day)) return null;
    return `${day}/${monthName}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()}/${months[d.getMonth()]}`;
}

function formatPaidAtLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (dateOnly) {
    const day = Number(dateOnly[3]);
    const monthName = months[Number(dateOnly[2]) - 1];
    const year = dateOnly[1];
    if (!monthName || !Number.isFinite(day)) return "—";
    return `${day} ${monthName} ${year}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function statusTitle(cell: MonthCell): string {
  if (cell.isApplicable === false) {
    return "Not applicable · Before date of admission";
  }
  const feeValue = feeAmountOf(cell);
  const fee = feeValue != null ? `Fee ${feeValue}` : "Fee not set";
  const balance = remainingDue(cell);
  const dueLabel =
    balance == null ? fee : `Due ${balance}${feeValue != null ? ` · ${fee}` : ""}`;
  if (cell.status === "UNPAID") return `Unpaid · ${dueLabel}`;
  if (cell.status === "WAIVED") return `Waived · ${dueLabel}`;
  if (cell.status === "PARTIAL") {
    return `Partial · Paid ${cell.amountPaid} · ${dueLabel}${
      cell.paidAt ? ` · ${toDateInput(cell.paidAt)}` : ""
    }`;
  }
  return `Paid ${cell.amountPaid} · ${dueLabel}${
    cell.paidAt ? ` · ${toDateInput(cell.paidAt)}` : ""
  }`;
}

/** Fee amount for a cell (class fee, or paid + remaining due). */
function feeAmountOf(cell: {
  status: FeeStatus;
  amountDue: number | null;
  amountPaid: number;
  feeAmount?: number | null;
}): number | null {
  if (cell.feeAmount != null) return cell.feeAmount;
  if (cell.amountDue == null) return null;
  if (cell.status === "PAID" || cell.status === "WAIVED") {
    return cell.amountPaid > 0 ? cell.amountPaid : cell.amountDue;
  }
  return cell.amountPaid + cell.amountDue;
}

/** Outstanding balance stored as amountDue (0 when fully paid or waived). */
function remainingDue(cell: {
  status: FeeStatus;
  amountDue: number | null;
  amountPaid: number;
  feeAmount?: number | null;
}): number | null {
  if (cell.status === "PAID" || cell.status === "WAIVED") return 0;
  if (cell.amountDue == null) return null;
  return Math.max(0, cell.amountDue);
}

function statusFromAmounts(fee: number, paid: number): FeeStatus {
  if (paid <= 0) return "UNPAID";
  if (paid >= fee) return "PAID";
  return "PARTIAL";
}

function classLabel(s: Row, compact = false): string {
  return formatClassLabel(
    str(s.classLevel || s.className),
    str(s.section) || null,
    { compact },
  );
}

function classSortIndex(level: string): number {
  const idx = (CLASS_LEVELS as readonly string[]).indexOf(level);
  return idx >= 0 ? idx : CLASS_LEVELS.length;
}

function statusLabel(status: FeeStatus): string {
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

function statusBadgeClass(status: FeeStatus): string {
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

type Editor = {
  studentProfileId: string;
  studentName: string;
  year: number;
  month: number;
  key: string;
  mode: "view" | "edit";
  currentStatus: FeeStatus;
  feeAmount: number | null;
  amountDue: number | null;
  amountPaid: number;
  paidAt: string | null;
  notes: string | null;
  createdBy: AuditUser | null;
  updatedBy: AuditUser | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function FeesPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell allowedRoles={["ADMIN"]}>
          <LoadingPulseCard />
        </DashboardShell>
      }
    >
      <FeesPageContent />
    </Suspense>
  );
}

function FeesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStudent = searchParams.get("student") ?? "";
  const initialQ = searchParams.get("q") ?? "";
  const initialClassId = searchParams.get("classId") ?? "";
  const initialYear = searchParams.get("year") ?? "";

  const [years, setYears] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [filterYearId, setFilterYearId] = useState(initialYear);
  const [filterClassId, setFilterClassId] = useState(
    initialClassId || ALL_CLASSES,
  );
  const [nameQuery, setNameQuery] = useState(initialQ);
  const [focusStudentId, setFocusStudentId] = useState(initialStudent);
  const [months, setMonths] = useState<MonthCol[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [editStatus, setEditStatus] = useState<FeeStatus>("PAID");
  const [editAmountDue, setEditAmountDue] = useState("");
  const [editAmountPaid, setEditAmountPaid] = useState("");
  const [editPaidAt, setEditPaidAt] = useState(todayInput());
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [hoverColKey, setHoverColKey] = useState<string | null>(null);

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
        const [yr, cls] = await Promise.all([
          schoolApi.academicYears.list(),
          schoolApi.classes.list(),
        ]);
        setYears(yr.academicYears);
        setClasses(cls.classes);
        const current = yr.academicYears.find((y) => y.isCurrent);
        const currentId = current
          ? str(current.id)
          : str(yr.academicYears[0]?.id);
        const yearExists = initialYear
          ? yr.academicYears.some((y) => str(y.id) === initialYear)
          : false;
        setFilterYearId((prev) => prev || (yearExists ? initialYear : currentId));
      } catch (err) {
        handleErr(err, "Failed to load academic years");
      }
    })();
  }, [handleErr, initialYear]);

  const loadRegister = useCallback(async () => {
    if (!filterYearId) return;
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.fees.register(filterYearId);
      setMonths(res.months);
      setStudents(res.students);
    } catch (err) {
      handleErr(err, "Failed to load fee register");
    } finally {
      setLoading(false);
    }
  }, [filterYearId, handleErr]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const selectedYearName = useMemo(() => {
    const y = years.find((row) => str(row.id) === filterYearId);
    return y ? str(y.name) : "";
  }, [years, filterYearId]);

  const filteredStudents = useMemo(() => {
    if (focusStudentId) {
      return students.filter(
        (s) => str(s.studentProfileId) === focusStudentId,
      );
    }
    const q = nameQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (filterClassId !== ALL_CLASSES && str(s.classId) !== filterClassId) {
        return false;
      }
      if (!q) return true;
      return str(s.name).toLowerCase().includes(q);
    });
  }, [students, filterClassId, nameQuery, focusStudentId]);

  const sortedStudents = useMemo(() => {
    if (!sortKey) return filteredStudents;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredStudents].sort((a, b) => {
      if (sortKey === "name") {
        return dir * str(a.name).localeCompare(str(b.name), undefined, {
          sensitivity: "base",
        });
      }
      if (sortKey === "class") {
        const byLevel =
          classSortIndex(str(a.classLevel)) - classSortIndex(str(b.classLevel));
        if (byLevel !== 0) return dir * byLevel;
        const bySection = str(a.section).localeCompare(str(b.section), undefined, {
          sensitivity: "base",
        });
        if (bySection !== 0) return dir * bySection;
        return dir * classLabel(a).localeCompare(classLabel(b), undefined, {
          sensitivity: "base",
        });
      }
      return compareStudentsByMonthCascade(a, b, sortKey, months, dir);
    });
  }, [filteredStudents, sortKey, sortDir, months]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function SortableHead({
    label,
    column,
    className,
    title,
    onMouseEnter,
  }: {
    label: string;
    column: SortKey;
    className?: string;
    title?: string;
    onMouseEnter?: () => void;
  }) {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={className} title={title} onMouseEnter={onMouseEnter}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={cn(
            "inline-flex items-center justify-center gap-0.5 font-medium hover:text-foreground",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </th>
    );
  }

  function openCell(student: Row, mo: MonthCol) {
    const monthsMap = (student.months ?? {}) as Record<string, MonthCell>;
    const cell = monthsMap[mo.key];
    if (cell?.isApplicable === false) return;
    const currentStatus = cell?.status ?? "UNPAID";
    const feeAmount =
      cell?.feeAmount ??
      feeAmountOf(
        cell ?? {
          status: "UNPAID",
          amountDue:
            student.monthlyFee != null ? num(student.monthlyFee) : null,
          amountPaid: 0,
        },
      ) ??
      (student.monthlyFee != null ? num(student.monthlyFee) : null);
    const amountDue =
      cell != null
        ? remainingDue(cell)
        : feeAmount;
    const amountPaid = cell?.amountPaid ?? 0;
    const paidAt = cell?.paidAt ?? null;
    const notes = cell?.notes ?? null;
    const isPaid = currentStatus === "PAID";
    const openAsView = currentStatus === "PAID" || currentStatus === "PARTIAL";

    setEditor({
      studentProfileId: str(student.studentProfileId),
      studentName: str(student.name),
      year: mo.year,
      month: mo.month,
      key: mo.key,
      mode: openAsView ? "view" : "edit",
      currentStatus,
      feeAmount,
      amountDue,
      amountPaid,
      paidAt,
      notes,
      createdBy: cell?.createdBy ?? null,
      updatedBy: cell?.updatedBy ?? null,
      createdAt: cell?.createdAt ?? null,
      updatedAt: cell?.updatedAt ?? null,
    });
    setEditStatus(
      currentStatus === "WAIVED"
        ? "WAIVED"
        : currentStatus === "UNPAID"
          ? "PAID"
          : feeAmount != null
            ? statusFromAmounts(feeAmount, amountPaid)
            : currentStatus,
    );
    setEditAmountDue(feeAmount != null ? String(feeAmount) : "");
    setEditAmountPaid(
      currentStatus === "PAID"
        ? feeAmount != null
          ? String(feeAmount)
          : String(amountPaid)
        : currentStatus === "PARTIAL"
          ? String(amountPaid)
          : currentStatus === "UNPAID"
            ? feeAmount != null
              ? String(feeAmount)
              : "0"
            : String(amountPaid),
    );
    setEditPaidAt(toDateInput(paidAt) || todayInput());
    setEditNotes(notes ?? "");
    setEditError("");
  }

  function startEditingPayment() {
    setEditor((prev) => (prev ? { ...prev, mode: "edit" } : prev));
    setEditError("");
  }

  const editFeeAmount = Number(editAmountDue);
  const editPaidAmountNum = Number(editAmountPaid);
  const calculatedDueAmount =
    editAmountDue.trim() === "" || Number.isNaN(editFeeAmount)
      ? null
      : Math.max(
          0,
          editFeeAmount -
            (editAmountPaid.trim() === "" || Number.isNaN(editPaidAmountNum)
              ? 0
              : editPaidAmountNum),
        );

  async function savePayment() {
    if (!editor || !filterYearId) return;
    setSavingPayment(true);
    setEditError("");
    setError("");
    setMessage("");
    try {
      const feeAmount = Number(editAmountDue);
      if (editAmountDue.trim() === "" || Number.isNaN(feeAmount) || feeAmount < 0) {
        setEditError("Fee amount is missing. Set the class monthly fee first.");
        setSavingPayment(false);
        return;
      }

      const amountPaid = Number(editAmountPaid);
      if (
        editAmountPaid.trim() === "" ||
        Number.isNaN(amountPaid) ||
        amountPaid < 0
      ) {
        setEditError("Enter a valid amount paid.");
        setSavingPayment(false);
        return;
      }

      const amountDue =
        calculatedDueAmount == null
          ? Math.max(0, feeAmount - amountPaid)
          : calculatedDueAmount;
      const status =
        editStatus === "WAIVED"
          ? "WAIVED"
          : statusFromAmounts(feeAmount, amountPaid);

      if ((status === "PAID" || status === "PARTIAL") && !editPaidAt) {
        setEditError("Payment date is required for Paid or Partial.");
        setSavingPayment(false);
        return;
      }

      await schoolApi.fees.upsertPayment({
        studentProfileId: editor.studentProfileId,
        academicYearId: filterYearId,
        year: editor.year,
        month: editor.month,
        status,
        feeAmount,
        amountDue,
        amountPaid: status === "UNPAID" ? 0 : amountPaid,
        paidAt:
          status === "PAID" ||
          status === "PARTIAL" ||
          (status === "WAIVED" && editPaidAt)
            ? editPaidAt
            : null,
        notes: editNotes.trim() || null,
      });
      setMessage("Fee payment updated.");
      setEditor(null);
      await loadRegister();
    } catch (err) {
      handleErr(err, "Failed to save fee payment");
    } finally {
      setSavingPayment(false);
    }
  }

  const showClassColumn =
    filterClassId === ALL_CLASSES && !focusStudentId;

  function hoverBg(rowId: string | null, colKey?: string): string {
    const rowOn = rowId != null && hoverRowId === rowId;
    const colOn = colKey != null && hoverColKey === colKey;
    if (rowOn && colOn) return "bg-sky-200";
    if (rowOn || colOn) return "bg-sky-100";
    return "";
  }

  function setHover(rowId: string | null, colKey: string | null) {
    setHoverRowId(rowId);
    setHoverColKey(colKey);
  }

  function clearHover() {
    setHoverRowId(null);
    setHoverColKey(null);
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Fees</h1>
          <Input
            id="fee-student-search"
            value={nameQuery}
            onChange={(e) => {
              setFocusStudentId("");
              setNameQuery(e.target.value);
            }}
            placeholder="Search by name..."
            className="min-w-[12rem] flex-1 sm:max-w-xs"
            aria-label="Search student"
          />
          <Select
            value={filterClassId}
            onValueChange={(v) => {
              setFocusStudentId("");
              setFilterClassId(v);
            }}
          >
            <SelectTrigger className="w-48" aria-label="Class">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={str(c.id)} value={str(c.id)}>
                  {formatClassLabel(
                    str(c.classLevel) || str(c.name),
                    str(c.section) || null,
                    { compact: true },
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterYearId}
            onValueChange={(v) => {
              setFocusStudentId("");
              setFilterYearId(v);
            }}
          >
            <SelectTrigger className="w-48" aria-label="Session">
              <SelectValue placeholder="Session" />
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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        <div>
          {loading ? (
            <LoadingPulseCard />
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {selectedYearName
                ? `No enrolled students for ${selectedYearName}.`
                : "No students."}
            </p>
          ) : filteredStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students match the current search or class filter.
            </p>
          ) : (
            <div
              className="max-h-[calc(100vh-10rem)] max-w-full overflow-auto rounded-xl border"
              onMouseLeave={clearHover}
            >
              <table className="w-max min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted">
                    <th
                      className="sticky left-0 top-0 z-30 w-10 min-w-10 max-w-10 bg-muted px-1 py-2 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]"
                      onMouseEnter={clearHover}
                    >
                      #
                    </th>
                    {showClassColumn ? (
                      <SortableHead
                        label="Class"
                        column="class"
                        className="sticky left-10 top-0 z-30 w-28 min-w-28 max-w-28 bg-muted px-3 py-2 text-left shadow-[0_1px_0_0_hsl(var(--border))]"
                        onMouseEnter={clearHover}
                      />
                    ) : null}
                    <SortableHead
                      label="Student"
                      column="name"
                      className={cn(
                        "sticky top-0 z-30 w-40 min-w-40 max-w-40 bg-muted px-3 py-2 text-left shadow-[0_1px_0_0_hsl(var(--border))]",
                        showClassColumn ? "left-[9.5rem]" : "left-10",
                      )}
                      onMouseEnter={clearHover}
                    />
                    <th
                      className={cn(
                        "sticky top-0 z-30 w-16 min-w-16 max-w-16 bg-muted px-2 py-2 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12),0_1px_0_0_hsl(var(--border))]",
                        showClassColumn ? "left-[19.5rem]" : "left-[12.5rem]",
                      )}
                      onMouseEnter={clearHover}
                    >
                      Fee
                    </th>
                    {months.map((mo) => (
                      <SortableHead
                        key={mo.key}
                        label={mo.label.split(" ")[0]}
                        column={mo.key}
                        title={`${mo.label} · Unpaid first through later months, then each month's own payment date`}
                        className={cn(
                          "sticky top-0 z-20 min-w-[4rem] px-1 py-2 text-center shadow-[0_1px_0_0_hsl(var(--border))]",
                          hoverColKey === mo.key ? "bg-sky-200" : "bg-muted",
                        )}
                        onMouseEnter={() => setHover(null, mo.key)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((s, index) => {
                    const id = str(s.studentProfileId);
                    const monthsMap = (s.months ?? {}) as Record<
                      string,
                      MonthCell
                    >;
                    return (
                      <tr key={id}>
                        <td
                          className={cn(
                            "sticky left-0 z-10 w-10 min-w-10 max-w-10 border-t px-1 py-1 text-center text-muted-foreground",
                            hoverBg(id) || "bg-background",
                          )}
                          onMouseEnter={() => setHover(id, null)}
                        >
                          {index + 1}
                        </td>
                        {showClassColumn ? (
                          <td
                            className={cn(
                              "sticky left-10 z-10 w-28 min-w-28 max-w-28 truncate border-t px-3 py-1",
                              hoverBg(id) || "bg-background",
                            )}
                            title={classLabel(s)}
                            onMouseEnter={() => setHover(id, null)}
                          >
                            {classLabel(s, true)}
                          </td>
                        ) : null}
                        <td
                          className={cn(
                            "sticky z-10 w-40 min-w-40 max-w-40 border-t px-3 py-1 font-medium",
                            showClassColumn ? "left-[9.5rem]" : "left-10",
                            hoverBg(id) || "bg-background",
                          )}
                          title={str(s.name)}
                          onMouseEnter={() => setHover(id, null)}
                        >
                          <span className="inline-flex max-w-full items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditStudentId(id)}
                              className="inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Edit student"
                              aria-label={`Edit ${str(s.name)}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <span className="truncate">{str(s.name)}</span>
                          </span>
                        </td>
                        <td
                          className={cn(
                            "sticky z-10 w-16 min-w-16 max-w-16 border-t px-2 py-1 text-muted-foreground shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]",
                            showClassColumn ? "left-[19.5rem]" : "left-[12.5rem]",
                            hoverBg(id) || "bg-background",
                          )}
                          onMouseEnter={() => setHover(id, null)}
                        >
                          {s.monthlyFee != null ? num(s.monthlyFee) : "—"}
                        </td>
                        {months.map((mo) => {
                          const cell = monthsMap[mo.key] ?? {
                            status: "UNPAID" as FeeStatus,
                            amountDue: null,
                            amountPaid: 0,
                            feeAmount: null,
                            paidAt: null,
                            notes: null,
                            paymentId: null,
                            isApplicable: true,
                            createdBy: null,
                            updatedBy: null,
                            createdAt: null,
                            updatedAt: null,
                          };
                          const applicable = cell.isApplicable !== false;
                          const colHighlight = hoverBg(id, mo.key);
                          if (!applicable) {
                            return (
                              <td
                                key={mo.key}
                                className={cn("p-1 text-center", colHighlight)}
                                onMouseEnter={() => setHover(id, mo.key)}
                              >
                                <span
                                  title={statusTitle({
                                    ...cell,
                                    isApplicable: false,
                                  })}
                                  className="mx-auto flex h-9 w-14 items-center justify-center rounded bg-transparent text-[10px] font-medium text-muted-foreground/70"
                                >
                                  N/A
                                </span>
                              </td>
                            );
                          }
                          const paidAtShort =
                            cell.status === "PAID"
                              ? formatPaidAtShort(cell.paidAt)
                              : null;
                          const partialDue =
                            cell.status === "PARTIAL"
                              ? remainingDue(cell)
                              : null;
                          const subline =
                            paidAtShort ??
                            (partialDue != null ? `due ${partialDue}` : "\u00a0");
                          return (
                            <td
                              key={mo.key}
                              className={cn("p-1 text-center", colHighlight)}
                              onMouseEnter={() => setHover(id, mo.key)}
                            >
                              <button
                                type="button"
                                title={statusTitle(cell)}
                                onClick={() => openCell(s, mo)}
                                className={cn(
                                  "mx-auto flex h-9 w-14 flex-col items-center justify-center rounded px-1 py-0.5 text-[11px] font-semibold leading-tight",
                                  cell.status === "PAID" &&
                                    "bg-emerald-100 text-emerald-800",
                                  cell.status === "PARTIAL" &&
                                    "bg-amber-100 text-amber-800",
                                  cell.status === "WAIVED" &&
                                    "bg-sky-100 text-sky-800",
                                  cell.status === "UNPAID" &&
                                    "bg-rose-50 text-rose-700 hover:bg-rose-100",
                                )}
                              >
                                <span>{statusLetter(cell.status)}</span>
                                <span className="h-2.5 text-[9px] font-medium opacity-80">
                                  {subline}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog
          open={editor != null}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editor?.mode === "view" ? "Fee payment details" : "Update fee payment"}
              </DialogTitle>
              <DialogDescription>
                {editor
                  ? `${editor.studentName} · ${monthYearLabel(editor.year, editor.month)}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            {editor?.mode === "view" ? (
              <>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">Status</span>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(editor.currentStatus)}
                    >
                      {statusLabel(editor.currentStatus)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Fee amount</span>
                    <span className="font-medium">
                      {editor.feeAmount != null ? editor.feeAmount : "—"}
                    </span>
                    <span className="text-muted-foreground">Amount paid</span>
                    <span className="font-medium">{editor.amountPaid}</span>
                    <span className="text-muted-foreground">Amount due</span>
                    <span className="font-medium">
                      {editor.amountDue != null ? editor.amountDue : "—"}
                    </span>
                    <span className="text-muted-foreground">Payment date</span>
                    <span className="font-medium">
                      {formatPaidAtLong(editor.paidAt)}
                    </span>
                    <span className="text-muted-foreground">Notes</span>
                    <span className="font-medium">
                      {editor.notes?.trim() ? editor.notes : "—"}
                    </span>
                  </div>

                  {editor.createdAt || editor.updatedAt ? (
                    <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
                        <span>Created by</span>
                        <span className="text-foreground">
                          {editor.createdBy?.name ?? "—"}
                        </span>
                        <span>Created at</span>
                        <span className="text-foreground">
                          {formatDateTime(editor.createdAt)}
                        </span>
                        <span>Updated by</span>
                        <span className="text-foreground">
                          {editor.updatedBy?.name ?? "—"}
                        </span>
                        <span>Updated at</span>
                        <span className="text-foreground">
                          {formatDateTime(editor.updatedAt)}
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
                  <Button type="button" onClick={startEditingPayment}>
                    Edit details
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="space-y-4 py-2">
                  {editor ? (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">
                        Current status
                      </span>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(editor.currentStatus)}
                      >
                        {statusLabel(editor.currentStatus)}
                      </Badge>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label>New status</Label>
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
                          const fee = Number(editAmountDue);
                          if (
                            editAmountDue.trim() !== "" &&
                            !Number.isNaN(fee) &&
                            fee >= 0
                          ) {
                            setEditAmountPaid(String(fee));
                          }
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
                    {editStatus === "PAID" ? (
                      <p className="text-muted-foreground text-xs">
                        Marking paid also marks all earlier months in this year
                        as paid.
                      </p>
                    ) : null}
                    {editStatus === "UNPAID" ? (
                      <p className="text-muted-foreground text-xs">
                        Marking unpaid also marks all later months in this year
                        as unpaid.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <Label>Fee amount</Label>
                    <p className="text-sm font-medium">
                      {editAmountDue.trim() !== "" ? editAmountDue : "—"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="amount-paid">Amount paid</Label>
                    <Input
                      id="amount-paid"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editAmountPaid}
                      onChange={(e) => {
                        const nextPaid = e.target.value;
                        setEditAmountPaid(nextPaid);
                        if (editStatus === "WAIVED") return;
                        const fee = Number(editAmountDue);
                        const paid = Number(nextPaid);
                        if (
                          editAmountDue.trim() === "" ||
                          Number.isNaN(fee) ||
                          nextPaid.trim() === "" ||
                          Number.isNaN(paid)
                        ) {
                          return;
                        }
                        setEditStatus(statusFromAmounts(fee, paid));
                        if (paid > 0 && !editPaidAt) {
                          setEditPaidAt(todayInput());
                        }
                      }}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="amount-due">Amount due</Label>
                    <Input
                      id="amount-due"
                      type="number"
                      value={
                        calculatedDueAmount == null
                          ? ""
                          : String(calculatedDueAmount)
                      }
                      readOnly
                      className="bg-muted/40"
                    />
                    <p className="text-muted-foreground text-xs">
                      Calculated as fee amount minus amount paid.
                    </p>
                  </div>

                  {editStatus === "PAID" || editStatus === "PARTIAL" ? (
                    <div className="space-y-1">
                      <Label htmlFor="paid-at">Payment date</Label>
                      <Input
                        id="paid-at"
                        type="date"
                        value={editPaidAt}
                        onChange={(e) => setEditPaidAt(e.target.value)}
                      />
                    </div>
                  ) : null}

                  {editStatus === "WAIVED" ? (
                    <div className="space-y-1">
                      <Label htmlFor="waived-at">Waiver date (optional)</Label>
                      <Input
                        id="waived-at"
                        type="date"
                        value={editPaidAt}
                        onChange={(e) => setEditPaidAt(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label htmlFor="fee-notes">Notes</Label>
                    <Input
                      id="fee-notes"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  {editor?.createdAt || editor?.updatedAt ? (
                    <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
                        <span>Created by</span>
                        <span className="text-foreground">
                          {editor.createdBy?.name ?? "—"}
                        </span>
                        <span>Created at</span>
                        <span className="text-foreground">
                          {formatDateTime(editor.createdAt)}
                        </span>
                        <span>Updated by</span>
                        <span className="text-foreground">
                          {editor.updatedBy?.name ?? "—"}
                        </span>
                        <span>Updated at</span>
                        <span className="text-foreground">
                          {formatDateTime(editor.updatedAt)}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {editError ? (
                    <p className="text-sm text-destructive">{editError}</p>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditor(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={savePayment}
                    disabled={savingPayment}
                  >
                    {savingPayment ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <StudentEditSheet
          studentId={editStudentId}
          academicYearId={filterYearId || null}
          open={editStudentId != null}
          onOpenChange={(open) => {
            if (!open) setEditStudentId(null);
          }}
          onSaved={() => {
            setMessage("Student updated.");
            void loadRegister();
          }}
        />
      </div>
    </DashboardShell>
  );
}
