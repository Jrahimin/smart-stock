"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { WealthWorkspaceNavIcon } from "@/components/layout/wealth-workspace-nav-icon";
import { useWealthWorkspaceInsightIndicator } from "@/features/wealth/hooks/use-wealth-workspace-insight-indicator";

type WealthWorkspaceNavPillProps = {
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
};

export function WealthWorkspaceNavPill({ collapsed, isActive, onNavigate }: WealthWorkspaceNavPillProps) {
  const hasInsight = useWealthWorkspaceInsightIndicator();
  const showInsightDot = isActive && hasInsight;

  return (
    <div className="terminal-nav-wealth-module">
      <Link
        aria-current={isActive ? "page" : undefined}
        aria-label="Open Wealth Workspace"
        className={isActive ? "wealth-workspace-nav-tile is-active" : "wealth-workspace-nav-tile"}
        href="/wealth"
        onClick={onNavigate}
        title={collapsed ? "Wealth Workspace" : undefined}
      >
        <span className="wealth-workspace-nav-tile-icon-wrap">
          <span className="wealth-workspace-nav-tile-icon-plaque">
            <WealthWorkspaceNavIcon className="wealth-workspace-nav-tile-icon" />
          </span>
        </span>
        {!collapsed ? (
          <span className="wealth-workspace-nav-tile-body">
            <span className="wealth-workspace-nav-tile-title">Wealth Workspace</span>
            <span className="wealth-workspace-nav-tile-subtitle">Goals • Income • Future</span>
            <span className="wealth-workspace-nav-tile-action">
              <span>Open workspace</span>
              <ChevronRight aria-hidden="true" className="wealth-workspace-nav-tile-chevron" size={13} strokeWidth={2.25} />
            </span>
          </span>
        ) : null}
        {showInsightDot ? <span aria-label="New wealth insight" className="wealth-workspace-nav-insight-dot" /> : null}
      </Link>
    </div>
  );
}
