import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { AdminUsersView } from "@/features/admin/admin-users-view";

export default function AdminUsersPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <AdminUsersView />
      </AdminRoute>
    </TerminalAppShell>
  );
}
