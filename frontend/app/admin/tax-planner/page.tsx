import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { AdminTaxPlannerView } from "@/features/admin/admin-tax-planner-view";

export default function AdminTaxPlannerPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <AdminTaxPlannerView />
      </AdminRoute>
    </TerminalAppShell>
  );
}
