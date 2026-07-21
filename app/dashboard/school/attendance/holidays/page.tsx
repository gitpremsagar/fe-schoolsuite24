"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type HolidayRow = {
  id: string;
  date: string;
  name: string | null;
  notes: string | null;
  createdBy: { id: string; name: string; email: string } | null;
};

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function formatHolidayDate(isoDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function localDateInput(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HolidaysPage() {
  const router = useRouter();
  const initial = currentYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState(localDateInput());
  const [name, setName] = useState("");

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
    setLoading(true);
    setError("");
    try {
      const res = await schoolApi.holidays.list(year, month);
      setHolidays(res.holidays);
    } catch (err) {
      handleErr(err, "Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }, [year, month, handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const y = initial.year;
    return [y - 1, y, y + 1];
  }, [initial.year]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Pick a date.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.holidays.create({
        date,
        name: name.trim() || null,
      });
      setMessage("Holiday declared.");
      setName("");
      const [y, m] = date.split("-").map(Number);
      if (y && m) {
        setYear(y);
        setMonth(m);
      }
      await load();
    } catch (err) {
      handleErr(err, "Failed to declare holiday");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Remove this declared holiday?")) return;
    setError("");
    setMessage("");
    try {
      await schoolApi.holidays.remove(id);
      setMessage("Holiday removed.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to remove holiday");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Declare school-wide holidays for students and staff. Sundays are
          always holidays and do not need to be declared.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Year</Label>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Month</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(Number(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {monthLabel(year, m).split(" ")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <form
        onSubmit={onCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
      >
        <div className="space-y-1">
          <Label htmlFor="holiday-date">Date</Label>
          <Input
            id="holiday-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="holiday-name">Name (optional)</Label>
          <Input
            id="holiday-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Diwali"
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Declare holiday"}
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {loading ? (
        <LoadingPulseCard />
      ) : holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No declared holidays in {monthLabel(year, month)}. Sundays still
          count as holidays in the attendance registers.
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Declared by</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">
                    {formatHolidayDate(h.date)}
                  </TableCell>
                  <TableCell>{h.name?.trim() || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.createdBy?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      title="Remove holiday"
                      aria-label={`Remove holiday on ${h.date}`}
                      onClick={() => void onDelete(h.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
