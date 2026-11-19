"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { Textarea } from "@/components/ui/textarea";
import { schoolApi } from "@/lib/api/school";
import { errorMessage, isSubscriptionInactive } from "@/lib/api/subscription";
import { parseChapterAnswers } from "@/lib/chapter-answers";

type Row = Record<string, unknown>;

const MAX_IMAGES = 8;
const MAX_DIMENSION = 2000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Effort = "low" | "high" | "max";

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type Draft = {
  title: string;
  content: string;
  exercise: string;
};

const EFFORT_HINT: Record<Effort, string> = {
  low: "Fastest and cheapest. Best for clear, printed pages.",
  high: "Balanced effort. Recommended for most chapters.",
  max: "Slowest and most expensive. Best for dense or low-quality photos.",
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function obj(v: unknown): Row {
  return v && typeof v === "object" ? (v as Row) : {};
}

async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "chapter-page";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    // If the browser cannot decode the image, send the original when the
    // format is one DeepSeek accepts.
    return file;
  }
}

type AiSaveResult = {
  chapterId?: string;
  exercise?: string;
  hadAnswers?: boolean;
};

type AiChapterPanelProps = {
  classId: string;
  classLabel: string;
  subjectId: string;
  existingChapter: Row | null;
  mode?: "chapter" | "exercise";
  onBack: () => void;
  onSaved: (result?: AiSaveResult) => Promise<void> | void;
};

