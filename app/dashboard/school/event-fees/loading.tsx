import { DashboardShell } from "@/components/layout/dashboard-shell";
import { LoadingPulseCard } from "@/components/ui/loading-pulse-card";

export default function EventFeesLoading() {
  return (
    <DashboardShell allowedRoles={["ADMIN"]}>
      <LoadingPulseCard />
    </DashboardShell>
  );
}
