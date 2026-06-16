import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { AdminDashboardView } from "@/features/admin/admin-dashboard-view";

export default function AdminPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <AdminDashboardView />
      </AdminRoute>
    </TerminalAppShell>
  );
}
