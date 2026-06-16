import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { AdminEmailCampaignsView } from "@/features/admin/admin-email-campaigns-view";

export default function AdminEmailCampaignsPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <AdminEmailCampaignsView />
      </AdminRoute>
    </TerminalAppShell>
  );
}
