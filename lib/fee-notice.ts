import { formatClassLabel } from "@/lib/class-levels";

export type FeeNoticeMonth = {
  year: number;
  month: number;
  key: string;
  label: string;
};

export type FeeNoticeCell = {
  status?: string;
  amountDue?: number | null;
  isApplicable?: boolean;
};

export type FeeNoticeStudent = Record<string, unknown> & {
  studentProfileId?: string;
  name?: string;
  classLevel?: string;
  className?: string;
  section?: string | null;
  months?: Record<string, FeeNoticeCell>;
};

export type DueMonthLine = {
  key: string;
  labelEn: string;
  labelHi: string;
  amount: number;
};

export type StudentDueNotice = {
  student: FeeNoticeStudent;
  studentName: string;
  classLabel: string;
  dueMonths: DueMonthLine[];
  totalDue: number;
};

const HINDI_MONTHS = [
  "जनवरी",
  "फ़रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितंबर",
  "अक्टूबर",
  "नवंबर",
  "दिसंबर",
] as const;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function ordinal(year: number, month: number): number {
  return year * 12 + month;
}

function monthEnglish(month: FeeNoticeMonth): string {
  return new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleString(
    "en-IN",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
}

function monthHindi(month: FeeNoticeMonth): string {
  return `${HINDI_MONTHS[month.month - 1] ?? month.label} ${month.year}`;
}

export function noticeClassLabel(student: FeeNoticeStudent): string {
  return formatClassLabel(
    text(student.classLevel || student.className),
    text(student.section) || null,
    { compact: true },
  );
}

export function getDueMonthsForStudent(
  student: FeeNoticeStudent,
  months: FeeNoticeMonth[],
  upToKey: string,
): DueMonthLine[] {
  const upTo = months.find((month) => month.key === upToKey);
  if (!upTo) return [];
  const maxOrdinal = ordinal(upTo.year, upTo.month);
  const monthMap = student.months ?? {};

  return months.flatMap((month) => {
    if (ordinal(month.year, month.month) > maxOrdinal) return [];
    const cell = monthMap[month.key];
    if (
      !cell ||
      cell.isApplicable === false ||
      (cell.status !== "UNPAID" && cell.status !== "PARTIAL")
    ) {
      return [];
    }
    const amount = Number(cell.amountDue);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    return [
      {
        key: month.key,
        labelEn: monthEnglish(month),
        labelHi: monthHindi(month),
        amount,
      },
    ];
  });
}

export function buildStudentDueNotice(
  student: FeeNoticeStudent,
  months: FeeNoticeMonth[],
  upToKey: string,
): StudentDueNotice | null {
  const dueMonths = getDueMonthsForStudent(student, months, upToKey);
  if (dueMonths.length === 0) return null;
  return {
    student,
    studentName: text(student.name),
    classLabel: noticeClassLabel(student),
    dueMonths,
    totalDue: dueMonths.reduce((sum, month) => sum + month.amount, 0),
  };
}

export function studentsWithDues(
  students: FeeNoticeStudent[],
  months: FeeNoticeMonth[],
  upToKey: string,
): StudentDueNotice[] {
  return students.flatMap((student) => {
    const notice = buildStudentDueNotice(student, months, upToKey);
    return notice ? [notice] : [];
  });
}
