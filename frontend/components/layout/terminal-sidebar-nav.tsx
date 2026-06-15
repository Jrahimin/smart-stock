"use client";

import {
  BarChart3,
  Bell,
  Flame,
  LayoutDashboard,
  LineChart,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";

import { WealthWorkspaceNavPill } from "@/components/layout/wealth-workspace-nav-pill";

const marketNavigationItems = [
  { label: "Market Pulse", href: "/market-pulse", icon: Flame, tone: "fire" as const },
  { label: "Intelligence", href: "/dashboard", icon: LayoutDashboard, tone: "blue" as const },
  { label: "Stocks", href: "/stocks", icon: LineChart, tone: "blue" as const },
  { label: "Scanner", href: "/scanner", icon: ScanSearch, tone: "blue" as const },
  { label: "Signals", href: "/signals", icon: Bell, tone: "blue" as const },
  { label: "Watchlist", href: "/watchlist", icon: BarChart3, tone: "blue" as const },
];

type TerminalSidebarNavProps = {
  collapsed: boolean;
  pathname: string;
};

export function TerminalSidebarNav({ collapsed, pathname }: TerminalSidebarNavProps) {
  const isWealthActive = isNavigationItemActive(pathname, "/wealth");

  return (
    <nav aria-label="Primary navigation">
      {!collapsed ? <p className="terminal-nav-section-label">Market</p> : null}

      {marketNavigationItems.map((item) => {
        const Icon = item.icon;
        const isActive = isNavigationItemActive(pathname, item.href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={isActive ? `active terminal-nav-link-${item.tone}` : `terminal-nav-link-${item.tone}`}
            href={item.href}
            key={item.href}
            title={item.label}
          >
            <Icon aria-hidden="true" className={`terminal-nav-icon terminal-nav-icon-${item.tone}`} size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div aria-hidden="true" className="terminal-nav-divider" />

      {!collapsed ? <p className="terminal-nav-section-label">Personal</p> : null}

      <WealthWorkspaceNavPill collapsed={collapsed} isActive={isWealthActive} />
    </nav>
  );
}

function isNavigationItemActive(pathname: string, href: string) {
  if (href === "/stocks" || href === "/wealth" || href === "/market-pulse") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return pathname === href;
}
