"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { schoolApi } from "@/lib/api/school";
import { parseChapterAnswers } from "@/lib/chapter-answers";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

type ChapterExerciseSectionProps = {
  classId: string;
  subjectId: string;
  chapter: Row;
  onChanged: () => Promise<void> | void;
  onError: (err: unknown, fallback: string) => void;
  onOpenAi: () => void;
};

export function ChapterExerciseSection({
  classId,
  subjectId,
  chapter,
  onChanged,
  onError,
  onOpenAi,
}: ChapterExerciseSectionProps) {
  const chapterId = str(chapter.id);
  const exercise = str(chapter.exercise).trim();
  const hasAnswers = parseChapterAnswers(chapter.answers).length > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingAnswers, setGeneratingAnswers] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setDraft(exercise);
    setEditing(true);
    setError("");
  }

  async function onSaveExercise() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Exercise text is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const wasEmpty = exercise.length === 0;
      await schoolApi.chapters.update(classId, subjectId, chapterId, {
        exercise: trimmed,
      });
      await onChanged();
      setEditing(false);

      // Auto-generate answers only when an exercise is first added.
      if (wasEmpty && !hasAnswers) {
        setGeneratingAnswers(true);
        try {
          await schoolApi.chapters.generateAnswers(
            classId,
            subjectId,
            chapterId,
            "high",
          );
          await onChanged();
        } catch (err) {
          onError(
            err,
            "Exercise saved, but generating answers failed. You can retry from the Answers section.",
          );
        } finally {
          setGeneratingAnswers(false);
        }
      }
    } catch (err) {
      onError(err, "Failed to save exercise");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Exercise
        </p>
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={startEdit}
              disabled={generatingAnswers}
            >
              {exercise ? "Edit exercise" : "Add exercise"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenAi}
              disabled={generatingAnswers}
            >
              {exercise ? "Regenerate with AI" : "Add with AI"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {generatingAnswers ? (
        <p className="text-sm text-muted-foreground">
          Exercise saved. The AI is reading this chapter and writing the
          answers...
        </p>
      ) : null}

      {editing ? (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Exercise questions</Label>
          <Textarea
            className="min-h-32"
            value={draft}
            placeholder="Write the exercise questions here..."
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void onSaveExercise()}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save exercise"}
            </Button>
          </div>
        </div>
      ) : exercise ? (
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
          {exercise}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No exercise yet for this chapter. Add one manually or from photos.
        </p>
      )}
    </div>
  );
}
