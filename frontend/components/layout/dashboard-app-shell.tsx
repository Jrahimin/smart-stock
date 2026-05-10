import type { ReactNode } from "react";

import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";

type DashboardAppShellProps = {
  children: ReactNode;
};

export function DashboardAppShell({ children }: DashboardAppShellProps) {
  return (
    <div className="dashboard-shell">
      <DashboardSidebar />
      <main className="dashboard-main">
        <DashboardTopbar />
        {children}
      </main>
    </div>
  );
}

