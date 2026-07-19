"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";
import { cn } from "@/lib/utils";

type FeeStatus = "PAID" | "PARTIAL" | "UNPAID" | "WAIVED";
type Row = Record<string, unknown>;
type MonthCol = { year: number; month: number; key: string; label: string };
type MonthCell = {
  status: FeeStatus;
  amountDue: number | null;
  amountPaid: number;
  paidAt: string | null;
  notes: string | null;
  paymentId: string | null;
};

const ALL_CLASSES = "__all__";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
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

function statusTitle(cell: MonthCell): string {
  const due =
    cell.amountDue != null ? `Due ${cell.amountDue}` : "Fee not set";
  if (cell.status === "UNPAID") return `Unpaid · ${due}`;
  if (cell.status === "WAIVED") return `Waived · ${due}`;
  if (cell.status === "PARTIAL") {
    return `Partial · Paid ${cell.amountPaid} · ${due}${
      cell.paidAt ? ` · ${toDateInput(cell.paidAt)}` : ""
    }`;
  }
  return `Paid ${cell.amountPaid} · ${due}${
    cell.paidAt ? ` · ${toDateInput(cell.paidAt)}` : ""
  }`;
}

function classLabel(s: Row): string {
  return formatClassLabel(
    str(s.classLevel || s.className),
    str(s.section) || null,
  );
}

type Editor = {
  studentProfileId: string;
  studentName: string;
  year: number;
  month: number;
  key: string;
  amountDue: number | null;
};

