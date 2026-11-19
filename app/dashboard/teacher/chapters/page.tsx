"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  SubjectChaptersSheet,
  type ChapterClassOption,
} from "@/components/subjects/subject-chapters-sheet";
import { Button } from "@/components/ui/button";
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
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { formatClassLabel } from "@/lib/class-levels";

type Row = Record<string, unknown>;

type ChapterTarget = {
  classId: string;
  className: string;
  yearName: string;
  subjectId: string;
  subjectName: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function arr(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

export default function TeacherChaptersPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ChapterTarget | null>(null);

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
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await schoolApi.classes.mine();
        if (active) setClasses(res.classes);
      } catch (err) {
        if (active) handleErr(err, "Failed to load your classes");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [handleErr]);

  const classOptions = useMemo<ChapterClassOption[]>(
    () =>
      target
        ? [
            {
              classId: target.classId,
              label: target.className,
              yearName: target.yearName,
            },
          ]
        : [],
    [target],
  );

  return (
    <DashboardShell allowedRoles={["TEACHER"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Chapters</h1>
          <p className="text-sm text-muted-foreground">
            View and edit chapters for subjects in your classes, or generate
            them from chapter photos with AI.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <LoadingPulseCard />
        ) : classes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              You are not assigned to any classes yet.
            </CardContent>
          </Card>
        ) : (
          classes.map((klass) => {
            const classId = str(klass.id);
            const yearName = str(obj(klass.academicYear).name);
            const className = formatClassLabel(
              str(klass.classLevel),
              str(klass.section) || null,
            );
            const classSubjects = [...arr(klass.classSubjects)].sort((a, b) =>
              str(obj(a.subject).name).localeCompare(str(obj(b.subject).name)),
            );

            return (
              <Card key={classId}>
                <CardHeader>
                  <CardTitle>{className}</CardTitle>
                  <CardDescription>
                    {yearName || "Academic year"} ·{" "}
                    {classSubjects.length} subject
                    {classSubjects.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {classSubjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No subjects assigned to this class yet.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">#</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Teacher</TableHead>
                          <TableHead className="w-[140px]">
                            Chapters
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classSubjects.map((link, index) => {
                          const subject = obj(link.subject);
                          const teacher = obj(obj(link.staffProfile).user);
                          const subjectId = str(subject.id);
                          const subjectName = str(subject.name);
                          return (
                            <TableRow key={str(link.id)}>
                              <TableCell className="text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-medium">
                                {subjectName || "—"}
                              </TableCell>
                              <TableCell>{str(teacher.name) || "—"}</TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!subjectId}
                                  onClick={() =>
                                    setTarget({
                                      classId,
                                      className,
                                      yearName,
                                      subjectId,
                                      subjectName,
                                    })
                                  }
                                >
                                  Open
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <SubjectChaptersSheet
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        subjectId={target ? target.subjectId : ""}
        subjectName={target ? target.subjectName : ""}
        classOptions={classOptions}
      />
    </DashboardShell>
  );
}
