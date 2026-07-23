"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { StockCandlestickChart } from "@/components/charts/stock-candlestick-chart";
import { BreakoutAnalysisCard } from "@/features/stock-workspace/components/breakout-analysis-card";
import { CompanySnapshotStrip } from "@/features/stock-workspace/components/company-snapshot-strip";
import { DecisionScoresPanel } from "@/features/stock-workspace/components/decision-scores-panel";
import { EventTimelinePanel } from "@/features/stock-workspace/components/event-timeline-panel";
import { FundamentalsPanel } from "@/features/stock-workspace/components/fundamentals-panel";
import { OwnershipInsightsPanel } from "@/features/stock-workspace/components/ownership-valuation-panels";
import { PricePositionPanel } from "@/features/stock-workspace/components/price-position-panel";
import { SectorIntelligenceCard } from "@/features/stock-workspace/components/sector-intelligence-card";
import { RelatedStocksSection } from "@/features/stock-workspace/components/related-stocks-section";
import { SmartWarningsPanel } from "@/features/stock-workspace/components/smart-warnings-panel";
import { StockResearchSection } from "@/features/stock-workspace/components/stock-research-section";
import { StockSectionNav } from "@/features/stock-workspace/components/stock-section-nav";
import { StockWorkspaceHeader } from "@/features/stock-workspace/components/stock-workspace-header";
import { TechnicalSummaryPanel } from "@/features/stock-workspace/components/technical-summary-panel";
import { TradePlanPanel } from "@/features/stock-workspace/components/trade-plan-panel";
import { TraderDecisionCard } from "@/features/stock-workspace/components/trader-decision-card";
import { useRelatedStocks } from "@/features/stock-workspace/hooks/use-related-stocks";
import { useSectorContext } from "@/features/stock-workspace/hooks/use-sector-context";
import { useStockSectionNav } from "@/features/stock-workspace/hooks/use-stock-section-nav";
import { useStockWorkspace } from "@/features/stock-workspace/hooks/use-stock-workspace";
import { STOCK_SECTION_DEFINITIONS, type StockSectionId } from "@/features/stock-workspace/types/stock-section-types";
import {
  getStockSectionDefinitions,
  getStockWorkspaceLanguage,
  localizeCompanySnapshotLabel,
  localizeRelatedStocksCta,
  localizeRelatedStocksGroupTitle,
} from "@/features/stock-workspace/stock-workspace-language";
import { buildCompanySnapshotStrip } from "@/features/stock-workspace/view-models/company-snapshot-view-model";
import { buildSectorIntelligenceViewModel } from "@/features/stock-workspace/view-models/sector-context-view-model";
import { buildStockSemanticSummary } from "@/features/stock-workspace/view-models/stock-semantic-summary-view-model";
import { frontendConfig } from "@/lib/frontend-config";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { DashboardLocaleSwitcher } from "@/features/market-dashboard/components/dashboard-locale-switcher";

type StockDetailWorkspaceViewProps = {
  exchange: ExchangeCode;
  symbol: string;
  initialWorkspace?: StockWorkspaceDto | null;
  locale?: AppLocale;
};

function resolveEnabledSections(decisionAvailable: boolean, hasOwnership: boolean, hasEvents: boolean): StockSectionId[] {
  const sections: StockSectionId[] = ["overview", "technicals", "fundamentals"];

  if (decisionAvailable && hasOwnership) {
    sections.push("ownership");
  }

  if (decisionAvailable && hasEvents) {
    sections.push("events");
  }

  sections.push("related");
  return sections;
}