export function AiChapterPanel({
  classId,
  classLabel,
  subjectId,
  existingChapter,
  mode = "chapter",
  onBack,
  onSaved,
}: AiChapterPanelProps) {
  const router = useRouter();
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [effort, setEffort] = useState<Effort>("high");
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

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

  async function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`You can add up to ${MAX_IMAGES} images per chapter.`);
      return;
    }

    const files = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      setError(
        `Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added.`,
      );
    }

    const added: SelectedImage[] = [];
    for (const file of files) {
      try {
        const processed = await compressImage(file);
        if (!ALLOWED_TYPES.has(processed.type)) {
          throw new Error("Unsupported image format");
        }
        const previewUrl = URL.createObjectURL(processed);
        previewUrlsRef.current.push(previewUrl);
        added.push({
          id: crypto.randomUUID(),
          file: processed,
          previewUrl,
        });
      } catch {
        setError(
          `${file.name} could not be read. Use JPEG, PNG, or WebP photos.`,
        );
      }
    }

    if (added.length > 0) {
      setImages((prev) => [...prev, ...added]);
    }
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current = previewUrlsRef.current.filter(
          (url) => url !== target.previewUrl,
        );
      }
      return prev.filter((image) => image.id !== id);
    });
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const current = next[index];
      const swap = next[target];
      if (!current || !swap) return prev;
      next[index] = swap;
      next[target] = current;
      return next;
    });
  }

  async function onGenerate() {
    if (images.length === 0) {
      setError("Add at least one page photo first.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const formData = new FormData();
      for (const image of images) {
        formData.append("images", image.file, image.file.name);
      }
      formData.append("effort", effort);

      if (mode === "exercise") {
        if (!existingChapter) {
          throw new Error("Chapter is required");
        }
        const res = await schoolApi.chapters.generateExercise(
          classId,
          subjectId,
          str(existingChapter.id),
          formData,
        );
        setDraft({
          title: str(existingChapter.title),
          content: str(existingChapter.content),
          exercise: res.draft.exercise,
        });
      } else {
        const res = await schoolApi.chapters.generate(
          classId,
          subjectId,
          formData,
        );
        setDraft(res.draft);
      }
      setStep("preview");
    } catch (err) {
      handleErr(err, "Failed to generate chapter");
    } finally {
      setGenerating(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    if (mode !== "exercise" && !draft.title.trim()) {
      setError("Chapter title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let savedChapterId: string | undefined;
      if (mode === "exercise") {
        if (!existingChapter) {
          throw new Error("Chapter is required");
        }
        savedChapterId = str(existingChapter.id);
        await schoolApi.chapters.update(classId, subjectId, savedChapterId, {
          exercise: draft.exercise,
        });
      } else if (existingChapter) {
        savedChapterId = str(existingChapter.id);
        await schoolApi.chapters.update(
          classId,
          subjectId,
          savedChapterId,
          {
            title: draft.title.trim(),
            content: draft.content,
            exercise: draft.exercise,
          },
        );
      } else {
        const res = await schoolApi.chapters.create(classId, subjectId, {
          title: draft.title.trim(),
          content: draft.content,
          exercise: draft.exercise,
        });
        savedChapterId = str(obj(res.chapter).id);
      }
      await onSaved({
        chapterId: savedChapterId,
        exercise: draft.exercise,
        hadAnswers: parseChapterAnswers(existingChapter?.answers).length > 0,
      });
    } catch (err) {
      handleErr(err, "Failed to save chapter");
    } finally {
      setSaving(false);
    }
  }

  const busy = generating || saving;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onBack}
          disabled={busy}
        >
          ← Back to chapters
        </Button>
        <p className="text-sm text-muted-foreground">{classLabel}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {step === "upload" ? (
        <>
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>
                  {mode === "exercise" ? "Exercise photos" : "Chapter photos"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Up to {MAX_IMAGES} images, in page order.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || images.length >= MAX_IMAGES}
                  onClick={() => galleryInputRef.current?.click()}
                >
                  Choose images
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || images.length >= MAX_IMAGES}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  Take photo
                </Button>
              </div>
            </div>

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {images.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                No photos yet. Add the pages of one chapter.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <Image
                      src={image.previewUrl}
                      alt={`Chapter page ${index + 1}`}
                      width={64}
                      height={80}
                      unoptimized
                      className="h-20 w-16 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Page {index + 1}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {image.file.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={index === 0 || busy}
                          onClick={() => moveImage(index, -1)}
                          aria-label="Move image up"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={index === images.length - 1 || busy}
                          onClick={() => moveImage(index, 1)}
                          aria-label="Move image down"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => removeImage(image.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>AI effort</Label>
            <Select
              value={effort}
              onValueChange={(value) => setEffort(value as Effort)}
              disabled={busy}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="high">High (recommended)</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {EFFORT_HINT[effort]}
            </p>
          </div>

          {existingChapter ? (
            <p className="text-sm text-muted-foreground">
              {mode === "exercise" ? (
                <>
                  This will{" "}
                  {str(existingChapter.exercise).trim()
                    ? "replace the exercise of"
                    : "add an exercise to"}{" "}
                  <span className="font-medium">
                    {str(existingChapter.title)}
                  </span>{" "}
                  after you review the result.
                </>
              ) : (
                <>
                  This will replace the title, content, and exercise of{" "}
                  <span className="font-medium">
                    {str(existingChapter.title)}
                  </span>{" "}
                  after you review the result.
                </>
              )}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={busy || images.length === 0}
              onClick={() => void onGenerate()}
            >
              {generating
                ? mode === "exercise"
                  ? "Reading exercise pages..."
                  : "Reading images..."
                : mode === "exercise"
                  ? "Generate exercise"
                  : "Generate chapter"}
            </Button>
          </div>

          {generating ? (
            <p className="text-sm text-muted-foreground">
              The AI is reading every page and writing the chapter. This can
              take a few minutes for dense chapters.
            </p>
          ) : null}
        </>
      ) : draft ? (
        <>
          <p className="text-sm text-muted-foreground">
            Review the AI result and fix anything that looks wrong before
            saving.
          </p>

          {mode !== "exercise" ? (
            <>
              <div className="space-y-1">
                <Label>Chapter title</Label>
                <Input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev,
                    )
                  }
                  disabled={busy}
                />
              </div>

              <div className="space-y-1">
                <Label>Chapter content</Label>
                <Textarea
                  className="min-h-64"
                  value={draft.content}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, content: e.target.value } : prev,
                    )
                  }
                  disabled={busy}
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1">
            <Label>
              {mode === "exercise" ? "Exercise questions" : "Chapter exercise"}
            </Label>
            <Textarea
              className="min-h-40"
              value={draft.exercise}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, exercise: e.target.value } : prev,
                )
              }
              disabled={busy}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("upload")}
              disabled={busy}
            >
              Back to photos
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onGenerate()}
              disabled={busy}
            >
              {generating ? "Regenerating..." : "Regenerate"}
            </Button>
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={
                busy ||
                (mode !== "exercise" && !draft.title.trim()) ||
                (mode === "exercise" && !draft.exercise.trim())
              }
            >
              {saving
                ? "Saving..."
                : mode === "exercise"
                  ? "Save exercise"
                  : existingChapter
                    ? "Save changes"
                    : "Save chapter"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
