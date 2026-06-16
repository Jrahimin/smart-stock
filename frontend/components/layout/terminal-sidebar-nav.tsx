"use client";

import {
  BarChart3,
  Bell,
  ChevronDown,
  Flame,
  LayoutDashboard,
  LineChart,
  Mail,
  ScanSearch,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/context/auth-context";
import { WealthWorkspaceNavPill } from "@/components/layout/wealth-workspace-nav-pill";

const marketNavigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, tone: "blue" as const },
  { label: "Market Pulse", href: "/market-pulse", icon: Flame, tone: "fire" as const },
  { label: "Stocks", href: "/stocks", icon: LineChart, tone: "blue" as const },
  { label: "Scanner", href: "/scanner", icon: ScanSearch, tone: "blue" as const },
  { label: "Signals", href: "/signals", icon: Bell, tone: "blue" as const },
  { label: "Watchlist", href: "/watchlist", icon: BarChart3, tone: "blue" as const },
];

const adminNavigationItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Users", href: "/admin/users", icon: Users, exact: false },
  { label: "Configuration", href: "/admin/configuration", icon: Settings, exact: false },
  { label: "Jobs", href: "/admin/jobs", icon: Workflow, exact: false },
  { label: "Email Campaigns", href: "/admin/email-campaigns", icon: Mail, exact: false },
] as const;

type TerminalSidebarNavProps = {
  collapsed: boolean;
  pathname: string;
};

export function TerminalSidebarNav({ collapsed, pathname }: TerminalSidebarNavProps) {
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const isWealthActive = isNavigationItemActive(pathname, "/wealth");
  const isAdminSection = pathname === "/admin" || pathname.startsWith("/admin/");
  const canAccessAdmin =
    mounted && !isLoading && (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN");
  const [opsExpanded, setOpsExpanded] = useState(isAdminSection);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAdminSection) {
      setOpsExpanded(true);
    }
  }, [isAdminSection]);

  return (
    <nav aria-label="Primary navigation">
      {canAccessAdmin ? (
        <>
          {!collapsed ? <p className="terminal-nav-section-label terminal-nav-section-label-ops">Operations</p> : null}
          {collapsed ? (
            <Link
              aria-current={isAdminSection ? "page" : undefined}
              className={isAdminSection ? "active terminal-nav-link-ops" : "terminal-nav-link-ops"}
              href="/admin"
              title="Operations"
            >
              <ShieldCheck aria-hidden="true" className="terminal-nav-icon terminal-nav-icon-blue" size={18} />
              <span>Operations</span>
            </Link>
          ) : (
            <div className="terminal-nav-ops-group">
              <div className="terminal-nav-ops-row">
                <Link
                  aria-current={pathname === "/admin" ? "page" : undefined}
                  className={isAdminSection ? "active terminal-nav-link-ops" : "terminal-nav-link-ops"}
                  href="/admin"
                  title="Operations"
                >
                  <ShieldCheck aria-hidden="true" className="terminal-nav-icon terminal-nav-icon-blue" size={18} />
                  <span>Operations</span>
                </Link>
                <button
                  aria-expanded={opsExpanded}
                  aria-label={opsExpanded ? "Collapse operations menu" : "Expand operations menu"}
                  className={`terminal-nav-ops-toggle ${opsExpanded ? "terminal-nav-ops-toggle-open" : ""}`}
                  onClick={() => setOpsExpanded((current) => !current)}
                  type="button"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              {opsExpanded ? (
                <div className="terminal-nav-sub-list">
                  {adminNavigationItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                    return (
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={isActive ? "terminal-nav-sub-link active" : "terminal-nav-sub-link"}
                        href={item.href}
                        key={item.href}
                      >
                        <Icon aria-hidden="true" size={14} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          <div aria-hidden="true" className="terminal-nav-divider" />
        </>
      ) : null}

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

  return pathname === href || pathname.startsWith(`${href}/`);
}
