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
}: WorkspacePageHeroProps) {
  return (
    <div className={className ? `explorer-hero ${className}` : "explorer-hero"}>
      <div className="explorer-hero-status-row">
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

      <div className="explorer-hero-controls">
        {children ? <div className="explorer-hero-filters">{children}</div> : null}
        <div className="explorer-hero-discovery">
          <WorkspaceCommandSearch
            filterContextName={filterContextName}
            onFilterTable={onFilterTable}
            showQuickActions={false}
            variant="discovery"
          />
        </div>
      </div>
    </div>
  );
}
