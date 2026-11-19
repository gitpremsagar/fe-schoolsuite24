"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { schoolApi } from "@/lib/api/school";
import {
  parseChapterAnswers,
  type ChapterAnswer,
} from "@/lib/chapter-answers";

type Row = Record<string, unknown>;

type Effort = "low" | "high" | "max";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

const emptyAnswer = (): ChapterAnswer => ({
  question: "",
  answer: "",
  explanation: "",
  source: "chapter",
});

type ChapterAnswersSectionProps = {
  classId: string;
  subjectId: string;
  chapter: Row;
  onChanged: () => Promise<void> | void;
  onError: (err: unknown, fallback: string) => void;
};

export function ChapterAnswersSection({
  classId,
  subjectId,
  chapter,
  onChanged,
  onError,
}: ChapterAnswersSectionProps) {
  const chapterId = str(chapter.id);
  const answers = parseChapterAnswers(chapter.answers);
  const hasExercise = Boolean(str(chapter.exercise).trim());
  const isStale = Boolean(chapter.answersStale);

  const [effort, setEffort] = useState<Effort>("high");
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ChapterAnswer[]>([]);
  const [error, setError] = useState("");

  async function onGenerate() {
    if (!hasExercise) return;
    setGenerating(true);
    setError("");
    try {
      await schoolApi.chapters.generateAnswers(
        classId,
        subjectId,
        chapterId,
        effort,
      );
      await onChanged();
    } catch (err) {
      onError(err, "Failed to generate answers");
    } finally {
      setGenerating(false);
    }
  }

  function startEdit() {
    setEditing(true);
    setError("");
    setDraft(
      answers.length > 0 ? answers.map((answer) => ({ ...answer })) : [emptyAnswer()],
    );
  }

  function updateAnswer(index: number, patch: Partial<ChapterAnswer>) {
    setDraft((prev) =>
      prev.map((answer, i) => (i === index ? { ...answer, ...patch } : answer)),
    );
  }

  function removeAnswer(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSaveAnswers() {
    if (draft.length === 0) {
      setError("Add at least one question and answer.");
      return;
    }
    if (draft.some((answer) => !answer.question.trim() || !answer.answer.trim())) {
      setError("Every answer needs a question and an answer.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await schoolApi.chapters.update(classId, subjectId, chapterId, {
        answers: draft.map((answer) => ({
          question: answer.question.trim(),
          answer: answer.answer.trim(),
          explanation: answer.explanation.trim(),
          source: answer.source,
        })),
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err, "Failed to save answers");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Answers
        </p>
        {!editing && answers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={effort}
              onValueChange={(value) => setEffort(value as Effort)}
              disabled={generating}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generating || !hasExercise}
              onClick={() => void onGenerate()}
            >
              {generating ? "Generating..." : "Regenerate with AI"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={startEdit}
              disabled={generating}
            >
              Edit answers
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {isStale && answers.length > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The chapter content or exercise changed after these answers were
          generated. Regenerate them to refresh the answer key.
        </p>
      ) : null}

      {editing ? (
        <div className="space-y-3">
          {draft.map((answer, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Question {index + 1}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeAnswer(index)}
                  disabled={saving}
                >
                  Remove
                </Button>
              </div>
              <div className="space-y-1">
                <Label>Question</Label>
                <Input
                  value={answer.question}
                  onChange={(e) =>
                    updateAnswer(index, { question: e.target.value })
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label>Answer</Label>
                <Textarea
                  className="min-h-20"
                  value={answer.answer}
                  onChange={(e) =>
                    updateAnswer(index, { answer: e.target.value })
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Explanation</Label>
                <Textarea
                  className="min-h-16"
                  value={answer.explanation}
                  onChange={(e) =>
                    updateAnswer(index, { explanation: e.target.value })
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Select
                  value={answer.source}
                  onValueChange={(value) =>
                    updateAnswer(index, {
                      source: value as ChapterAnswer["source"],
                    })
                  }
                  disabled={saving}
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chapter">From chapter</SelectItem>
                    <SelectItem value="general">General knowledge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDraft((prev) => [...prev, emptyAnswer()])}
              disabled={saving}
            >
              Add question
            </Button>
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
              onClick={() => void onSaveAnswers()}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save answers"}
            </Button>
          </div>
        </div>
      ) : answers.length > 0 ? (
        <div className="space-y-2">
          {answers.map((answer, index) => (
            <div key={index} className="space-y-1 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium">
                  {index + 1}. {answer.question}
                </p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {answer.source === "general"
                    ? "General knowledge"
                    : "From chapter"}
                </span>
              </div>
              <p className="text-sm">{answer.answer}</p>
              {answer.explanation ? (
                <p className="text-sm text-muted-foreground">
                  {answer.explanation}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : hasExercise ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No answers yet for this exercise.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={effort}
              onValueChange={(value) => setEffort(value as Effort)}
              disabled={generating}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={generating}
              onClick={() => void onGenerate()}
            >
              {generating ? "Generating..." : "Generate answers with AI"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generating}
              onClick={startEdit}
            >
              Add answers manually
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add an exercise first to generate or write answers.
        </p>
      )}
    </div>
  );
}
