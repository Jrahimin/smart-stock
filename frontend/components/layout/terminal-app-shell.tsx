"use client";

import {
  BarChart3,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LineChart,
  ScanSearch,
  Settings,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { GlobalCommandPalette } from "@/components/command/global-command-palette";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigationItems = [
  { label: "Intelligence", href: "/dashboard", icon: LayoutDashboard },
  { label: "Stocks", href: "/stocks", icon: LineChart },
  { label: "Scanner", href: "/scanner", icon: ScanSearch },
  { label: "Signals", href: "/signals", icon: Bell },
  { label: "Watchlist", href: "/watchlist", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

type TerminalAppShellProps = {
  children: ReactNode;
};

export function TerminalAppShell({ children }: TerminalAppShellProps) {
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const theme = useWorkspaceStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className={sidebarCollapsed ? "terminal-shell terminal-shell-collapsed" : "terminal-shell"}>
      <aside className="terminal-sidebar">
        <div className="terminal-sidebar-top">
          <div className="terminal-brand">
            <span>Smart Stock</span>
            <strong>Intelligence OS</strong>
          </div>
          <button
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle-button"
            onClick={toggleSidebar}
            type="button"
          >
            {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>
        <nav aria-label="Primary navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
            <Link href={item.href} key={item.href} title={item.label}>
              <Icon aria-hidden="true" size={18} />
              <span>{item.label}</span>
            </Link>
            );
          })}
        </nav>
      </aside>
      <main className="terminal-main">{children}</main>
      <GlobalCommandPalette />
    </div>
  );
}
