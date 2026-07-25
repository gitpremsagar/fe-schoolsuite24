export const CLASS_LEVELS = [
  "Pre-nursery",
  "Nursery",
  "Lower kindergarten",
  "Upper kindergarten",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;

export type ClassLevel = (typeof CLASS_LEVELS)[number];

const CLASS_LEVEL_SHORT: Partial<Record<string, string>> = {
  "Lower kindergarten": "L-KG",
  "Upper kindergarten": "U-KG",
};

export function formatClassLabel(
  classLevel: string | null | undefined,
  section?: string | null,
  opts?: { compact?: boolean },
): string {
  if (!classLevel) return "—";
  const level =
    opts?.compact && CLASS_LEVEL_SHORT[classLevel]
      ? CLASS_LEVEL_SHORT[classLevel]!
      : classLevel;
  return section ? `${level} - ${section}` : level;
}
