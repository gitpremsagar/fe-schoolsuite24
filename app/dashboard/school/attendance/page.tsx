import { redirect } from "next/navigation";

export default function AttendanceIndexPage() {
  redirect("/dashboard/school/attendance/students");
}
