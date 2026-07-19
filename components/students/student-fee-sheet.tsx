"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { cn } from "@/lib/utils";

type FeeStatus = "PAID" | "PARTIAL" | "UNPAID" | "WAIVED";
type MonthCell = {
  status: FeeStatus;
  amountDue: number | null;
  amountPaid: number;
  paidAt: string | null;
  notes: string | null;
};
type MonthCol = { year: number; month: number; key: string; label: string };
type Row = Record<string, unknown>;

type StudentFeeSheetProps = {
  studentId: string | null;
  studentName?: string;
  academicYearId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function monthShort(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString("en-IN", {
    month: "short",
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

function statusClasses(status: FeeStatus): string {
  switch (status) {
    case "PAID":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "PARTIAL":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "WAIVED":
      return "border-sky-200 bg-sky-100 text-sky-800";
    default:
      return "border-muted bg-muted/40 text-muted-foreground";
  }
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

function sortAcademicYears(years: Row[]) {
  return [...years].sort((a, b) => {
    const aStart = new Date(str(a.startDate)).getTime();
    const bStart = new Date(str(b.startDate)).getTime();
    return aStart - bStart;
  });
}

export function StudentFeeSheet({
  studentId,
  studentName,
  academicYearId,
  open,
  onOpenChange,
}: StudentFeeSheetProps) {
  const router = useRouter();
  const [academicYears, setAcademicYears] = useState<Row[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [months, setMonths] = useState<MonthCol[]>([]);
  const [monthMap, setMonthMap] = useState<Record<string, MonthCell>>({});
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState(true);

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
    if (!open || !studentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const yearsRes = await schoolApi.academicYears.list();
        if (!active) return;
        const sorted = sortAcademicYears(yearsRes.academicYears);
        setAcademicYears(sorted);

        const current = sorted.find((y) => y.isCurrent);
        const preferredId =
          (academicYearId &&
          sorted.some((y) => str(y.id) === academicYearId)
            ? academicYearId
            : null) ||
          (current ? str(current.id) : "") ||
          str(sorted[sorted.length - 1]?.id);
        setSelectedYearId(preferredId);
        if (!preferredId) {
          setLoading(false);
        }
      } catch (err) {
        if (active) handleErr(err, "Failed to load academic years");
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, studentId, academicYearId, handleErr]);

  useEffect(() => {
    if (!open || !studentId || !selectedYearId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await schoolApi.fees.register(selectedYearId);
        if (!active) return;
        setMonths(res.months);
        const row = res.students.find(
          (s) => str(s.studentProfileId) === studentId,
        );
        if (!row) {
          setFound(false);
          setMonthMap({});
          setMonthlyFee(null);
        } else {
          setFound(true);
          setMonthMap((row.months ?? {}) as Record<string, MonthCell>);
          setMonthlyFee(
            row.monthlyFee == null ? null : Number(row.monthlyFee),
          );
        }
      } catch (err) {
        if (active) handleErr(err, "Failed to load fee details");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, studentId, selectedYearId, handleErr]);

  const selectedIndex = useMemo(
    () => academicYears.findIndex((y) => str(y.id) === selectedYearId),
    [academicYears, selectedYearId],
  );

  const selectedYear = selectedIndex >= 0 ? academicYears[selectedIndex] : null;

  const yearMonths = useMemo(() => {
    return months.map((mo) => {
      const cell =
        monthMap[mo.key] ??
        ({
          status: "UNPAID" as FeeStatus,
          amountDue: monthlyFee,
          amountPaid: 0,
          paidAt: null,
          notes: null,
        } satisfies MonthCell);
      return { ...mo, cell };
    });
  }, [months, monthMap, monthlyFee]);

  const yearSummary = useMemo(() => {
    let due = 0;
    let paid = 0;
    let paidMonths = 0;
    let unpaidMonths = 0;
    for (const { cell } of yearMonths) {
      if (cell.amountDue != null) due += cell.amountDue;
      paid += cell.amountPaid;
      if (cell.status === "PAID" || cell.status === "WAIVED") paidMonths += 1;
      if (cell.status === "UNPAID" || cell.status === "PARTIAL") {
        unpaidMonths += 1;
      }
    }
    return { due, paid, paidMonths, unpaidMonths };
  }, [yearMonths]);

  function shiftAcademicYear(delta: number) {
    const next = academicYears[selectedIndex + delta];
    if (!next) return;
    setSelectedYearId(str(next.id));
  }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Fees</SheetTitle>
          <SheetDescription>
            {studentName || "Student"} · academic year overview
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => shiftAcademicYear(-1)}
              disabled={loading || selectedIndex <= 0}
              aria-label="Previous academic year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-center text-sm font-medium">
              {selectedYear ? str(selectedYear.name) : "Academic year"}
              {selectedYear?.isCurrent ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (current)
                </span>
              ) : null}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => shiftAcademicYear(1)}
              disabled={
                loading ||
                selectedIndex < 0 ||
                selectedIndex >= academicYears.length - 1
              }
              aria-label="Next academic year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading fees...</p>
          ) : !selectedYearId ? (
            <p className="text-sm text-muted-foreground">
              No academic years found.
            </p>
          ) : !found ? (
            <p className="text-sm text-muted-foreground">
              No fee record found for this student in{" "}
              {selectedYear ? str(selectedYear.name) : "this academic year"}.
            </p>
          ) : yearMonths.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No months configured for this academic year.
            </p>
          ) : (
            <>
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {selectedYear ? str(selectedYear.name) : "Year"} summary
                </p>
                <p className="text-muted-foreground">
                  Due: {yearSummary.due} · Paid: {yearSummary.paid}
                </p>
                <p className="text-muted-foreground">
                  Cleared months: {yearSummary.paidMonths} · Pending months:{" "}
                  {yearSummary.unpaidMonths}
                </p>
                {monthlyFee != null ? (
                  <p className="mt-1 text-muted-foreground">
                    Monthly fee: {monthlyFee}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {yearMonths.map(({ key, year, month, label, cell }) => {
                  const isCurrent = key === currentMonthKey;
                  return (
                    <div
                      key={key}
                      title={`${label}: ${statusLabel(cell.status)}${
                        cell.amountDue != null ? ` · Due ${cell.amountDue}` : ""
                      }${
                        cell.amountPaid > 0 ? ` · Paid ${cell.amountPaid}` : ""
                      }`}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-3 text-center",
                        statusClasses(cell.status),
                        isCurrent && "ring-2 ring-foreground/20",
                      )}
                    >
                      <span className="text-[11px] font-medium opacity-80">
                        {monthShort(month)} {String(year).slice(-2)}
                      </span>
                      <span className="text-lg font-semibold leading-none">
                        {statusLetter(cell.status)}
                      </span>
                      <span className="text-[10px] opacity-80">
                        {cell.amountPaid > 0
                          ? cell.amountPaid
                          : cell.amountDue != null
                            ? cell.amountDue
                            : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Months shown belong to this academic year. P = Paid · H =
                Partial · U = Unpaid · W = Waived.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
