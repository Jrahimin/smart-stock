"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { WealthWorkspaceNavIcon } from "@/components/layout/wealth-workspace-nav-icon";
import { useWealthWorkspaceInsightIndicator } from "@/features/wealth/hooks/use-wealth-workspace-insight-indicator";

type WealthWorkspaceNavPillProps = {
  locale?: string;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
};

export function WealthWorkspaceNavPill({ collapsed, isActive, onNavigate, locale = "en" }: WealthWorkspaceNavPillProps) {
  const hasInsight = useWealthWorkspaceInsightIndicator();
  const showInsightDot = isActive && hasInsight;

  return (
    <div className="terminal-nav-wealth-module">
      <Link
        aria-current={isActive ? "page" : undefined}
        aria-label={locale === "bn" ? "সম্পদের পরিকল্পনা খুলুন" : "Open Wealth Workspace"}
        className={isActive ? "wealth-workspace-nav-tile is-active" : "wealth-workspace-nav-tile"}
        data-guide="nav-wealth-workspace"
        href="/wealth"
        onClick={onNavigate}
        title={collapsed ? "Wealth Workspace" : undefined}
      >
        <span className="wealth-workspace-nav-tile-icon-wrap">
          <span className="wealth-workspace-nav-tile-icon-plaque">
            <WealthWorkspaceNavIcon className="wealth-workspace-nav-tile-icon" />
          </span>
        </span>
        <span className="wealth-workspace-nav-compact-label">{locale === "bn" ? "সম্পদ" : "Wealth"}</span>
        <span className="wealth-workspace-nav-tile-body">
          <span className="wealth-workspace-nav-tile-title">{locale === "bn" ? "সম্পদের পরিকল্পনা" : "Wealth Workspace"}</span>
          <span className="wealth-workspace-nav-tile-subtitle">{locale === "bn" ? "লক্ষ্য • আয় • ভবিষ্যৎ" : "Goals • Income • Future"}</span>
          <span className="wealth-workspace-nav-tile-action">
            <span>{locale === "bn" ? "পরিকল্পনা দেখুন" : "Open workspace"}</span>
            <ChevronRight aria-hidden="true" className="wealth-workspace-nav-tile-chevron" size={13} strokeWidth={2.25} />
          </span>
        </span>
        {showInsightDot ? <span aria-label="New wealth insight" className="wealth-workspace-nav-insight-dot" /> : null}
      </Link>
    </div>
  );
}
