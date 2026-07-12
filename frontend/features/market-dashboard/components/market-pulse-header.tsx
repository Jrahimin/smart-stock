"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowUpDown, Banknote, BarChart3, Trophy, type LucideIcon } from "lucide-react";

import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { DashboardGuideLauncher } from "@/features/guide/components/dashboard-guide-launcher";
import { DashboardLocaleSwitcher } from "@/features/market-dashboard/components/dashboard-locale-switcher";
import { MarketPulseLeadersSkeleton } from "@/features/market-dashboard/components/dashboard-skeletons";
import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";
import type { PulseTone } from "@/lib/market/market-pulse-metrics";
import type { AppLocale } from "@/lib/locale/app-locale";

export function MarketDashboardHeader({ locale }: { locale: AppLocale }) {
  return (
    <header className="market-dashboard-header" data-guide="dashboard-header">
      <Image
        alt="Stock Intelligence"
        className="market-pulse-logo"
        height={40}
        priority
        src="/stock-icon-wide.png"
        width={160}
      />
      <div className="market-dashboard-header-tools">
        <WorkspaceCommandSearch filterContextName="market dashboard" showQuickActions={false} variant="discovery" />
        <MarketDataFreshnessBar locale={locale} variant="inline" />
        <DashboardLocaleSwitcher locale={locale} />
        <DashboardGuideLauncher locale={locale} />
      </div>
    </header>
  );
}

type MarketPulsePanelProps = {
  model: MarketDashboardModel;
  copy: DashboardLanguage["pulse"];
  leadersLoading?: boolean;
};

