"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { dashboardPathForRole, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  const overviewRoots = new Set([
    "/dashboard/school",
    "/dashboard/super-admin",
    "/dashboard/teacher",
    "/dashboard/employee",
    "/dashboard/student",
  ]);
  if (overviewRoots.has(href)) return false;
  return pathname.startsWith(`${href}/`);
}

type NavItem = { href: string; label: string };

function navForRole(role: UserRole): NavItem[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [
        { href: "/dashboard/super-admin", label: "Overview" },
        { href: "/dashboard/super-admin/schools", label: "Schools" },
        { href: "/dashboard/super-admin/plans", label: "Plans" },
        { href: "/dashboard/super-admin/payments", label: "Payments" },
      ];
    case "ADMIN":
      return [
        { href: "/dashboard/school", label: "Overview" },
        { href: "/dashboard/school/academic-years", label: "Academic Years" },
        { href: "/dashboard/school/classes", label: "Classes" },
        { href: "/dashboard/school/students", label: "Students" },
        { href: "/dashboard/school/staff", label: "Staff" },
        { href: "/dashboard/school/attendance/students", label: "Attendance" },
        { href: "/dashboard/school/fees", label: "Fee" },
        { href: "/dashboard/school/billing", label: "Billing" },
        { href: "/dashboard/school/settings", label: "Settings" },
      ];
    case "TEACHER":
      return [
        { href: "/dashboard/teacher", label: "Overview" },
        { href: "/dashboard/teacher/attendance", label: "Student Attendance" },
        { href: "/dashboard/teacher/punch", label: "My Punch" },
      ];
    case "EMPLOYEE":
      return [
        { href: "/dashboard/employee", label: "Overview" },
        { href: "/dashboard/employee/punch", label: "Punch In/Out" },
      ];
    case "STUDENT":
      return [
        { href: "/dashboard/student", label: "Overview" },
        { href: "/dashboard/student/attendance", label: "My Attendance" },
      ];
    default:
      return [];
  }
}

export function DashboardShell({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      router.replace(dashboardPathForRole(user.role));
    }
  }, [user, loading, router, allowedRoles]);

  if (loading || !user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading dashboard...
      </div>
    );
  }

  const nav = navForRole(user.role);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 p-4 md:p-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border bg-card p-4 md:block">
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              School ERP
            </p>
            <h1 className="text-lg font-semibold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.role.replace("_", " ")}</p>
          </div>
          <nav className="space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-xl px-3 py-2 text-sm transition",
                  isNavActive(pathname, item.href)
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            Log out
          </Button>
        </aside>
        <main className="flex-1 rounded-2xl border bg-card p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between md:hidden">
            <div>
              <p className="font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              Log out
            </Button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2 md:hidden">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  size="sm"
                  variant={isNavActive(pathname, item.href) ? "default" : "outline"}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
