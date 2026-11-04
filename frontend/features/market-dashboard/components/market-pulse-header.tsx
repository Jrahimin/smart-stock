"use client";

import { StockWealthLockup } from "@/components/layout/stockwealth-lockup";
import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { DashboardGuideLauncher } from "@/features/guide/components/dashboard-guide-launcher";
import { DashboardLocaleSwitcher } from "@/features/market-dashboard/components/dashboard-locale-switcher";
import type { AppLocale } from "@/lib/locale/app-locale";

export function MarketDashboardHeader({ locale }: { locale: AppLocale }) {
  const searchLabel = locale === "bn" ? "শেয়ার খুঁজুন" : "Search stocks";
  return (
    <header className="market-dashboard-header" data-guide="dashboard-header">
      <StockWealthLockup className="sw-brand" />
      <div className="market-dashboard-header-tools">
        <WorkspaceCommandSearch ariaLabel={searchLabel} placeholder={searchLabel + "…"} locale={locale} filterContextName="market dashboard" showQuickActions={false} variant="discovery" />
        <MarketDataFreshnessBar locale={locale} variant="inline" />
        <DashboardLocaleSwitcher ariaLabel={locale === "bn" ? "ড্যাশবোর্ডের ভাষা" : "Dashboard language"} locale={locale} />
        <DashboardGuideLauncher locale={locale} />
      </div>
    </header>
  );
}