export function StockDetailWorkspaceView({
  exchange,
  symbol,
  initialWorkspace = null,
  locale = DEFAULT_LOCALE,
}: StockDetailWorkspaceViewProps) {
  const language = getStockWorkspaceLanguage(locale);
  const [relatedLoadEnabled, setRelatedLoadEnabled] = useState(false);
  const [sectorContextEnabled, setSectorContextEnabled] = useState(false);

  const sectorContextQuery = useSectorContext({
    exchange,
    symbol,
    enabled: sectorContextEnabled,
  });

  const {
    model,
    decisionModel,
    fundamentalsModel,
    decisionRaw,
    displayMetrics,
    isError,
    isLoading,
    isDecisionLoading,
    isDecisionError,
    isNotFound,
  } = useStockWorkspace({
    exchange,
    symbol,
    sectorContext: sectorContextQuery.sectorContext,
    initialWorkspace,
    locale,
  });
  const intelligence = model.intelligence;
  const chartSupport = decisionModel.available ? decisionModel.support : intelligence?.support;
  const chartResistance = decisionModel.available ? decisionModel.resistance : intelligence?.resistance;

  const enableSectorContext = useCallback(() => {
    setSectorContextEnabled(true);
  }, []);

  const hasOwnership = Boolean(decisionModel.available && decisionModel.ownership);
  const hasEvents = Boolean(decisionModel.available && decisionModel.events.length > 0);

  const enabledSectionIds = useMemo(
    () => resolveEnabledSections(decisionModel.available, hasOwnership, hasEvents),
    [decisionModel.available, hasEvents, hasOwnership],
  );

  const visibleSections = useMemo(() => {
    const definitions = locale === "en" ? STOCK_SECTION_DEFINITIONS : getStockSectionDefinitions(locale);
    return definitions.filter((section) => enabledSectionIds.includes(section.id));
  }, [enabledSectionIds, locale]);

  const { activeSection, scrollToSection } = useStockSectionNav({ enabledSectionIds });

  const requestRelatedLoad = useCallback(() => {
    setRelatedLoadEnabled(true);
    enableSectorContext();
  }, [enableSectorContext]);

  const handleNavigate = useCallback(
    (sectionId: StockSectionId) => {
      if (sectionId === "related" || sectionId === "fundamentals") {
        requestRelatedLoad();
        if (sectionId === "fundamentals") {
          enableSectorContext();
        }
      }
      scrollToSection(sectionId);
    },
    [enableSectorContext, requestRelatedLoad, scrollToSection],
  );

  const relatedStocks = useRelatedStocks({
    exchange,
    currentStock: intelligence,
    sectorLabel: model.header.sector,
    enabled: relatedLoadEnabled,
  });

  const sectorIntelligence = useMemo(
    () => buildSectorIntelligenceViewModel(sectorContextQuery.sectorContext),
    [sectorContextQuery.sectorContext],
  );

  useEffect(() => {
    const section = document.getElementById("fundamentals");
    if (!section) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          enableSectorContext();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [enableSectorContext]);

  const companySnapshotCells = useMemo(() => {
    const cells = buildCompanySnapshotStrip(model, decisionModel, displayMetrics);
    if (locale === "en") {
      return cells;
    }

    return cells.map((cell) => ({
      ...cell,
      label: localizeCompanySnapshotLabel(cell.key, locale) ?? cell.label,
    }));
  }, [decisionModel, displayMetrics, locale, model]);

  const localizedRelatedGroups = useMemo(
    () =>
      relatedStocks.groups.map((group) => ({
        ...group,
        title: localizeRelatedStocksGroupTitle(group.id, locale),
      })),
    [locale, relatedStocks.groups],
  );

  const localizedRelatedCta = useMemo(() => {
    const sectorPeers = relatedStocks.groups.find((group) => group.id === "sector-peers");
    return localizeRelatedStocksCta(model.header.sector, Boolean(sectorPeers?.items.length), locale);
  }, [locale, model.header.sector, relatedStocks.groups]);
  const semanticSummary = useMemo(() => buildStockSemanticSummary(model, decisionModel), [decisionModel, model]);

  if (isLoading) {
    return (
      <div className="stock-workspace-view stock-workspace-view-v2 trader-workspace-fade-in" data-testid="stock-workspace-loading">
        <MarketActivityLoader label={language.states.loading} />
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="stock-workspace-view stock-workspace-view-v2 trader-workspace-fade-in" data-testid="stock-workspace-not-found">
        <div className="data-warning">{language.states.notFound(symbol)}</div>
      </div>
    );
  }

  return (
    <div className="stock-workspace-view stock-workspace-view-v2 trader-workspace-fade-in" data-testid="stock-workspace-loaded">
      {isError ? <div className="data-warning">{language.states.workspaceError(symbol)}</div> : null}
      {isDecisionError ? <div className="data-warning">{language.states.decisionError}</div> : null}
      <div className="trader-workspace-topbar stock-workspace-topbar">
        <StockWorkspaceHeader copy={language.header} decision={decisionModel} model={model} stockId={model.intelligence?.stock.id} />
        <div className="stock-workspace-topbar-status-row">
          <MarketDataFreshnessBar locale={locale} variant="status" />
          <div aria-label={language.localeSwitcherAria} className="explorer-hero-locale-switcher">
            <DashboardLocaleSwitcher locale={locale} />
          </div>
        </div>
        <div className="stock-workspace-topbar-search">
          <WorkspaceCommandSearch filterContextName="stocks" showQuickActions={false} variant="discovery" />
        </div>
      </div>

      <StockSectionNav activeSection={activeSection} copy={language.nav} onNavigate={handleNavigate} sections={visibleSections} />
      <CompanySnapshotStrip ariaLabel={language.companySnapshot.ariaLabel} cells={companySnapshotCells} />

      <p className="sr-only">{semanticSummary}</p>

      <div className="trader-workspace-layout">
        <aside className="trader-decision-rail">
          <TraderDecisionCard copy={language.decision} decision={decisionModel} />
          <DecisionScoresPanel copy={language.decision} decision={decisionModel} />
          {isDecisionLoading ? <div className="data-warning data-warning-compact">{language.states.decisionUpdating}</div> : null}
        </aside>
        <main className="trader-workspace-main">
          <StockResearchSection id="overview">
            <section className="chart-hero-card chart-hero-card-compact">
              <StockCandlestickChart
                candles={intelligence?.candles ?? []}
                ema20={intelligence?.ema20}
                overlaysEnabled={frontendConfig.features.advancedChartOverlays}
                patterns={decisionRaw?.patterns ?? []}
                resistance={chartResistance}
                riskLabel={decisionModel.riskLabel}
                sma20={intelligence?.sma20}
                support={chartSupport}
                volumeBars={intelligence?.volumeBars ?? []}
                chartCopy={language.chart}
                patternCopy={language.pattern}
              />
            </section>
          </StockResearchSection>

          <StockResearchSection divided id="technicals" showHeader title={language.sections.technicals.label}>
            <BreakoutAnalysisCard copy={language.panels} decision={decisionModel} />
            <PricePositionPanel copy={language.panels} decision={decisionModel} />
            <TradePlanPanel copy={language.panels} decision={decisionModel} />
            <SmartWarningsPanel copy={language.panels} decision={decisionModel} />
            <TechnicalSummaryPanel copy={language.technicalSummary} model={model} />
          </StockResearchSection>

          <StockResearchSection divided id="fundamentals" showHeader title={language.sections.fundamentals.label}>
            <FundamentalsPanel columnCopy={language.panels} copy={language.fundamentals} fundamentals={fundamentalsModel} />
          </StockResearchSection>

          <StockResearchSection divided hidden={!hasOwnership} id="ownership" showHeader title={language.sections.ownership.label}>
            <OwnershipInsightsPanel copy={language.panels} decision={decisionModel} />
          </StockResearchSection>

          <StockResearchSection divided hidden={!hasEvents} id="events" showHeader title={language.sections.events.label}>
            <EventTimelinePanel copy={language.panels} decision={decisionModel} />
          </StockResearchSection>

          <StockResearchSection divided id="related">
            {sectorContextEnabled && sectorIntelligence ? (
              <>
                <h2 className="stock-research-subsection-heading">{language.subsections.sectorIntelligence}</h2>
                <SectorIntelligenceCard copy={language.sector} sector={sectorIntelligence} />
              </>
            ) : null}
            {sectorContextEnabled && sectorContextQuery.isError ? (
              <div className="data-warning data-warning-compact">{language.states.sectorContextError}</div>
            ) : null}
            <h2 className="stock-research-subsection-heading stock-research-subsection-heading-spaced">
              {language.subsections.relatedStocks}
            </h2>
            <RelatedStocksSection
              copy={language.relatedStocks}
              cta={localizedRelatedCta}
              groups={localizedRelatedGroups}
              hasResults={relatedStocks.hasResults}
              isError={relatedStocks.isError}
              isLoading={relatedStocks.isLoading}
              isWarmingUp={relatedStocks.isWarmingUp}
              loadEnabled={relatedLoadEnabled}
              onRequestLoad={requestRelatedLoad}
            />
          </StockResearchSection>
        </main>

      </div>
    </div>
  );
}
