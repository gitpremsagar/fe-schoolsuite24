"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { examsApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
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

export default function StudentExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    examsApi
      .myMarkSheets()
      .then((res) => {
        if (active) setExams(res.exams);
      })
      .catch((err) => {
        if (!active) return;
        if (isSubscriptionInactive(err)) {
          router.replace("/access-blocked");
          return;
        }
        setError(errorMessage(err, "Failed to load mark sheets"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <DashboardShell allowedRoles={["STUDENT"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">My exams</h1>
          <p className="text-sm text-muted-foreground">
            Published mark sheets for your examinations.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <LoadingPulseCard />
        ) : exams.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No published mark sheets yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((group) => {
              const examination = obj(group.examination);
              const year = obj(examination.academicYear);
              const markSheets = arr(group.markSheets);
              return (
                <Card key={str(examination.id)}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle>{str(examination.name)}</CardTitle>
                        <CardDescription>
                          {formatDisplayDate(str(examination.examDate))}
                          {year.name ? ` · ${str(year.name)}` : ""}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {markSheets.length} subject
                        {markSheets.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Marks</TableHead>
                          <TableHead>Max</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {markSheets.map((sheet) => {
                          const subject = obj(sheet.subject);
                          const obtained = sheet.marksObtained;
                          return (
                            <TableRow key={str(sheet.id)}>
                              <TableCell className="font-medium">
                                {str(subject.name)}
                              </TableCell>
                              <TableCell>
                                {obtained == null ? "—" : num(obtained)}
                              </TableCell>
                              <TableCell>{num(sheet.maxMarks)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
