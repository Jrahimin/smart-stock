"use client";

import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { DashboardLocaleSwitcher } from "@/features/market-dashboard/components/dashboard-locale-switcher";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { ReactNode } from "react";

type WorkspacePageHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  filterContextName?: string;
  onFilterTable?: (query: string) => void;
  children?: ReactNode;
  className?: string;
  freshnessClassName?: string;
  locale?: AppLocale;
  localeSwitcherAria?: string;
  /** Where the global stock search sits. Explorer uses `status` (near freshness). */
  commandSearchPlacement?: "controls" | "status";
  commandSearchPlaceholder?: string;
  commandSearchAriaLabel?: string;
};

export function WorkspacePageHero({
  eyebrow,
  title,
  subtitle,
  filterContextName,
  onFilterTable,
  children,
  className,
  freshnessClassName,
  locale,
  localeSwitcherAria,
  commandSearchPlacement = "controls",
  commandSearchPlaceholder,
  commandSearchAriaLabel,
}: WorkspacePageHeroProps) {
  const commandSearch = (
    <WorkspaceCommandSearch
      ariaLabel={commandSearchAriaLabel}
      filterContextName={filterContextName}
      onFilterTable={onFilterTable}
      placeholder={commandSearchPlaceholder}
      showQuickActions={false}
      variant="discovery"
    />
  );

  const statusRowClassName =
    commandSearchPlacement === "status"
      ? "explorer-hero-status-row explorer-hero-status-row-with-search"
      : "explorer-hero-status-row";

  return (
    <div className={className ? `explorer-hero ${className}` : "explorer-hero"}>
      <div className={statusRowClassName}>
        {commandSearchPlacement === "status" ? (
          <div className="explorer-hero-status-search">{commandSearch}</div>
        ) : null}
        <MarketDataFreshnessBar className={freshnessClassName} locale={locale} variant="status" />
        {locale ? (
          <div aria-label={localeSwitcherAria} className="explorer-hero-locale-switcher">
            <DashboardLocaleSwitcher locale={locale} />
          </div>
        ) : null}
      </div>

      <div className="explorer-hero-head">
        <div className="explorer-hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <div className="explorer-hero-subtitle">{subtitle}</div>
        </div>
      </div>

      {children || commandSearchPlacement === "controls" ? (
        <div className="explorer-hero-controls">
          {children ? <div className="explorer-hero-filters">{children}</div> : null}
          {commandSearchPlacement === "controls" ? (
            <div className="explorer-hero-discovery">{commandSearch}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
