"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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

type SortKey =
  | "roll"
  | "student"
  | "total"
  | "percentage"
  | "rank"
  | `subject:${string}`;

type SortDir = "asc" | "desc";

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

function compareRoll(a: string, b: string) {
  if (a && b) return a.localeCompare(b, undefined, { numeric: true });
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function parseMark(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

/** Empty/null values always sort after defined values. */
function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: number,
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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

  const sortedEntries = useMemo(() => {
    const entries = studentRows.map((row, i) => ({
      row,
      stats: rowStats[i] ?? { total: 0, percentage: 0, rank: 0 },
    }));
    if (!sortKey) return entries;

    const dir = sortDir === "asc" ? 1 : -1;
    const subjectId =
      sortKey.startsWith("subject:") ? sortKey.slice("subject:".length) : null;

    return [...entries].sort((a, b) => {
      let cmp = 0;

      if (sortKey === "roll") {
        cmp = compareRoll(a.row.rollNumber, b.row.rollNumber) * dir;
      } else if (sortKey === "student") {
        cmp = a.row.name.localeCompare(b.row.name) * dir;
      } else if (subjectId) {
        const sheetA = a.row.bySubject[subjectId];
        const sheetB = b.row.bySubject[subjectId];
        const markA = sheetA ? parseMark(marks[sheetA.id]) : null;
        const markB = sheetB ? parseMark(marks[sheetB.id]) : null;
        cmp = compareNullableNumber(markA, markB, dir);
      } else if (sortKey === "total") {
        const aAny = subjectCols.some((c) => {
          const s = a.row.bySubject[c.subjectId];
          return s && (marks[s.id] ?? "").trim() !== "";
        });
        const bAny = subjectCols.some((c) => {
          const s = b.row.bySubject[c.subjectId];
          return s && (marks[s.id] ?? "").trim() !== "";
        });
        cmp = compareNullableNumber(
          aAny ? a.stats.total : null,
          bAny ? b.stats.total : null,
          dir,
        );
      } else if (sortKey === "percentage") {
        const aAny = subjectCols.some((c) => {
          const s = a.row.bySubject[c.subjectId];
          return s && (marks[s.id] ?? "").trim() !== "";
        });
        const bAny = subjectCols.some((c) => {
          const s = b.row.bySubject[c.subjectId];
          return s && (marks[s.id] ?? "").trim() !== "";
        });
        cmp = compareNullableNumber(
          aAny ? a.stats.percentage : null,
          bAny ? b.stats.percentage : null,
          dir,
        );
      } else if (sortKey === "rank") {
        cmp = compareNullableNumber(
          a.stats.rank > 0 ? a.stats.rank : null,
          b.stats.rank > 0 ? b.stats.rank : null,
          dir,
        );
      }

      if (cmp !== 0) return cmp;
      return (
        compareRoll(a.row.rollNumber, b.row.rollNumber) ||
        a.row.name.localeCompare(b.row.name)
      );
    });
  }, [studentRows, rowStats, sortKey, sortDir, marks, subjectCols]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

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
        rowIndex >= sortedEntries.length ||
        colIndex >= subjectCols.length
      ) {
        return;
      }
      const row = sortedEntries[rowIndex].row;
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
    [sortedEntries, subjectCols],
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
        r < sortedEntries.length &&
        c >= 0 &&
        c < subjectCols.length
      ) {
        const sheet =
          sortedEntries[r].row.bySubject[subjectCols[c].subjectId];
        if (sheet) return { row: r, col: c };
        r += dRow;
        c += dCol;
      }
      return null;
    },
    [sortedEntries, subjectCols],
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

  function SortableHead({
    label,
    column,
    className,
    children,
    onMouseEnter,
    onMouseLeave,
  }: {
    label: string;
    column: SortKey;
    className?: string;
    children?: React.ReactNode;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  }) {
    const active = sortKey === column;
    const Icon = !active
      ? ArrowUpDown
      : sortDir === "asc"
        ? ArrowUp
        : ArrowDown;

    return (
      <th
        className={className}
        aria-sort={
          active
            ? sortDir === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={cn(
            "inline-flex w-full items-center justify-center gap-0.5 font-semibold hover:text-foreground",
            active ? "text-foreground" : "text-muted-foreground",
            column === "roll" || column === "student"
              ? "justify-start"
              : "justify-center",
          )}
        >
          <span className="min-w-0">{children ?? label}</span>
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </th>
    );
  }

  return (
    <div
      className="max-h-[min(70vh,calc(100vh-14rem))] overflow-auto rounded-md border border-neutral-300 dark:border-neutral-700"
      onMouseLeave={() => {
        setHoverRow(null);
        setHoverCol(null);
      }}
    >
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-900">
            <SortableHead
              label="Roll"
              column="roll"
              className="sticky top-0 left-0 z-30 border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-left whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-900"
            />
            <SortableHead
              label="Student"
              column="student"
              className="sticky top-0 left-[52px] z-30 border border-neutral-300 bg-neutral-100 px-2 py-1.5 text-left whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-900"
            />
            {subjectCols.map((col, colIndex) => (
              <SortableHead
                key={col.subjectId}
                label={col.name}
                column={`subject:${col.subjectId}`}
                onMouseEnter={() => setHoverCol(colIndex)}
                onMouseLeave={() => setHoverCol(null)}
                className={cn(
                  "sticky top-0 z-20 border border-neutral-300 bg-neutral-100 px-1 py-1.5 text-center transition-colors dark:border-neutral-700 dark:bg-neutral-900",
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
              </SortableHead>
            ))}
            <SortableHead
              label="Total"
              column="total"
              className="sticky top-0 z-20 border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-center whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-950"
            >
              <div className="leading-tight">
                Total
                <div className="text-muted-foreground text-[10px] font-normal">
                  / {maxTotal}
                </div>
              </div>
            </SortableHead>
            <SortableHead
              label="%"
              column="percentage"
              className="sticky top-0 z-20 border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-center whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-950"
            />
            <SortableHead
              label="Rank"
              column="rank"
              className="sticky top-0 z-20 border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-center whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-950"
            />
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map(({ row, stats }, rowIndex) => {
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
                      ? "bg-sky-50 dark:bg-sky-950"
                      : rowIndex % 2 === 0
                        ? "bg-white dark:bg-background"
                        : "bg-neutral-50 dark:bg-neutral-950",
                  )}
                >
                  {row.rollNumber || "—"}
                </td>
                <td
                  className={cn(
                    "sticky left-[52px] z-10 max-w-[160px] truncate border border-neutral-300 px-2 py-0.5 font-medium whitespace-nowrap dark:border-neutral-700",
                    rowActive
                      ? "bg-sky-50 dark:bg-sky-950"
                      : rowIndex % 2 === 0
                        ? "bg-white dark:bg-background"
                        : "bg-neutral-50 dark:bg-neutral-950",
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
