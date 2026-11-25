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
import { changeEmail, changePassword, getMe } from "@/lib/api/auth";
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
  const [staffWorkStartTime, setStaffWorkStartTime] = useState("09:00");
  const [staffWorkEndTime, setStaffWorkEndTime] = useState("17:00");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  const [accountEmail, setAccountEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

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
        setStaffWorkStartTime(str(school.staffWorkStartTime) || "09:00");
        setStaffWorkEndTime(str(school.staffWorkEndTime) || "17:00");
      })
      .catch((err) => {
        if (active) handleErr(err, "Failed to load school");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    getMe()
      .then((res) => {
        if (active) setAccountEmail(res.user.email);
      })
      .catch(() => {
        // The account email is informational; the rest of the page still works.
      });
    return () => {
      active = false;
    };
  }, [handleErr]);

  async function onChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) {
      setEmailError("Enter the new login email.");
      return;
    }
    if (!emailPassword.trim()) {
      setEmailError("Enter your current password to change the login email.");
      return;
    }
    setEmailSaving(true);
    setEmailError("");
    setEmailMessage("");
    try {
      const res = await changeEmail(email, emailPassword);
      setAccountEmail(res.user?.email ?? email);
      setNewEmail("");
      setEmailPassword("");
      setEmailMessage("Login email updated. Use the new email next time you sign in.");
    } catch (err) {
      if (isSubscriptionInactive(err)) {
        router.replace("/access-blocked");
        return;
      }
      setEmailError(errorMessage(err, "Failed to change login email"));
    } finally {
      setEmailSaving(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError(
        "New password must include at least one letter and one number.",
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError(
        "New password must be different from the current password.",
      );
      return;
    }
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(
        "Password updated. Other signed-in devices have been logged out.",
      );
    } catch (err) {
      if (isSubscriptionInactive(err)) {
        router.replace("/access-blocked");
        return;
      }
      setPasswordError(errorMessage(err, "Failed to change password"));
    } finally {
      setPasswordSaving(false);
    }
  }

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
      body.staffWorkStartTime = staffWorkStartTime || null;
      body.staffWorkEndTime = staffWorkEndTime || null;
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
                <div className="space-y-1">
                  <Label>Staff work start</Label>
                  <Input
                    type="time"
                    value={staffWorkStartTime}
                    onChange={(e) => setStaffWorkStartTime(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Punch-ins after this time are marked late.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Staff work end</Label>
                  <Input
                    type="time"
                    value={staffWorkEndTime}
                    onChange={(e) => setStaffWorkEndTime(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Punch-outs before this time are marked early.
                  </p>
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

        <Card>
          <CardHeader>
            <CardTitle>Login email</CardTitle>
            <CardDescription>
              The email address you use to sign in to the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={onChangeEmail}>
              <div className="space-y-1 md:col-span-2">
                <Label>Current login email</Label>
                <Input value={accountEmail || "—"} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-login-email">New email</Label>
                <Input
                  id="new-login-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="login-email-password">
                  Current password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="login-email-password"
                  type="password"
                  autoComplete="current-password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Required to change email"
                />
              </div>
              {emailError ? (
                <p className="text-sm text-destructive md:col-span-2">
                  {emailError}
                </p>
              ) : null}
              {emailMessage ? (
                <p className="text-sm text-green-600 md:col-span-2">
                  {emailMessage}
                </p>
              ) : null}
              <div className="md:col-span-2">
                <Button type="submit" disabled={emailSaving}>
                  {emailSaving ? "Updating..." : "Change login email"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change the password you use to sign in. Other signed-in devices
              will be logged out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={onChangePassword}
            >
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="current-password">
                  Current password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to change password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
                />
              </div>
              <p className="text-muted-foreground text-xs md:col-span-2">
                Use at least 8 characters, including a letter and a number.
              </p>
              {passwordError ? (
                <p className="text-sm text-destructive md:col-span-2">
                  {passwordError}
                </p>
              ) : null}
              {passwordMessage ? (
                <p className="text-sm text-green-600 md:col-span-2">
                  {passwordMessage}
                </p>
              ) : null}
              <div className="md:col-span-2">
                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? "Updating..." : "Change password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