export function MarketPulsePanel({ model, copy, leadersLoading = false }: MarketPulsePanelProps) {
  const { pulse } = model;
  const indexArrow = pulse.indexTone === "positive" ? "▲" : pulse.indexTone === "negative" ? "▼" : "•";

  const tickerItems = [
    `${pulse.indexName} ${indexArrow} ${pulse.indexChangeLabel}`,
    pulse.marketStatus ? `${copy.marketPrefix} ${pulse.marketStatus}` : null,
    `${pulse.turnoverContext.insight} · ${pulse.turnoverLabel}`,
    `${pulse.volumeContext.insight} · ${pulse.volumeLabel}`,
    pulse.breadthContext.insight,
    pulse.leadersContext.rows[0] ? `${copy.leaderPrefix}: ${pulse.leadersContext.rows[0].name}` : null,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-label={copy.ariaLabel}
      className="market-pulse-panel"
      data-guide="market-pulse"
      data-guide-ready="true"
    >
      <div className="market-pulse-card">
        <div aria-label={copy.performanceAriaLabel} className="market-pulse-strip" role="list">
          <DsexStripCell copy={copy} indexArrow={indexArrow} pulse={pulse} />
          <TurnoverWidgetCard context={pulse.turnoverContext} copy={copy} footer={pulse.turnoverHelper} />
          <VolumeWidgetCard context={pulse.volumeContext} copy={copy} footer={pulse.volumeHelper} />
          <BreadthWidgetCard context={pulse.breadthContext} copy={copy} />
          {leadersLoading ? (
            <MarketPulseLeadersSkeleton />
          ) : (
            <LeadersWidgetCard context={pulse.leadersContext} copy={copy} />
          )}
        </div>
      </div>

      <div className="market-pulse-ticker" aria-hidden="true">
        <div className="market-pulse-ticker-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <span className="market-pulse-ticker-item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

type DsexStripCellProps = {
  pulse: MarketDashboardModel["pulse"];
  indexArrow: string;
  copy: DashboardLanguage["pulse"];
};

function DsexStripCell({ pulse, indexArrow, copy }: DsexStripCellProps) {
  return (
    <div className={`market-pulse-dsex market-pulse-dsex-balanced market-pulse-dsex-${pulse.indexTone}`} role="listitem">
      <div className="market-pulse-dsex-hero">
        <div className="market-pulse-dsex-head">
          <div className="market-pulse-dsex-title">
            <span className="market-pulse-metric-label">{pulse.indexName}</span>
            {pulse.marketStatus ? <span className="market-pulse-dsex-status">{pulse.marketStatus}</span> : null}
          </div>
          <div className="market-pulse-dsex-quote">
            <strong className="market-pulse-dsex-value">{pulse.indexAvailable ? pulse.indexValue : copy.awaitingIndex}</strong>
            {pulse.indexAvailable ? (
              <span className={`market-pulse-dsex-move market-pulse-dsex-move-${pulse.indexTone}`}>
                {indexArrow} {pulse.indexChangeLabel}
              </span>
            ) : null}
          </div>
        </div>

        {pulse.indexDayStats ? (
          <div className="market-pulse-dsex-ohlc">
            <OhlcStat label={copy.dayOpen} tone="positive" value={pulse.indexDayStats.open} />
            <OhlcStat label={copy.dayHigh} tone="positive" value={pulse.indexDayStats.high} />
            <OhlcStat label={copy.dayLow} tone="negative" value={pulse.indexDayStats.low} />
          </div>
        ) : null}
      </div>

      <div className="market-pulse-dsex-detail">
        <div aria-hidden="true" className="pulse-widget-divider" />

        {pulse.indexAvailable ? (
          <div className="pulse-dsex-performance-row">
            <PerformancePill label="1M" value={pulse.indexPerformance.oneMonth} />
            <PerformancePill label="6M" value={pulse.indexPerformance.sixMonth} />
            <PerformancePill label="1Y" value={pulse.indexPerformance.oneYear} />
          </div>
        ) : null}

        {pulse.indexRange ? (
          <div className="market-pulse-dsex-range">
            <div className="market-pulse-range-head">
              <span>{copy.weekRange}</span>
              <span>
                {pulse.indexRange.lowLabel} - {pulse.indexRange.highLabel}
              </span>
            </div>
            <div className="market-pulse-range-track">
              <div className="market-pulse-range-marker" style={{ left: `${pulse.indexRange.positionPercent}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function performanceTone(value: string): "positive" | "negative" | "neutral" {
  if (value === "N/A" || value === "—") {
    return "neutral";
  }

  const numeric = Number.parseFloat(value.replace("%", "").replace("+", ""));
  if (Number.isNaN(numeric) || numeric === 0) {
    return "neutral";
  }

  return numeric > 0 ? "positive" : "negative";
}

function PerformancePill({ label, value }: { label: string; value: string }) {
  const tone = performanceTone(value);

  return (
    <div className={`pulse-dsex-performance-pill pulse-dsex-performance-pill-${tone}`}>
      <span className="pulse-dsex-performance-pill-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OhlcStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  return (
    <div className="market-pulse-dsex-ohlc-item">
      <span>{label}</span>
      <strong className={`market-pulse-dsex-ohlc-${tone}`}>{value}</strong>
    </div>
  );
}

type WidgetShellProps = {
  category: string;
  icon: LucideIcon;
  iconTone: "turnover" | "volume" | "breadth" | "leaders";
  children: ReactNode;
  balanced?: boolean;
};

function WidgetShell({ category, icon: Icon, iconTone, children, balanced = false }: WidgetShellProps) {
  return (
    <div className="pulse-widget" role="listitem">
      <div className="pulse-widget-top">
        <span className="pulse-widget-category">{category}</span>
        <div className={`pulse-widget-icon pulse-widget-icon-${iconTone}`}>
          <Icon aria-hidden="true" size={16} strokeWidth={2.15} />
        </div>
      </div>
      <div className={`pulse-widget-body${balanced ? " pulse-widget-body-balanced" : ""}`}>{children}</div>
    </div>
  );
}

function WidgetInsight({ children, tone = "neutral" }: { children: string; tone?: PulseTone }) {
  return <p className={`pulse-widget-insight pulse-widget-insight-${tone}`}>{children}</p>;
}

function WidgetPrimary({ children, tone = "info" }: { children: string; tone?: PulseTone }) {
  return <strong className={`pulse-widget-primary pulse-widget-primary-${tone}`}>{children}</strong>;
}

function WidgetDivider() {
  return <div aria-hidden="true" className="pulse-widget-divider" />;
}

function ActivityMeter({ percent, tone = "info" }: { percent: number; tone?: PulseTone }) {
  return (
    <div className="pulse-widget-meter-track">
      <div className={`pulse-widget-meter-fill pulse-widget-meter-fill-${tone}`} style={{ width: `${percent}%` }} />
      <div className="pulse-widget-meter-marker" style={{ left: `${percent}%` }} />
    </div>
  );
}

function LabeledMeter({
  label,
  percent,
  tone = "info",
  scaleMin = "0.5x",
  scaleMax = "2.0x",
}: {
  label: string;
  percent: number;
  tone?: PulseTone;
  scaleMin?: string;
  scaleMax?: string;
}) {
  return (
    <div className="pulse-widget-labeled-meter">
      <div className="pulse-widget-meter-head">
        <span>{label}</span>
        <span className="pulse-widget-meter-scale">
          {scaleMin} — {scaleMax}
        </span>
      </div>
      <ActivityMeter percent={percent} tone={tone} />
    </div>
  );
}

function StatusChip({ children, tone = "neutral" }: { children: string; tone?: PulseTone }) {
  return <span className={`pulse-widget-status-chip pulse-widget-status-chip-${tone}`}>{children}</span>;
}

function ContextPill({ label, value, tone = "neutral" }: { label: string; value: string; tone?: PulseTone }) {
  return (
    <div className="pulse-widget-pill">
      <span>{label}</span>
      <strong className={`pulse-widget-pill-value pulse-widget-pill-value-${tone}`}>{value}</strong>
    </div>
  );
}

function WidgetFooter({ children }: { children: string }) {
  return <p className="pulse-widget-footer">{children}</p>;
}

function TurnoverWidgetCard({
  context,
  footer,
  copy,
}: {
  context: MarketDashboardModel["pulse"]["turnoverContext"];
  footer: string;
  copy: DashboardLanguage["pulse"];
}) {
  return (
    <WidgetShell category={copy.turnoverCategory} icon={Banknote} iconTone="turnover">
      <WidgetInsight tone={context.insightTone}>{context.insight}</WidgetInsight>
      <WidgetPrimary tone="info">{context.primaryValue}</WidgetPrimary>
      <WidgetDivider />
      <div className="pulse-widget-context-row">
        <ContextPill label={copy.vsYesterday} tone={context.vsYesterdayTone} value={context.vsYesterday} />
        <ContextPill label={copy.vs30DayAvg} tone="neutral" value={context.vs30DayAvg} />
      </div>
      <div className="pulse-widget-anchor">
        <LabeledMeter
          label={copy.liquidityVs30D}
          percent={context.activityMeterPercent}
          tone={context.insightTone === "neutral" ? "info" : context.insightTone}
        />
        <WidgetFooter>{footer}</WidgetFooter>
      </div>
    </WidgetShell>
  );
}

function VolumeWidgetCard({
  context,
  footer,
  copy,
}: {
  context: MarketDashboardModel["pulse"]["volumeContext"];
  footer: string;
  copy: DashboardLanguage["pulse"];
}) {
  const meterTone = context.insightTone === "neutral" ? "info" : context.insightTone;

  return (
    <WidgetShell balanced category={copy.volumeCategory} icon={BarChart3} iconTone="volume">
      <div className="pulse-widget-hero-block pulse-widget-hero-emphasis">
        <StatusChip tone={context.insightTone}>{context.insight}</StatusChip>
        <WidgetPrimary tone="info">{context.primaryValue}</WidgetPrimary>
      </div>
      <div className="pulse-widget-detail-block">
        <WidgetDivider />
        <div className="pulse-widget-context-row">
          <ContextPill label={copy.typical30D} tone="neutral" value={context.typicalVolume} />
          <ContextPill label={copy.vs30DayAvg} tone={context.insightTone} value={context.ratioVsAvg} />
        </div>
        <LabeledMeter label={copy.participationStrength} percent={context.participationMeterPercent} tone={meterTone} />
        <WidgetFooter>{footer}</WidgetFooter>
      </div>
    </WidgetShell>
  );
}

function BreadthStatChip({
  label,
  count,
  percent,
  tone,
}: {
  label: string;
  count: number;
  percent: number;
  tone: "positive" | "negative" | "neutral";
}) {
  return (
    <div className={`pulse-widget-breadth-chip pulse-widget-breadth-chip-${tone}`}>
      <span className="pulse-widget-breadth-chip-label">{label}</span>
      <strong>{count}</strong>
      <span className="pulse-widget-breadth-chip-percent">{percent.toFixed(1)}%</span>
    </div>
  );
}

function BreadthWidgetCard({
  context,
  copy,
}: {
  context: MarketDashboardModel["pulse"]["breadthContext"];
  copy: DashboardLanguage["pulse"];
}) {
  return (
    <WidgetShell balanced category={copy.breadthCategory} icon={ArrowUpDown} iconTone="breadth">
      <div className="pulse-widget-hero-block pulse-widget-hero-emphasis">
        <WidgetInsight tone={context.insightTone}>{context.insight}</WidgetInsight>
        <WidgetPrimary tone={context.ratioTone}>{context.ratioLabel}</WidgetPrimary>
      </div>
      <div className="pulse-widget-detail-block">
        <WidgetDivider />
        <div className="pulse-widget-viz-label">{copy.advDeclRatio}</div>
        <div className="pulse-breadth-bar pulse-breadth-bar-tall" aria-hidden="true">
          <span className="pulse-breadth-segment pulse-breadth-segment-adv" style={{ width: `${context.advancingPercent}%` }} />
          <span className="pulse-breadth-segment pulse-breadth-segment-unch" style={{ width: `${context.unchangedPercent}%` }} />
          <span className="pulse-breadth-segment pulse-breadth-segment-decl" style={{ width: `${context.decliningPercent}%` }} />
        </div>
        <div className="pulse-widget-breadth-chips">
          <BreadthStatChip count={context.advancing} label={copy.adv} percent={context.advancingPercent} tone="positive" />
          <BreadthStatChip count={context.unchanged} label={copy.unch} percent={context.unchangedPercent} tone="neutral" />
          <BreadthStatChip count={context.declining} label={copy.decl} percent={context.decliningPercent} tone="negative" />
        </div>
        <WidgetFooter>{context.footer}</WidgetFooter>
      </div>
    </WidgetShell>
  );
}

function LeadersWidgetCard({
  context,
  copy,
}: {
  context: MarketDashboardModel["pulse"]["leadersContext"];
  copy: DashboardLanguage["pulse"];
}) {
  return (
    <WidgetShell balanced category={copy.leadersCategory} icon={Trophy} iconTone="leaders">
      <div className="pulse-widget-leaders-rows">
        {context.rows.map((row) => (
          <div className="pulse-leader-row" key={row.label}>
            <span className="pulse-leader-row-label">{row.label}</span>
            <strong className="pulse-leader-row-name">{row.name}</strong>
            <span className={`pulse-leader-row-badge pulse-leader-row-badge-${row.performanceTone}`}>{row.performanceBadge}</span>
          </div>
        ))}
      </div>
      <WidgetFooter>{context.footer}</WidgetFooter>
    </WidgetShell>
  );
}
