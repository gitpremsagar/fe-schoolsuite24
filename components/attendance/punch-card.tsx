"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { attendanceApi } from "@/lib/api/school";
import { errorMessage } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}
function fmtTime(v: unknown): string {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function PunchCard() {
  const [attendance, setAttendance] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await attendanceApi.staffToday();
      setAttendance(res.attendance);
    } catch (err) {
      setError(errorMessage(err, "Failed to load attendance"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function doPunchIn() {
    setBusy(true);
    setError("");
    try {
      await attendanceApi.punchIn();
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to punch in"));
    } finally {
      setBusy(false);
    }
  }

  async function doPunchOut() {
    setBusy(true);
    setError("");
    try {
      await attendanceApi.punchOut();
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to punch out"));
    } finally {
      setBusy(false);
    }
  }

  const att = obj(attendance);
  const hasPunchedIn = Boolean(att.punchInAt);
  const hasPunchedOut = Boolean(att.punchOutAt);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Today&apos;s attendance</CardTitle>
        <CardDescription>Record your punch in and punch out.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Punch in</p>
                <p className="font-medium">{fmtTime(att.punchInAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Punch out</p>
                <p className="font-medium">{fmtTime(att.punchOutAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge
                  variant={
                    hasPunchedOut
                      ? "secondary"
                      : hasPunchedIn
                        ? "default"
                        : "outline"
                  }
                >
                  {hasPunchedOut
                    ? "Done"
                    : hasPunchedIn
                      ? "Working"
                      : "Not started"}
                </Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={doPunchIn}
                disabled={busy || hasPunchedIn}
              >
                Punch in
              </Button>
              <Button
                variant="outline"
                onClick={doPunchOut}
                disabled={busy || !hasPunchedIn || hasPunchedOut}
              >
                Punch out
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
