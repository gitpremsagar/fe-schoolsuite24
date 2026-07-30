"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MarkSheetSubjectCol = {
  subjectId: string;
  name: string;
  maxMarks: number;
};

export type MarkSheetStudentRow = {
  studentProfileId: string;
  name: string;
  rollNumber: string;
  bySubject: Record<
    string,
    {
      id: string;
      marksObtained: number | null;
      maxMarks: number;
    }
  >;
};

export type MarkSheetRowStat = {
  total: number;
  percentage: number;
  rank: number;
};

type Props = {
  studentRows: MarkSheetStudentRow[];
  subjectCols: MarkSheetSubjectCol[];
  marks: Record<string, string>;
  rowStats: MarkSheetRowStat[];
  maxTotal: number;
  onMarksChange: (sheetId: string, value: string) => void;
};

function cellInputId(rowIndex: number, colIndex: number) {
  return `ms-cell-${rowIndex}-${colIndex}`;
}

export function MarkSheetGrid({
  studentRows,
  subjectCols,
  marks,
  rowStats,
  maxTotal,
  onMarksChange,
}: Props) {
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [focusCol, setFocusCol] = useState<number | null>(null);
  const [overLimit, setOverLimit] = useState<Record<string, boolean>>({});
  const clearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const activeRow = hoverRow ?? focusRow;
  const activeCol = hoverCol ?? focusCol;

  useEffect(() => {
    const timers = clearTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const flashOverLimit = useCallback((sheetId: string) => {
    setOverLimit((prev) => ({ ...prev, [sheetId]: true }));
    if (clearTimers.current[sheetId]) {
      clearTimeout(clearTimers.current[sheetId]);
    }
    clearTimers.current[sheetId] = setTimeout(() => {
      setOverLimit((prev) => {
        const next = { ...prev };
        delete next[sheetId];
        return next;
      });
      delete clearTimers.current[sheetId];
    }, 1600);
  }, []);

  const focusCell = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (
        rowIndex < 0 ||
        colIndex < 0 ||
        rowIndex >= studentRows.length ||
        colIndex >= subjectCols.length
      ) {
        return;
      }
      const row = studentRows[rowIndex];
      const col = subjectCols[colIndex];
      if (!row.bySubject[col.subjectId]) {
        return;
      }
      setFocusRow(rowIndex);
      setFocusCol(colIndex);
      setHoverRow(rowIndex);
      setHoverCol(colIndex);
      const el = document.getElementById(
        cellInputId(rowIndex, colIndex),
      ) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    },
    [studentRows, subjectCols],
  );

  const findNextEditable = useCallback(
    (
      rowIndex: number,
      colIndex: number,
      dRow: number,
      dCol: number,
    ): { row: number; col: number } | null => {
      let r = rowIndex + dRow;
      let c = colIndex + dCol;
      while (
        r >= 0 &&
        r < studentRows.length &&
        c >= 0 &&
        c < subjectCols.length
      ) {
        const sheet = studentRows[r].bySubject[subjectCols[c].subjectId];
        if (sheet) return { row: r, col: c };
        r += dRow;
        c += dCol;
      }
      return null;
    },
    [studentRows, subjectCols],
  );

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
  ) {
    let dRow = 0;
    let dCol = 0;
    if (e.key === "Enter") dRow = 1;
    else if (e.key === "ArrowUp") dRow = -1;
    else if (e.key === "ArrowDown") dRow = 1;
    else if (e.key === "ArrowLeft") dCol = -1;
    else if (e.key === "ArrowRight") dCol = 1;
    else return;

    // Spreadsheet convention: arrows/Enter move between cells.
    e.preventDefault();
    const next = findNextEditable(rowIndex, colIndex, dRow, dCol);
    if (next) focusCell(next.row, next.col);
  }

  function handleCellChange(
    sheetId: string,
    raw: string,
    maxMarks: number,
  ) {
    if (raw.trim() === "") {
      onMarksChange(sheetId, "");
      return;
    }
    const value = Number(raw);
    if (!Number.isNaN(value) && value > maxMarks) {
      flashOverLimit(sheetId);
      onMarksChange(sheetId, String(maxMarks));
      return;
    }
    if (!Number.isNaN(value) && value < 0) {
      flashOverLimit(sheetId);
      onMarksChange(sheetId, "0");
      return;
    }
    onMarksChange(sheetId, raw);
  }

  function isInvalid(sheetId: string, maxMarks: number) {
    if (overLimit[sheetId]) return true;
    const raw = marks[sheetId]?.trim() ?? "";
    if (raw === "") return false;
    const value = Number(raw);
    return !Number.isNaN(value) && (value > maxMarks || value < 0);
  }

  function rowHasAnyMarks(row: MarkSheetStudentRow) {
    return subjectCols.some((c) => {
      const s = row.bySubject[c.subjectId];
      return s && (marks[s.id] ?? "").trim() !== "";
    });
  }

  function cellHighlight(rowIndex: number, colIndex: number | null) {
    const rowHit = activeRow === rowIndex;
    const colHit = colIndex != null && activeCol === colIndex;
    return rowHit || colHit;
  }

  return (
    <div
      className="overflow-x-auto rounded-md border border-neutral-300 dark:border-neutral-700"
      onMouseLeave={() => {
        setHoverRow(null);
        setHoverCol(null);
      }}
    >
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-900">
            <th className="sticky left-0 z-20 border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-left font-semibold whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-900">
              Roll
            </th>
            <th className="sticky left-[52px] z-20 border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-left font-semibold whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-900">
              Student
            </th>
            {subjectCols.map((col, colIndex) => (
              <th
                key={col.subjectId}
                onMouseEnter={() => setHoverCol(colIndex)}
                onMouseLeave={() => setHoverCol(null)}
                className={cn(
                  "border border-neutral-300 px-1 py-1.5 text-center font-semibold transition-colors dark:border-neutral-700",
                  activeCol === colIndex &&
                    "bg-sky-100 dark:bg-sky-950/60",
                )}
              >
                <div className="min-w-[72px] leading-tight">
                  <div className="truncate px-1">{col.name}</div>
                  <div className="text-muted-foreground text-[10px] font-normal">
                    / {col.maxMarks}
                  </div>
                </div>
              </th>
            ))}
            <th className="border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-center font-semibold whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-950">
              Total
              <div className="text-muted-foreground text-[10px] font-normal">
                / {maxTotal}
              </div>
            </th>
            <th className="border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-center font-semibold whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-950">
              %
            </th>
            <th className="border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-center font-semibold whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-950">
              Rank
            </th>
          </tr>
        </thead>
        <tbody>
          {studentRows.map((row, rowIndex) => {
            const stats = rowStats[rowIndex];
            const anyMarks = rowHasAnyMarks(row);
            const rowActive = activeRow === rowIndex;
            return (
              <tr
                key={row.studentProfileId}
                onMouseEnter={() => setHoverRow(rowIndex)}
                onMouseLeave={() => setHoverRow(null)}
                className={cn(
                  "odd:bg-white even:bg-neutral-50/80 dark:odd:bg-background dark:even:bg-neutral-950/50",
                  rowActive && "bg-sky-50 dark:bg-sky-950/40",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 border border-neutral-300 px-2 py-0.5 text-center tabular-nums whitespace-nowrap dark:border-neutral-700",
                    rowActive
                      ? "bg-sky-50 dark:bg-sky-950/40"
                      : "bg-inherit",
                  )}
                >
                  {row.rollNumber || "—"}
                </td>
                <td
                  className={cn(
                    "sticky left-[52px] z-10 max-w-[160px] truncate border border-neutral-300 px-2 py-0.5 font-medium whitespace-nowrap dark:border-neutral-700",
                    rowActive
                      ? "bg-sky-50 dark:bg-sky-950/40"
                      : "bg-inherit",
                  )}
                >
                  {row.name}
                </td>
                {subjectCols.map((col, colIndex) => {
                  const sheet = row.bySubject[col.subjectId];
                  const highlighted = cellHighlight(rowIndex, colIndex);
                  if (!sheet) {
                    return (
                      <td
                        key={col.subjectId}
                        onMouseEnter={() => {
                          setHoverRow(rowIndex);
                          setHoverCol(colIndex);
                        }}
                        onMouseLeave={() => {
                          setHoverCol(null);
                        }}
                        className={cn(
                          "border border-neutral-300 px-1 py-0.5 text-center text-muted-foreground dark:border-neutral-700",
                          highlighted
                            ? "bg-sky-50 dark:bg-sky-950/40"
                            : "bg-neutral-100/50",
                        )}
                      >
                        —
                      </td>
                    );
                  }
                  const invalid = isInvalid(sheet.id, col.maxMarks);
                  return (
                    <td
                      key={col.subjectId}
                      onMouseEnter={() => {
                        setHoverRow(rowIndex);
                        setHoverCol(colIndex);
                      }}
                      onMouseLeave={() => setHoverCol(null)}
                      className={cn(
                        "border border-neutral-300 p-0 dark:border-neutral-700",
                        invalid
                          ? "bg-red-100 dark:bg-red-950/50"
                          : highlighted
                            ? "bg-sky-50 dark:bg-sky-950/40"
                            : "",
                      )}
                    >
                      <input
                        id={cellInputId(rowIndex, colIndex)}
                        type="number"
                        min={0}
                        max={col.maxMarks}
                        step={0.5}
                        className={cn(
                          "h-8 w-full min-w-[72px] border-0 bg-transparent px-1 text-center tabular-nums outline-none",
                          invalid
                            ? "bg-red-100 text-red-800 focus:bg-red-100 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:bg-red-950/50 dark:text-red-200 dark:focus:bg-red-950/60"
                            : "focus:bg-amber-50 focus:ring-1 focus:ring-inset focus:ring-amber-400 dark:focus:bg-amber-950/40",
                        )}
                        value={marks[sheet.id] ?? ""}
                        onFocus={() => {
                          setFocusRow(rowIndex);
                          setFocusCol(colIndex);
                          setHoverRow(rowIndex);
                          setHoverCol(colIndex);
                        }}
                        onBlur={(e) => {
                          const next = e.relatedTarget as HTMLElement | null;
                          if (
                            !next ||
                            !next.id?.startsWith("ms-cell-")
                          ) {
                            setFocusRow(null);
                            setFocusCol(null);
                          }
                        }}
                        onChange={(e) =>
                          handleCellChange(
                            sheet.id,
                            e.target.value,
                            col.maxMarks,
                          )
                        }
                        onKeyDown={(e) =>
                          handleCellKeyDown(e, rowIndex, colIndex)
                        }
                      />
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "border border-neutral-300 px-2 py-0.5 text-center font-medium tabular-nums dark:border-neutral-700",
                    rowActive
                      ? "bg-sky-50 dark:bg-sky-950/40"
                      : "bg-neutral-50 dark:bg-neutral-950",
                  )}
                >
                  {anyMarks
                    ? stats.total % 1 === 0
                      ? stats.total
                      : stats.total.toFixed(1)
                    : "—"}
                </td>
                <td
                  className={cn(
                    "border border-neutral-300 px-2 py-0.5 text-center tabular-nums dark:border-neutral-700",
                    rowActive
                      ? "bg-sky-50 dark:bg-sky-950/40"
                      : "bg-neutral-50 dark:bg-neutral-950",
                  )}
                >
                  {anyMarks ? `${stats.percentage.toFixed(1)}%` : "—"}
                </td>
                <td
                  className={cn(
                    "border border-neutral-300 px-2 py-0.5 text-center font-semibold tabular-nums dark:border-neutral-700",
                    rowActive
                      ? "bg-sky-50 dark:bg-sky-950/40"
                      : "bg-neutral-50 dark:bg-neutral-950",
                  )}
                >
                  {anyMarks ? stats.rank : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
