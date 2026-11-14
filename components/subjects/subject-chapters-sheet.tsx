"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";

type Row = Record<string, unknown>;

export type ChapterClassOption = {
  classId: string;
  label: string;
  yearName: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

type SubjectChaptersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  classOptions: ChapterClassOption[];
};

export function SubjectChaptersSheet({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  classOptions,
}: SubjectChaptersSheetProps) {
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [chapters, setChapters] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

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

  const loadChapters = useCallback(
    async (targetClassId: string) => {
      if (!targetClassId || !subjectId) {
        setChapters([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const res = await schoolApi.chapters.list(targetClassId, subjectId);
        setChapters(res.chapters);
      } catch (err) {
        handleErr(err, "Failed to load chapters");
      } finally {
        setLoading(false);
      }
    },
    [subjectId, handleErr],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const firstClassId = classOptions[0]?.classId ?? "";
      setClassId(firstClassId);
      setChapters([]);
      setError("");
      setTitle("");
      setContent("");
      setEditingId(null);
      setEditTitle("");
      setEditContent("");
      if (!firstClassId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await schoolApi.chapters.list(firstClassId, subjectId);
        if (active) setChapters(res.chapters);
      } catch (err) {
        if (active) handleErr(err, "Failed to load chapters");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, subjectId, classOptions, handleErr]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setChapters([]);
      setError("");
      setTitle("");
      setContent("");
      setEditingId(null);
      setEditTitle("");
      setEditContent("");
    }
    onOpenChange(next);
  }

  function resetEditor() {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
    setTitle("");
    setContent("");
  }

  function onClassChange(nextClassId: string) {
    setClassId(nextClassId);
    resetEditor();
    void loadChapters(nextClassId);
  }

  async function onAddChapter(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !classId) return;
    setSaving(true);
    setError("");
    try {
      await schoolApi.chapters.create(classId, subjectId, {
        title: trimmed,
        content,
      });
      setTitle("");
      setContent("");
      await loadChapters(classId);
    } catch (err) {
      handleErr(err, "Failed to create chapter");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(chapter: Row) {
    setEditingId(str(chapter.id));
    setEditTitle(str(chapter.title));
    setEditContent(str(chapter.content));
  }

  async function onSaveEdit(chapterId: string) {
    const trimmed = editTitle.trim();
    if (!trimmed || !classId) return;
    setSavingEdit(true);
    setError("");
    try {
      await schoolApi.chapters.update(classId, subjectId, chapterId, {
        title: trimmed,
        content: editContent,
      });
      setEditingId(null);
      await loadChapters(classId);
    } catch (err) {
      handleErr(err, "Failed to update chapter");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDelete(chapterId: string) {
    if (!classId) return;
    if (!window.confirm("Delete this chapter? This cannot be undone.")) return;
    setDeletingId(chapterId);
    setError("");
    try {
      await schoolApi.chapters.remove(classId, subjectId, chapterId);
      await loadChapters(classId);
    } catch (err) {
      handleErr(err, "Failed to delete chapter");
    } finally {
      setDeletingId(null);
    }
  }

  async function onMove(chapterId: string, direction: "up" | "down") {
    if (!classId) return;
    setMovingId(chapterId);
    setError("");
    try {
      const res = await schoolApi.chapters.move(
        classId,
        subjectId,
        chapterId,
        direction,
      );
      setChapters(res.chapters);
    } catch (err) {
      handleErr(err, "Failed to reorder chapter");
    } finally {
      setMovingId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{subjectName || "Subject"} chapters</SheetTitle>
          <SheetDescription>
            Chapters are stored per class. Pick a class to view and edit its
            chapter list.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 pb-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="space-y-1">
            <Label>Class</Label>
            <Select
              value={classId}
              onValueChange={onClassChange}
              disabled={classOptions.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classOptions.map((option) => (
                  <SelectItem key={option.classId} value={option.classId}>
                    {option.label}
                    {option.yearName ? ` — ${option.yearName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {classOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This subject is not assigned to any class yet. Assign it from a
              class page, then add chapters here.
            </p>
          ) : (
            <>
              <form
                className="space-y-3 rounded-xl border p-3"
                onSubmit={onAddChapter}
              >
                <div className="space-y-1">
                  <Label>New chapter</Label>
                  <Input
                    value={title}
                    placeholder="e.g. Chapter 1: Numbers"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Content</Label>
                  <Textarea
                    className="min-h-24"
                    value={content}
                    placeholder="Write the chapter text here..."
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving || !title.trim() || !classId}
                  >
                    {saving ? "Adding..." : "Add chapter"}
                  </Button>
                </div>
              </form>

              {loading ? (
                <p className="text-sm text-muted-foreground">
                  Loading chapters...
                </p>
              ) : chapters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chapters for this class yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {chapters.map((chapter, index) => {
                    const chapterId = str(chapter.id);
                    const isEditing = editingId === chapterId;
                    return (
                      <div
                        key={chapterId}
                        className="space-y-3 rounded-xl border p-3"
                      >
                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label>Title</Label>
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-muted-foreground">
                                Content
                              </Label>
                              <Textarea
                                className="min-h-32"
                                value={editContent}
                                onChange={(e) =>
                                  setEditContent(e.target.value)
                                }
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={resetEditor}
                                disabled={savingEdit}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingEdit || !editTitle.trim()}
                                onClick={() => void onSaveEdit(chapterId)}
                              >
                                {savingEdit ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="text-sm font-medium">
                                {index + 1}. {str(chapter.title)}
                              </p>
                              <div className="flex flex-wrap items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={index === 0 || movingId !== null}
                                  onClick={() => void onMove(chapterId, "up")}
                                  aria-label="Move chapter up"
                                >
                                  ↑
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    index === chapters.length - 1 ||
                                    movingId !== null
                                  }
                                  onClick={() => void onMove(chapterId, "down")}
                                  aria-label="Move chapter down"
                                >
                                  ↓
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEdit(chapter)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={deletingId === chapterId}
                                  onClick={() => void onDelete(chapterId)}
                                >
                                  {deletingId === chapterId
                                    ? "Deleting..."
                                    : "Delete"}
                                </Button>
                              </div>
                            </div>
                            {str(chapter.content) ? (
                              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                                {str(chapter.content)}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No content yet.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter className="border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
