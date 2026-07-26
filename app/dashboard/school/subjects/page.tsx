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
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

export default function SubjectsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const res = await schoolApi.subjects.list();
      setSubjects(res.subjects);
    } catch (err) {
      handleErr(err, "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  }, [handleErr]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Subject name is required.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.subjects.create({ name: trimmed });
      setName("");
      setShowForm(false);
      setMessage("Subject created.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to create subject");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("Subject name is required.");
      return;
    }
    setSavingEdit(true);
    setError("");
    setMessage("");
    try {
      await schoolApi.subjects.update(id, { name: trimmed });
      setEditingId(null);
      setMessage("Subject updated.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to update subject");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    setError("");
    setMessage("");
    try {
      await schoolApi.subjects.remove(id);
      setMessage("Subject deleted.");
      await load();
    } catch (err) {
      handleErr(err, "Failed to delete subject");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Subjects</h1>
            <p className="text-sm text-muted-foreground">
              Define subjects for your school, then assign them to classes.
            </p>
          </div>
          <Button
            type="button"
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add subject"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}

        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>New subject</CardTitle>
              <CardDescription>
                e.g. Mathematics, English, Science
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-wrap items-end gap-3" onSubmit={onCreate}>
                <div className="min-w-[220px] flex-1 space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Subject name"
                    required
                  />
                </div>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Creating..." : "Create subject"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <LoadingPulseCard />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead className="w-[220px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        No subjects yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    subjects.map((s) => {
                      const id = str(s.id);
                      const count = obj(s._count);
                      const isEditing = editingId === id;
                      return (
                        <TableRow key={id}>
                          <TableCell className="font-medium">
                            {isEditing ? (
                              <Input
                                className="h-8 max-w-xs"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            ) : (
                              str(s.name)
                            )}
                          </TableCell>
                          <TableCell>{num(count.classes)}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingEdit || !editName.trim()}
                                  onClick={() => void onSaveEdit(id)}
                                >
                                  {savingEdit ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingId(id);
                                    setEditName(str(s.name));
                                  }}
                                >
                                  Rename
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={deletingId === id}
                                  onClick={() => void onDelete(id)}
                                >
                                  {deletingId === id
                                    ? "Deleting..."
                                    : "Delete"}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
