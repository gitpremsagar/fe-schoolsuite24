"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AttendanceIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/school/attendance/students");
  }, [router]);

  return (
    <p className="text-sm text-muted-foreground">Opening student attendance...</p>
  );
}
