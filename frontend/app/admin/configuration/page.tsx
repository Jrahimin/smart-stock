import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { AdminConfigurationView } from "@/features/admin/admin-configuration-view";

export default function AdminConfigurationPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <AdminConfigurationView />
      </AdminRoute>
    </TerminalAppShell>
  );
}
