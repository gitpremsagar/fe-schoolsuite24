"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "name", label: "School name" },
  { key: "code", label: "Code" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "addressLine1", label: "Address line 1" },
  { key: "addressLine2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "postalCode", label: "Postal code" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [establishedYear, setEstablishedYear] = useState("");
  const [saturdayIsWorkingDay, setSaturdayIsWorkingDay] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

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
    schoolApi
      .me()
      .then((res) => {
        if (!active) return;
        const school = res.school as Row;
        const next: Record<string, string> = {};
        for (const f of FIELDS) next[f.key] = str(school[f.key]);
        setForm(next);
        setEstablishedYear(str(school.establishedYear));
        setSaturdayIsWorkingDay(school.saturdayIsWorkingDay !== false);
      })
      .catch((err) => {
        if (active) handleErr(err, "Failed to load school");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [handleErr]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setError("Enter your admin password to save settings.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) body[f.key] = form[f.key] ?? "";
      body.establishedYear = establishedYear ? Number(establishedYear) : null;
      body.saturdayIsWorkingDay = saturdayIsWorkingDay;
      body.adminPassword = adminPassword;
      await schoolApi.updateMe(body);
      setMessage("School profile updated.");
      setAdminPassword("");
    } catch (err) {
      handleErr(err, "Failed to update school");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Update your school&apos;s profile details.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>School profile</CardTitle>
            <CardDescription>These details appear on records.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={onSave}>
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label>{f.label}</Label>
                    <Input
                      value={form[f.key] ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [f.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label>Established year</Label>
                  <Input
                    type="number"
                    value={establishedYear}
                    onChange={(e) => setEstablishedYear(e.target.value)}
                  />
                </div>
                <div className="flex items-end md:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={saturdayIsWorkingDay}
                      onChange={(e) =>
                        setSaturdayIsWorkingDay(e.target.checked)
                      }
                    />
                    Saturday is a working day
                  </label>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>
                    Your admin password{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    placeholder="Required to save settings"
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
