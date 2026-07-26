import { jsPDF } from "jspdf";
import { formatClassLabel } from "@/lib/class-levels";

const DAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export type TimetablePdfColumn =
  | { kind: "period"; periodIndex: number; label: string }
  | { kind: "recess"; afterPeriod: number; label: string };

export type TimetablePdfCell = {
  subjectName: string;
  teacherName: string;
};

export type GenerateClassTimetablePdfOptions = {
  schoolName?: string;
  classLevel: string;
  section?: string | null;
  academicYearName?: string;
  workingDays: number[];
  columns: TimetablePdfColumn[];
  /** key: `${dayOfWeek}:${periodIndex}` */
  cells: Record<string, TimetablePdfCell | undefined>;
  showTeacherNames: boolean;
};

function periodOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function buildTimetableColumns(
  periodCount: number,
  recessAfter: number[],
): TimetablePdfColumn[] {
  const columns: TimetablePdfColumn[] = [];
  const recessSet = new Set(recessAfter);
  for (let p = 1; p <= periodCount; p++) {
    columns.push({
      kind: "period",
      periodIndex: p,
      label: periodOrdinal(p),
    });
    if (recessSet.has(p)) {
      columns.push({
        kind: "recess",
        afterPeriod: p,
        label: "Recess",
      });
    }
  }
  return columns;
}

function wrapText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  doc.setFontSize(fontSize);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (doc.getTextWidth(next) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
}

/**
 * Landscape A4 weekly class timetable PDF.
 */
export function downloadClassTimetablePdf(
  options: GenerateClassTimetablePdfOptions,
): void {
  const {
    schoolName,
    classLevel,
    section,
    academicYearName,
    workingDays,
    columns,
    cells,
    showTeacherNames,
  } = options;

  const classLabel = formatClassLabel(classLevel, section ?? null);
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;

  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(schoolName?.trim() || "School", pageWidth / 2, y, {
    align: "center",
  });
  y += 6;

  doc.setFontSize(12);
  doc.text(`Class timetable — ${classLabel}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 5;

  if (academicYearName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(academicYearName, pageWidth / 2, y, { align: "center" });
    y += 5;
  }

  y += 2;

  const dayColWidth = 18;
  const recessWidth = 10;
  const periodCols = columns.filter((c) => c.kind === "period").length;
  const recessCols = columns.filter((c) => c.kind === "recess").length;
  const remaining =
    usableWidth - dayColWidth - recessCols * recessWidth;
  const periodWidth =
    periodCols > 0 ? remaining / periodCols : remaining;

  const colWidths = columns.map((c) =>
    c.kind === "recess" ? recessWidth : periodWidth,
  );

  const headerHeight = 8;
  const minRowHeight = showTeacherNames ? 14 : 10;

  // Measure row heights from content
  const rowHeights = workingDays.map((day) => {
    let maxH = minRowHeight;
    columns.forEach((col, colIndex) => {
      if (col.kind === "recess") return;
      const cell = cells[`${day}:${col.periodIndex}`];
      if (!cell) return;
      const pad = 1.5;
      const maxW = colWidths[colIndex]! - pad * 2;
      const subjectLines = wrapText(doc, cell.subjectName, maxW, 8);
      const teacherLines =
        showTeacherNames && cell.teacherName
          ? wrapText(doc, cell.teacherName, maxW, 6.5)
          : [];
      const h =
        pad * 2 +
        subjectLines.length * 3.2 +
        (teacherLines.length ? 0.8 + teacherLines.length * 2.6 : 0);
      maxH = Math.max(maxH, h);
    });
    return maxH;
  });

  const tableBottom =
    y +
    headerHeight +
    rowHeights.reduce((sum, h) => sum + h, 0);
  if (tableBottom > pageHeight - margin) {
    // Shrink fonts/rows slightly if overflowing — still one page for typical sizes
  }

  // Header
  let x = margin;
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.2);
  doc.rect(x, y, dayColWidth, headerHeight, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Day", x + dayColWidth / 2, y + headerHeight / 2 + 1, {
    align: "center",
  });
  x += dayColWidth;

  columns.forEach((col, i) => {
    const w = colWidths[i]!;
    if (col.kind === "recess") {
      doc.setFillColor(255, 243, 205);
    } else {
      doc.setFillColor(240, 240, 240);
    }
    doc.rect(x, y, w, headerHeight, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(col.kind === "recess" ? 6 : 8);
    doc.text(col.label, x + w / 2, y + headerHeight / 2 + 1, {
      align: "center",
    });
    x += w;
  });
  y += headerHeight;

  // Body rows
  workingDays.forEach((day, rowIndex) => {
    const rowH = rowHeights[rowIndex]!;
    x = margin;

    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, dayColWidth, rowH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(DAY_LABELS[day] ?? String(day), x + dayColWidth / 2, y + rowH / 2 + 1, {
      align: "center",
    });
    x += dayColWidth;

    columns.forEach((col, colIndex) => {
      const w = colWidths[colIndex]!;
      if (col.kind === "recess") {
        doc.setFillColor(255, 248, 230);
        doc.rect(x, y, w, rowH, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(120, 80, 0);
        doc.text("Recess", x + w / 2 + 1, y + rowH / 2, {
          align: "center",
          angle: 90,
        });
        doc.setTextColor(0, 0, 0);
        x += w;
        return;
      }

      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, rowH, "FD");

      const cell = cells[`${day}:${col.periodIndex}`];
      if (cell) {
        const pad = 1.5;
        const maxW = w - pad * 2;
        const subjectLines = wrapText(doc, cell.subjectName, maxW, 8);
        const teacherLines =
          showTeacherNames && cell.teacherName
            ? wrapText(doc, cell.teacherName, maxW, 6.5)
            : [];
        let textY = y + pad + 3;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        for (const line of subjectLines) {
          doc.text(line, x + w / 2, textY, { align: "center" });
          textY += 3.2;
        }
        if (teacherLines.length) {
          textY += 0.4;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(90, 90, 90);
          for (const line of teacherLines) {
            doc.text(line, x + w / 2, textY, { align: "center" });
            textY += 2.6;
          }
          doc.setTextColor(0, 0, 0);
        }
      }

      x += w;
    });

    y += rowH;
  });

  const filename = `timetable-${safeFilename(classLabel)}.pdf`;
  doc.save(filename);
}
