"use client";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type CalendarDay = {
  day: number;
  label: string;
  title?: string;
  className?: string;
};

type MonthCalendarProps = {
  year: number;
  month: number;
  days: CalendarDay[];
  emptyLabel?: string;
};

export function MonthCalendar({
  year,
  month,
  days,
  emptyLabel = "·",
}: MonthCalendarProps) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const cells: Array<CalendarDay | null> = [];

  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(byDay.get(day) ?? { day, label: emptyLabel });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) =>
          cell == null ? (
            <div key={`empty-${idx}`} className="aspect-square" />
          ) : (
            <div
              key={cell.day}
              title={cell.title ?? `${cell.day}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md border text-xs",
                cell.className,
              )}
            >
              <span className="text-[10px] text-muted-foreground">
                {cell.day}
              </span>
              <span className="font-semibold leading-none">{cell.label}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function monthTitle(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });
}
