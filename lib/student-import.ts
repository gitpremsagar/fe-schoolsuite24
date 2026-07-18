import * as XLSX from "xlsx";
import { CLASS_LEVELS } from "@/lib/class-levels";

export const STUDENT_IMPORT_HEADERS = [
  "name",
  "email",
  "password",
  "admissionNumber",
  "fatherName",
  "motherName",
  "phone",
  "rollNumber",
  "permanentAddress",
  "currentAddress",
  "bloodGroup",
  "joiningDate",
  "isCurrentlyStudying",
  "leavingDate",
  "academicYear",
  "classLevel",
  "section",
] as const;

export type StudentImportHeader = (typeof STUDENT_IMPORT_HEADERS)[number];

export type StudentImportRow = Partial<Record<StudentImportHeader, string>>;

const HEADER_ALIASES: Record<string, StudentImportHeader> = {
  name: "name",
  "full name": "name",
  "student name": "name",
  email: "email",
  "email address": "email",
  password: "password",
  admissionnumber: "admissionNumber",
  "admission number": "admissionNumber",
  "admission no": "admissionNumber",
  fathername: "fatherName",
  "father's name": "fatherName",
  "father name": "fatherName",
  mothername: "motherName",
  "mother's name": "motherName",
  "mother name": "motherName",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  rollnumber: "rollNumber",
  "roll number": "rollNumber",
  "roll no": "rollNumber",
  permanentaddress: "permanentAddress",
  "permanent address": "permanentAddress",
  currentaddress: "currentAddress",
  "current address": "currentAddress",
  bloodgroup: "bloodGroup",
  "blood group": "bloodGroup",
  joiningdate: "joiningDate",
  "joining date": "joiningDate",
  iscurrentlystudying: "isCurrentlyStudying",
  "is currently studying": "isCurrentlyStudying",
  currentlystudying: "isCurrentlyStudying",
  leavingdate: "leavingDate",
  "leaving date": "leavingDate",
  academicyear: "academicYear",
  "academic year": "academicYear",
  classlevel: "classLevel",
  "class level": "classLevel",
  class: "classLevel",
  section: "section",
};

function normalizeHeader(value: unknown): StudentImportHeader | null {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase().replace(/[_-]+/g, " ");
  return HEADER_ALIASES[key] ?? null;
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date heuristic
    if (value > 20000 && value < 80000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const mm = String(parsed.m).padStart(2, "0");
        const dd = String(parsed.d).padStart(2, "0");
        return `${parsed.y}-${mm}-${dd}`;
      }
    }
    return String(value);
  }
  return String(value).trim();
}

function rowIsEmpty(row: StudentImportRow): boolean {
  return STUDENT_IMPORT_HEADERS.every((h) => !row[h]?.trim());
}

function sanitizeEmailPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

/** Build local-part prefix as firstname.lastname from a full name. */
function emailLocalPrefixFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => sanitizeEmailPart(p))
    .filter(Boolean);

  if (parts.length === 0) return "student";
  if (parts.length === 1) return `${parts[0]}.student`;
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

/**
 * Fill blank emails as firstname.lastname.{n}@example.com where n increments
 * for each auto-generated address in import order (1, 2, 3, …).
 */
export function fillMissingImportEmails(
  rows: StudentImportRow[],
): StudentImportRow[] {
  const used = new Set<string>();
  for (const row of rows) {
    const existing = row.email?.trim().toLowerCase();
    if (existing) used.add(existing);
  }

  let sequence = 0;
  return rows.map((row) => {
    if (row.email?.trim()) return row;

    const prefix = emailLocalPrefixFromName(row.name ?? "");
    let email = "";
    do {
      sequence += 1;
      email = `${prefix}.${sequence}@example.com`;
    } while (used.has(email));

    used.add(email);
    return { ...row, email };
  });
}

export function downloadStudentImportTemplate() {
  const sample: Record<StudentImportHeader, string> = {
    name: "Asha Kumar",
    email: "asha.kumar@example.com",
    password: "Student123!",
    admissionNumber: "ADM-001",
    fatherName: "Ravi Kumar",
    motherName: "Sita Kumar",
    phone: "9876543210",
    rollNumber: "12",
    permanentAddress: "12 Park Street, City",
    currentAddress: "12 Park Street, City",
    bloodGroup: "O+",
    joiningDate: "2025-04-01",
    isCurrentlyStudying: "TRUE",
    leavingDate: "",
    academicYear: "2025-26",
    classLevel: "1",
    section: "A",
  };

  const sheetData = [
    [...STUDENT_IMPORT_HEADERS],
    STUDENT_IMPORT_HEADERS.map((h) => sample[h]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = STUDENT_IMPORT_HEADERS.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }));
  XLSX.utils.book_append_sheet(wb, ws, "Students");

  const levelsSheet = XLSX.utils.aoa_to_sheet([
    ["classLevel (use exact values)"],
    ...CLASS_LEVELS.map((level) => [level]),
  ]);
  XLSX.utils.book_append_sheet(wb, levelsSheet, "Class levels");

  XLSX.writeFile(wb, "student-import-template.xlsx");
}

export async function parseStudentImportFile(
  file: File,
): Promise<StudentImportRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file has no sheets");
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: "", raw: true },
  );

  if (rows.length < 2) {
    throw new Error("Excel file must include a header row and at least one data row");
  }

  const headerCells = rows[0] ?? [];
  const columnMap: Array<StudentImportHeader | null> = headerCells.map(
    (cell) => normalizeHeader(cell),
  );

  if (!columnMap.some(Boolean)) {
    throw new Error("Could not recognize any student import columns");
  }

  const required: StudentImportHeader[] = [
    "name",
    "password",
    "admissionNumber",
  ];
  for (const key of required) {
    if (!columnMap.includes(key)) {
      throw new Error(`Missing required column: ${key}`);
    }
  }

  const parsed: StudentImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const row: StudentImportRow = {};
    columnMap.forEach((header, colIdx) => {
      if (!header) return;
      const value = cellToString(cells[colIdx]);
      if (value) row[header] = value;
    });
    if (!rowIsEmpty(row)) {
      parsed.push(row);
    }
  }

  if (parsed.length === 0) {
    throw new Error("No student rows found in the Excel file");
  }
  if (parsed.length > 200) {
    throw new Error("Cannot import more than 200 students at once");
  }

  return fillMissingImportEmails(parsed);
}
