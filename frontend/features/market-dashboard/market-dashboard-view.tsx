"use client";

import { DashboardSsrHydrationGuard } from "@/features/market-dashboard/components/dashboard-ssr-hydration-guard";
import { InstitutionalHeatmap } from "@/features/market-dashboard/components/institutional-heatmap";
import { InsightSidebar } from "@/features/market-dashboard/components/insight-sidebar";
import { MarketDashboardHeader } from "@/features/market-dashboard/components/market-pulse-header";
import { MarketOverview } from "@/features/market-dashboard/components/market-overview";
import { MarketTimeline } from "@/features/market-dashboard/components/market-timeline";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { TerminalMovers } from "@/features/market-dashboard/components/terminal-movers";
import { useMarketDashboard } from "@/features/market-dashboard/hooks/use-market-dashboard";
import { getTerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { DashboardCorePayload } from "@/lib/api/dashboard-server";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";
import "./dashboard-terminal.css";
import "./dashboard-premium.css";

export function MarketDashboardView({ initialCore = null, locale = DEFAULT_LOCALE }: {
  initialCore?: DashboardCorePayload | null;
  locale?: AppLocale;
}) {
  const copy = getTerminalCopy(locale);
  const { model, freshness, freshnessLoading, isError, sectionLoading, timelineError, insightsError, signalsSectionError, signalsSectionWarmingUp, signalsPublication } = useMarketDashboard({
    initialCore, locale,
  });
  const coreLoading = sectionLoading.pulseCore || freshnessLoading;

  return (
    <div className="market-dashboard-view sw-dashboard" lang={locale}>
      {initialCore ? <DashboardSsrHydrationGuard initialCore={initialCore} /> : null}
      <MarketDashboardHeader locale={locale} />
      <MarketOverview model={model} copy={copy} locale={locale} freshness={freshness}
        loading={coreLoading} leadersLoading={sectionLoading.leaders} />
      {isError ? <p className="sw-state sw-warning" role="status">{copy.serviceError}</p> : null}
      <InsightSidebar copy={copy} insights={model.insights.filter((insight) => insight.id === "market-mood" || insight.id === "turnover-context")}
        model={model} locale={locale}
        loading={coreLoading || sectionLoading.insights} error={insightsError} intraday={model.session.state === "OPEN"} />
      <div className="sw-market-grid">
        <InstitutionalHeatmap copy={copy} tiles={model.heatmapTiles} locale={locale} loading={coreLoading || sectionLoading.heatmap} />
        <TerminalMovers copy={copy} movers={model.movers} loading={coreLoading || sectionLoading.movers} />
      </div>
      <div className="sw-session-grid">
      <SmartSignalFeed decision={signalsPublication} locale={locale} signals={model.signals}
        loading={coreLoading || sectionLoading.signals} warmingUp={signalsSectionWarmingUp} error={signalsSectionError} />
      <MarketTimeline copy={copy} items={model.timeline} loading={coreLoading || sectionLoading.timeline} error={timelineError} />
      </div>
    </div>
  );
}
