"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { attendanceApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

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
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Status = "PRESENT" | "ABSENT";

export function StudentAttendanceMarker({ classes }: { classes: Row[] }) {
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState<Row[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
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

  const load = useCallback(async () => {
    if (!classId || !date) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await attendanceApi.classAttendance(classId, date);
      const list = arr(res.records);
      setRecords(list);
      const initial: Record<string, Status> = {};
      for (const r of list) {
        const att = obj(r.attendance);
        const spid = str(r.studentProfileId);
        if (att.status === "PRESENT" || att.status === "ABSENT") {
          initial[spid] = att.status as Status;
        }
      }
      setMarks(initial);
    } catch (err) {
      handleErr(err, "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [classId, date, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  function setAll(status: Status) {
    const next: Record<string, Status> = {};
    for (const r of records) {
      next[str(r.studentProfileId)] = status;
    }
    setMarks(next);
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = records
        .map((r) => str(r.studentProfileId))
        .filter((spid) => marks[spid])
        .map((spid) => ({ studentProfileId: spid, status: marks[spid] }));
      if (payload.length === 0) {
        setError("Mark at least one student.");
        setSaving(false);
        return;
      }
      await attendanceApi.saveStudentAttendance({
        classId,
        date,
        records: payload,
      });
      setMessage("Attendance saved.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={str(c.id)} value={str(c.id)}>
                  {str(c.name)}
                  {c.section ? ` - ${str(c.section)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {classId ? (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAll("PRESENT")}
                  disabled={records.length === 0}
                >
                  Mark all present
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAll("ABSENT")}
                  disabled={records.length === 0}
                >
                  Mark all absent
                </Button>
              </div>
              <Button
                type="button"
                onClick={save}
                disabled={saving || records.length === 0}
              >
                {saving ? "Saving..." : "Save attendance"}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No enrolled students in this class.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => {
                    const spid = str(r.studentProfileId);
                    const student = obj(r.student);
                    const user = obj(student.user);
                    const current = marks[spid];
                    return (
                      <TableRow key={spid}>
                        <TableCell>{str(r.rollNumber) || "—"}</TableCell>
                        <TableCell className="font-medium">
                          {str(user.name)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                current === "PRESENT" ? "default" : "outline"
                              }
                              onClick={() =>
                                setMarks((p) => ({ ...p, [spid]: "PRESENT" }))
                              }
                            >
                              Present
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                current === "ABSENT" ? "destructive" : "outline"
                              }
                              onClick={() =>
                                setMarks((p) => ({ ...p, [spid]: "ABSENT" }))
                              }
                            >
                              Absent
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a class to mark attendance.
        </p>
      )}
    </div>
  );
}
