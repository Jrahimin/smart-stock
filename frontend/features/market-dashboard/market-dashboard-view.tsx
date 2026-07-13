"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { DashboardSsrHydrationGuard } from "@/features/market-dashboard/components/dashboard-ssr-hydration-guard";
import { MarketBreadthPanel } from "@/features/market-dashboard/components/market-breadth-panel";
import {
  InsightSidebarSkeleton,
  InstitutionalHeatmapSkeleton,
  MarketBreadthPanelSkeleton,
  MarketMoversPanelSkeleton,
  MarketPulseCoreSkeleton,
  MarketTimelineSkeleton,
  SmartSignalFeedSkeleton,
} from "@/features/market-dashboard/components/dashboard-skeletons";
import { MarketMoversPanel } from "@/features/market-dashboard/components/market-movers-panel";
import { MarketDashboardHeader, MarketPulsePanel } from "@/features/market-dashboard/components/market-pulse-header";
import { MarketTimeline } from "@/features/market-dashboard/components/market-timeline";
import { SmartSignalFeed } from "@/features/market-dashboard/components/smart-signal-feed";
import { useMarketDashboard } from "@/features/market-dashboard/hooks/use-market-dashboard";
import type { DashboardCorePayload } from "@/lib/api/dashboard-server";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type MarketDashboardViewProps = {
  initialCore?: DashboardCorePayload | null;
  locale?: AppLocale;
};

export function MarketDashboardView({ initialCore = null, locale = DEFAULT_LOCALE }: MarketDashboardViewProps) {
  const language = getDashboardLanguage(locale);
  const { model, isError, sectionLoading, signalsSectionError } = useMarketDashboard({
    initialCore,
    locale,
  });

  const InstitutionalHeatmap = useMemo(
    () =>
      dynamic(
        () =>
          import("@/features/market-dashboard/components/institutional-heatmap").then((module) => ({
            default: module.InstitutionalHeatmap,
          })),
        {
          loading: () => (
            <InstitutionalHeatmapSkeleton eyebrow={language.heatmap.eyebrow} title={language.heatmap.title} />
          ),
        },
      ),
    [language.heatmap.eyebrow, language.heatmap.title],
  );

  const InsightSidebar = useMemo(
    () =>
      dynamic(
        () =>
          import("@/features/market-dashboard/components/insight-sidebar").then((module) => ({
            default: module.InsightSidebar,
          })),
        {
          loading: () => (
            <InsightSidebarSkeleton eyebrow={language.insights.eyebrow} title={language.insights.title} />
          ),
        },
      ),
    [language.insights.eyebrow, language.insights.title],
  );

  const breadthCopy = {
    eyebrow: language.breadthPanel.eyebrow,
    title: language.breadthPanel.title,
    advancing: language.breadthPanel.advancing(model.breadth.advancing),
    declining: language.breadthPanel.declining(model.breadth.declining),
    unchanged: language.breadthPanel.unchanged(model.breadth.unchanged),
  };

  return (
    <div className="market-dashboard-view">
      {initialCore ? <DashboardSsrHydrationGuard initialCore={initialCore} /> : null}
      <MarketDashboardHeader locale={locale} />
      {sectionLoading.pulseCore ? (
        <MarketPulseCoreSkeleton copy={language.skeletons} leadersLoading={sectionLoading.leaders} />
      ) : (
        <MarketPulsePanel
          copy={language.pulse}
          leadersLoading={sectionLoading.leaders}
          model={model}
        />
      )}
      {isError ? <div className="data-warning">{language.states.backendError}</div> : null}
      <div className="dashboard-workspace-grid">
        <div className="dashboard-primary-column">
          {sectionLoading.breadth ? (
            <MarketBreadthPanelSkeleton
              eyebrow={language.breadthPanel.eyebrow}
              title={language.breadthPanel.title}
            />
          ) : (
            <MarketBreadthPanel breadth={model.breadth} copy={breadthCopy} />
          )}
          {sectionLoading.heatmap ? (
            <InstitutionalHeatmapSkeleton eyebrow={language.heatmap.eyebrow} title={language.heatmap.title} />
          ) : (
            <InstitutionalHeatmap copy={language.heatmap} tiles={model.heatmapTiles} />
          )}
          <div className="movers-grid" data-guide="market-discovery">
            {sectionLoading.movers ? (
              <>
                <MarketMoversPanelSkeleton eyebrow={language.movers.eyebrow} title={language.movers.topGainers} />
                <MarketMoversPanelSkeleton
                  delayMs={80}
                  eyebrow={language.movers.eyebrow}
                  title={language.movers.topLosers}
                />
              </>
            ) : (
              <>
                <MarketMoversPanel
                  emptyText={language.movers.empty}
                  eyebrow={language.movers.eyebrow}
                  movers={model.movers.gainers}
                  title={language.movers.topGainers}
                  turnoverSuffix={language.movers.turnoverSuffix}
                />
                <MarketMoversPanel
                  emptyText={language.movers.empty}
                  eyebrow={language.movers.eyebrow}
                  movers={model.movers.losers}
                  title={language.movers.topLosers}
                  turnoverSuffix={language.movers.turnoverSuffix}
                />
              </>
            )}
          </div>
          {sectionLoading.timeline ? (
            <MarketTimelineSkeleton eyebrow={language.timeline.eyebrow} title={language.timeline.title} />
          ) : (
            <MarketTimeline copy={language.timeline} items={model.timeline} />
          )}
        </div>
        <div className="dashboard-secondary-column">
          {sectionLoading.signals ? (
            <SmartSignalFeedSkeleton eyebrow={language.signals.eyebrow} title={language.signals.title} />
          ) : signalsSectionError ? (
            <section className="workspace-card">
              <div className="section-heading">
                <p className="eyebrow">{language.signals.eyebrow}</p>
                <h2>{language.signals.title}</h2>
              </div>
              <div className="empty-state">{language.signals.warmup}</div>
            </section>
          ) : (
            <SmartSignalFeed copy={language.signals} signals={model.signals} />
          )}
        </div>
        <div className="dashboard-tertiary-column">
          {sectionLoading.insights ? (
            <InsightSidebarSkeleton eyebrow={language.insights.eyebrow} title={language.insights.title} />
          ) : (
            <InsightSidebar copy={language.insights} insights={model.insights} />
          )}
          {sectionLoading.movers ? (
            <MarketMoversPanelSkeleton
              delayMs={120}
              eyebrow={language.movers.turnoverLeaders}
              title={language.movers.liquidityWatch}
            />
          ) : (
            <MarketMoversPanel
              emptyText={language.movers.empty}
              eyebrow={language.movers.turnoverLeaders}
              movers={model.movers.turnoverLeaders}
              title={language.movers.liquidityWatch}
              turnoverSuffix={language.movers.turnoverSuffix}
            />
          )}
        </div>
      </div>
    </div>
  );
}
