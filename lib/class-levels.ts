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

export function formatClassLabel(
  classLevel: string | null | undefined,
  section?: string | null,
): string {
  if (!classLevel) return "—";
  return section ? `${classLevel} - ${section}` : classLevel;
}
