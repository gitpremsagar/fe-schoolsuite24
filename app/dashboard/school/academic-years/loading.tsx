import { DashboardShell } from "@/components/layout/dashboard-shell";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";

export default function AcademicYearsLoading() {
  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <LoadingPulseCard />
    </DashboardShell>
  );
}
