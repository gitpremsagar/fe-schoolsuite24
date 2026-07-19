"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

type StudentDetailSheetProps = {
  studentId: string | null;
  academicYearId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StudentDetailSheet({
  studentId,
  academicYearId,
  open,
  onOpenChange,
}: StudentDetailSheetProps) {
  const router = useRouter();
  const [student, setStudent] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (!open || !studentId) {
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      setStudent(null);
      try {
        const res = await schoolApi.students.get(studentId);
        if (!active) return;
        setStudent(res.student);
      } catch (err) {
        if (active) handleErr(err, "Failed to load student");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, studentId, handleErr]);

  const user = obj(student?.user);
  const enrollments = arr(student?.enrollments);
  const studying =
    student?.isCurrentlyStudying === undefined
      ? true
      : Boolean(student?.isCurrentlyStudying);

  const editHref =
    studentId && academicYearId
      ? `/dashboard/school/students/${studentId}/edit?year=${encodeURIComponent(academicYearId)}`
      : studentId
        ? `/dashboard/school/students/${studentId}/edit`
        : "#";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            {loading ? "Student" : str(user.name) || "Student"}
          </SheetTitle>
          <SheetDescription>
            {student
              ? `Admission #${str(student.admissionNumber) || "—"}`
              : "Student profile and enrollment details."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading student...</p>
          ) : student ? (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Profile</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailItem label="Name" value={str(user.name)} />
                  <DetailItem label="Email" value={str(user.email)} />
                  <DetailItem label="Phone" value={str(user.phone)} />
                  <DetailItem
                    label="Admission number"
                    value={str(student.admissionNumber)}
                  />
                  <DetailItem
                    label="Roll number"
                    value={str(student.rollNumber)}
                  />
                  <DetailItem
                    label="Blood group"
                    value={str(student.bloodGroup)}
                  />
                  <DetailItem
                    label="Father's name"
                    value={str(student.fatherName)}
                  />
                  <DetailItem
                    label="Mother's name"
                    value={str(student.motherName)}
                  />
                  <DetailItem
                    label="Status"
                    value={studying ? "Currently studying" : "Left school"}
                  />
                  <DetailItem
                    label="Joining date"
                    value={formatDate(
                      student.joiningDate ?? student.joinedOn,
                    )}
                  />
                  <DetailItem
                    label="Leaving date"
                    value={studying ? "—" : formatDate(student.leavingDate)}
                  />
                  <DetailItem
                    label="Permanent address"
                    value={str(student.permanentAddress)}
                  />
                  <DetailItem
                    label="Current address"
                    value={str(student.currentAddress)}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Enrollments</h3>
                {enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No enrollments yet.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {enrollments.map((e) => {
                      const klass = obj(e.class);
                      const year = obj(e.academicYear);
                      return (
                        <li
                          key={str(e.id)}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {formatClassLabel(
                                str(klass.classLevel) || str(klass.name),
                                str(klass.section) || null,
                              )}
                            </p>
                            <p className="text-muted-foreground">
                              {str(year.name) || "—"}
                              {e.rollNumber
                                ? ` · Roll ${str(e.rollNumber)}`
                                : ""}
                            </p>
                          </div>
                          <p className="text-muted-foreground">
                            {e.isActive ? "Active" : "Inactive"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>

        {student && studentId ? (
          <SheetFooter className="border-t sm:flex-row sm:justify-end">
            <Button type="button" asChild>
              <Link href={editHref}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
