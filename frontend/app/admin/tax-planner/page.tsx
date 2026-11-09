import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { TaxPlannerV2Admin } from "@/features/wealth/tax-v2/admin-workspace";

export default function AdminTaxPlannerPage() {
  return (
    <TerminalAppShell>
      <AdminRoute>
        <TaxPlannerV2Admin />
      </AdminRoute>
    </TerminalAppShell>
  );
}