export default function FeesPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell allowedRoles={["ADMIN"]}>
          <p className="text-sm text-muted-foreground">Loading fees...</p>
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
  const [editAmountPaid, setEditAmountPaid] = useState("");
  const [editPaidAt, setEditPaidAt] = useState(todayInput());
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState("");

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

  function openCell(student: Row, mo: MonthCol) {
    const monthsMap = (student.months ?? {}) as Record<string, MonthCell>;
    const cell = monthsMap[mo.key];
    const amountDue =
      cell?.amountDue ??
      (student.monthlyFee != null ? num(student.monthlyFee) : null);
    setEditor({
      studentProfileId: str(student.studentProfileId),
      studentName: str(student.name),
      year: mo.year,
      month: mo.month,
      key: mo.key,
      amountDue,
    });
    setEditStatus(cell?.status ?? "UNPAID");
    setEditAmountPaid(
      cell && cell.amountPaid > 0
        ? String(cell.amountPaid)
        : amountDue != null
          ? String(amountDue)
          : "",
    );
    setEditPaidAt(toDateInput(cell?.paidAt) || todayInput());
    setEditNotes(cell?.notes ?? "");
    setEditError("");
  }

  async function savePayment() {
    if (!editor || !filterYearId) return;
    setSavingPayment(true);
    setEditError("");
    setError("");
    setMessage("");
    try {
      if (
        (editStatus === "PAID" || editStatus === "PARTIAL") &&
        !editPaidAt
      ) {
        setEditError("Payment date is required for Paid or Partial.");
        setSavingPayment(false);
        return;
      }
      const amountPaid =
        editStatus === "UNPAID" || editStatus === "WAIVED"
          ? 0
          : Number(editAmountPaid);
      if (
        (editStatus === "PAID" || editStatus === "PARTIAL") &&
        (Number.isNaN(amountPaid) || amountPaid < 0)
      ) {
        setEditError("Enter a valid amount paid.");
        setSavingPayment(false);
        return;
      }

      await schoolApi.fees.upsertPayment({
        studentProfileId: editor.studentProfileId,
        academicYearId: filterYearId,
        year: editor.year,
        month: editor.month,
        status: editStatus,
        amountPaid,
        paidAt:
          editStatus === "PAID" ||
          editStatus === "PARTIAL" ||
          (editStatus === "WAIVED" && editPaidAt)
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

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Fees</h1>
          <p className="text-sm text-muted-foreground">
            Monthly fee payment status by student. Set monthly fees on the
            Classes page.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Academic year</Label>
            <Select
              value={filterYearId}
              onValueChange={(v) => {
                setFocusStudentId("");
                setFilterYearId(v);
              }}
            >
              <SelectTrigger className="w-48">
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
            <Label>Class</Label>
            <Select
              value={filterClassId}
              onValueChange={(v) => {
                setFocusStudentId("");
                setFilterClassId(v);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={str(c.id)} value={str(c.id)}>
                    {formatClassLabel(
                      str(c.classLevel) || str(c.name),
                      str(c.section) || null,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[14rem] flex-1 space-y-1 sm:max-w-xs">
            <Label htmlFor="fee-student-search">Search student</Label>
            <Input
              id="fee-student-search"
              value={nameQuery}
              onChange={(e) => {
                setFocusStudentId("");
                setNameQuery(e.target.value);
              }}
              placeholder="Search by name..."
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {selectedYearName
              ? `${selectedYearName} · Click a cell to update payment status.`
              : "Select an academic year."}{" "}
            P = Paid, H = Partial, U = Unpaid, W = Waived.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading register...</p>
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
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-max w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">
                      Class
                    </th>
                    <th className="sticky left-28 z-10 bg-muted px-3 py-2 text-left font-medium">
                      Student
                    </th>
                    <th className="sticky left-56 z-10 bg-muted px-3 py-2 text-left font-medium">
                      Fee
                    </th>
                    {months.map((mo) => (
                      <th
                        key={mo.key}
                        className="min-w-10 px-1 py-2 text-center font-medium"
                        title={mo.label}
                      >
                        {mo.label.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const id = str(s.studentProfileId);
                    const monthsMap = (s.months ?? {}) as Record<
                      string,
                      MonthCell
                    >;
                    return (
                      <tr key={id} className="border-t">
                        <td className="sticky left-0 z-10 bg-background px-3 py-1 whitespace-nowrap">
                          {classLabel(s)}
                        </td>
                        <td className="sticky left-28 z-10 bg-background px-3 py-1 font-medium whitespace-nowrap">
                          {str(s.name)}
                        </td>
                        <td className="sticky left-56 z-10 bg-background px-3 py-1 whitespace-nowrap text-muted-foreground">
                          {s.monthlyFee != null ? num(s.monthlyFee) : "—"}
                        </td>
                        {months.map((mo) => {
                          const cell = monthsMap[mo.key] ?? {
                            status: "UNPAID" as FeeStatus,
                            amountDue: null,
                            amountPaid: 0,
                            paidAt: null,
                            notes: null,
                            paymentId: null,
                          };
                          return (
                            <td key={mo.key} className="p-0.5 text-center">
                              <button
                                type="button"
                                title={statusTitle(cell)}
                                onClick={() => openCell(s, mo)}
                                className={cn(
                                  "mx-auto flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold",
                                  cell.status === "PAID" &&
                                    "bg-emerald-100 text-emerald-800",
                                  cell.status === "PARTIAL" &&
                                    "bg-amber-100 text-amber-800",
                                  cell.status === "WAIVED" &&
                                    "bg-sky-100 text-sky-800",
                                  cell.status === "UNPAID" &&
                                    "bg-muted/40 text-muted-foreground hover:bg-muted",
                                )}
                              >
                                {statusLetter(cell.status)}
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
              <DialogTitle>Update fee payment</DialogTitle>
              <DialogDescription>
                {editor
                  ? `${editor.studentName} · ${editor.year}-${String(editor.month).padStart(2, "0")}`
                  : ""}
                {editor?.amountDue != null
                  ? ` · Due ${editor.amountDue}`
                  : " · Monthly fee not set on class"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as FeeStatus)}
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

              {editStatus === "PAID" || editStatus === "PARTIAL" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="amount-paid">Amount paid</Label>
                    <Input
                      id="amount-paid"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editAmountPaid}
                      onChange={(e) => setEditAmountPaid(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="paid-at">Payment date</Label>
                    <Input
                      id="paid-at"
                      type="date"
                      value={editPaidAt}
                      onChange={(e) => setEditPaidAt(e.target.value)}
                    />
                  </div>
                </>
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
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
