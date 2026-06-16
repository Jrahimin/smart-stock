import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { AdminJobsView } from "@/features/admin/admin-jobs-view";

export default function AdminJobsPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <AdminJobsView />
      </AdminRoute>
    </TerminalAppShell>
  );
}
