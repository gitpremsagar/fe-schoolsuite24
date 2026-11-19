export type ChapterAnswerSource = "chapter" | "general";

export type ChapterAnswer = {
  question: string;
  answer: string;
  explanation: string;
  source: ChapterAnswerSource;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Convert the JSON value stored in Chapter.answers into a safe array. */
export function parseChapterAnswers(value: unknown): ChapterAnswer[] {
  if (!Array.isArray(value)) return [];
  const answers: ChapterAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const question = str(row.question).trim();
    const answer = str(row.answer).trim();
    if (!question || !answer) continue;
    answers.push({
      question,
      answer,
      explanation: str(row.explanation).trim(),
      source: row.source === "general" ? "general" : "chapter",
    });
  }
  return answers;
}
