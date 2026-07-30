"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/dashboard/school/attendance/students",
    label: "Student attendance",
  },
  {
    href: "/dashboard/school/attendance/staff",
    label: "Staff attendance",
  },
  {
    href: "/dashboard/school/attendance/holidays",
    label: "Holidays",
  },
] as const;

export default function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <div className="space-y-4">
        <div className="inline-flex rounded-full bg-muted p-1">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </DashboardShell>
  );
}
