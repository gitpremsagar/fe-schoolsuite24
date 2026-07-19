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
import {
  MonthCalendar,
  monthTitle,
  type CalendarDay,
} from "@/components/students/month-calendar";
import { attendanceApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Status = "PRESENT" | "ABSENT";

type StudentAttendanceSheetProps = {
  studentId: string | null;
  studentName?: string;
  classId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function StudentAttendanceSheet({
  studentId,
  studentName,
  classId,
  open,
  onOpenChange,
}: StudentAttendanceSheetProps) {
  const router = useRouter();
  const initial = currentYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [dayMarks, setDayMarks] = useState<
    Record<string, Status | null>
  >({});
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
    const now = currentYearMonth();
    setYear(now.year);
    setMonth(now.month);
  }, [open, studentId]);

  useEffect(() => {
    if (!open || !studentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await attendanceApi.classMonth(
          classId || null,
          year,
          month,
        );
        if (!active) return;
        const row = res.students.find(
          (s) => String(s.studentProfileId) === studentId,
        );
        if (!row) {
          setFound(false);
          setDayMarks({});
        } else {
          setFound(true);
          setDayMarks((row.days ?? {}) as Record<string, Status | null>);
        }
      } catch (err) {
        if (active) handleErr(err, "Failed to load attendance");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, studentId, classId, year, month, handleErr]);

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: CalendarDay[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const status = dayMarks[String(day)] ?? null;
      if (status === "PRESENT") {
        days.push({
          day,
          label: "P",
          title: `Day ${day}: Present`,
          className: "border-emerald-200 bg-emerald-100 text-emerald-800",
        });
      } else if (status === "ABSENT") {
        days.push({
          day,
          label: "A",
          title: `Day ${day}: Absent`,
          className: "border-red-200 bg-red-100 text-red-800",
        });
      } else {
        days.push({
          day,
          label: "·",
          title: `Day ${day}: Not marked`,
          className: "border-transparent bg-muted/40 text-muted-foreground",
        });
      }
    }
    return days;
  }, [dayMarks, year, month]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    for (const status of Object.values(dayMarks)) {
      if (status === "PRESENT") present += 1;
      if (status === "ABSENT") absent += 1;
    }
    return { present, absent };
  }, [dayMarks]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Attendance</SheetTitle>
          <SheetDescription>
            {studentName || "Student"} · monthly calendar
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-medium">{monthTitle(year, month)}</p>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading attendance...</p>
          ) : !found ? (
            <p className="text-sm text-muted-foreground">
              No attendance enrollment found for this student in the selected
              period.
            </p>
          ) : (
            <>
              <MonthCalendar year={year} month={month} days={calendarDays} />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>
                  Present:{" "}
                  <span className="font-medium text-emerald-700">
                    {summary.present}
                  </span>
                </span>
                <span>
                  Absent:{" "}
                  <span className="font-medium text-red-700">
                    {summary.absent}
                  </span>
                </span>
                <span>P = Present · A = Absent</span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
