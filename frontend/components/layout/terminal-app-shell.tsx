"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { GlobalCommandPalette } from "@/components/command/global-command-palette";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigationItems = [
  { label: "Intelligence", href: "/dashboard" },
  { label: "Stocks", href: "/stocks" },
  { label: "Scanner", href: "/scanner" },
  { label: "Signals", href: "/signals" },
  { label: "Watchlist", href: "/watchlist" },
];

type TerminalAppShellProps = {
  children: ReactNode;
};

export function TerminalAppShell({ children }: TerminalAppShellProps) {
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);

  return (
    <div className={sidebarCollapsed ? "terminal-shell terminal-shell-collapsed" : "terminal-shell"}>
      <aside className="terminal-sidebar">
        <div className="terminal-brand">
          <span>Smart Stock</span>
          <strong>Intelligence OS</strong>
        </div>
        <nav aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button className="ghost-button" onClick={toggleSidebar} type="button">
          {sidebarCollapsed ? "Expand" : "Collapse"}
        </button>
      </aside>
      <main className="terminal-main">{children}</main>
      <GlobalCommandPalette />
    </div>
  );
}
