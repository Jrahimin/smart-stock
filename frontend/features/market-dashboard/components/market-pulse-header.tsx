"use client";

import Image from "next/image";

import { DataQualityBadge } from "@/components/ui/data-quality-badge";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { buildMarketFreshnessViewModel, useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";

type MarketDashboardToolbarProps = {
  model: MarketDashboardModel;
};

export function MarketDashboardToolbar({ model }: MarketDashboardToolbarProps) {
  const { pulse, session, dataQuality } = model;
  const { data: freshness, isLoading, isError } = useMarketDataFreshness("DSE");
  const freshnessModel = buildMarketFreshnessViewModel(freshness, isLoading, isError);

  return (
    <div className="market-pulse-toolbar">
      <Image
        alt="Stock Intelligence"
        className="market-pulse-logo"
        height={40}
        priority
        src="/stock-icon-wide.png"
        width={160}
      />
      <div className="market-pulse-utility" aria-label="System status">
        <span className="market-pulse-utility-pill" title={session.description}>
          Session: {session.label}
        </span>
        <span className="market-pulse-utility-pill">As of {pulse.latestTradeDate}</span>
        {freshnessModel.lastUpdatedLabel ? (
          <span className="market-pulse-utility-pill" title={freshnessModel.freshnessLabel ?? undefined}>
            Snapshot {freshnessModel.lastUpdatedLabel}
          </span>
        ) : null}
        <span className="market-pulse-utility-pill">
          {session.shouldPoll && session.pollingIntervalMs
            ? `Refreshing every ${Math.round(session.pollingIntervalMs / 60_000)} min`
            : "Manual refresh"}
        </span>
        {session.disablesFreshDataActions ? (
          <span className="market-pulse-utility-pill market-pulse-utility-pill-warning">Refresh guarded</span>
        ) : null}
        <DataQualityBadge quality={dataQuality} />
      </div>
    </div>
  );
}

type MarketPulsePanelProps = {
  model: MarketDashboardModel;
};

export function MarketPulsePanel({ model }: MarketPulsePanelProps) {
  const { pulse } = model;
  const indexArrow = pulse.indexTone === "positive" ? "▲" : pulse.indexTone === "negative" ? "▼" : "•";

  const tickerItems = [
    `${pulse.indexName} ${indexArrow} ${pulse.indexChangeLabel}`,
    pulse.marketStatus ? `Market ${pulse.marketStatus}` : null,
    `Turnover ${pulse.turnoverLabel}`,
    `Volume ${pulse.volumeLabel}`,
    `${pulse.breadthAdvancing} Advancing`,
    `${pulse.breadthDeclining} Declining`,
    pulse.leadingSector ? `Top Sector: ${pulse.leadingSector.label}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="market-pulse-panel" aria-label="Market pulse">
      <div className="market-pulse-card">
        <div className="market-pulse-strip" role="list" aria-label="Market performance">
          <DsexStripCell indexArrow={indexArrow} pulse={pulse} />
          <PulseMetric helper={pulse.turnoverHelper} label="Turnover" tone="info" value={pulse.turnoverLabel} />
          <PulseMetric helper={pulse.volumeHelper} label="Volume" tone="info" value={pulse.volumeLabel} />
          <PulseMetric
            helper={`${pulse.marketDirectionLabel} · ${pulse.breadthAdvancing} advancing · ${pulse.breadthDeclining} declining · ${model.breadth.unchanged} unchanged`}
            label="Breadth"
            tone={pulse.breadthAdvancing >= pulse.breadthDeclining ? "positive" : "negative"}
            value={pulse.breadthLabel}
          />
          <PulseMetric
            helper={pulse.leadingSector ? "Strongest sector today" : "Need broader sector coverage"}
            label="Leaders"
            tone={pulse.leadingSector && pulse.leadingSector.changePercent > 0 ? "positive" : "neutral"}
            value={pulse.leadingSector?.label ?? "N/A"}
          />
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
};

function DsexStripCell({ pulse, indexArrow }: DsexStripCellProps) {
  return (
    <div className={`market-pulse-dsex market-pulse-dsex-${pulse.indexTone}`} role="listitem">
      <div className="market-pulse-dsex-head">
        <div className="market-pulse-dsex-title">
          <span className="market-pulse-metric-label">{pulse.indexName}</span>
          {pulse.marketStatus ? <span className="market-pulse-dsex-status">{pulse.marketStatus}</span> : null}
        </div>
        <div className="market-pulse-dsex-quote">
          <strong className="market-pulse-dsex-value">{pulse.indexAvailable ? pulse.indexValue : "Awaiting index data"}</strong>
          {pulse.indexAvailable ? (
            <span className={`market-pulse-dsex-move market-pulse-dsex-move-${pulse.indexTone}`}>
              {indexArrow} {pulse.indexChangeLabel}
            </span>
          ) : null}
        </div>
      </div>

      {pulse.indexDayStats ? (
        <div className="market-pulse-dsex-ohlc">
          <OhlcStat label="Day Open" tone="positive" value={pulse.indexDayStats.open} />
          <OhlcStat label="Day High" tone="positive" value={pulse.indexDayStats.high} />
          <OhlcStat label="Day Low" tone="negative" value={pulse.indexDayStats.low} />
        </div>
      ) : null}

      {pulse.indexRange ? (
        <div className="market-pulse-dsex-range">
          <div className="market-pulse-range-head">
            <span>52 Week Range</span>
            <span>
              {pulse.indexRange.lowLabel} - {pulse.indexRange.highLabel}
            </span>
          </div>
          <div className="market-pulse-range-track">
            <div className="market-pulse-range-marker" style={{ left: `${pulse.indexRange.positionPercent}%` }} />
          </div>
        </div>
      ) : null}

      {pulse.indexAvailable ? (
        <div className="market-pulse-dsex-returns">
          <span>
            1M <strong>{pulse.indexPerformance.oneMonth}</strong>
          </span>
          <span>
            6M <strong>{pulse.indexPerformance.sixMonth}</strong>
          </span>
          <span>
            1Y <strong>{pulse.indexPerformance.oneYear}</strong>
          </span>
        </div>
      ) : null}
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

type PulseMetricProps = {
  label: string;
  value: string;
  helper: string;
  tone: "positive" | "negative" | "neutral" | "warning" | "info";
};

function PulseMetric({ label, value, helper, tone }: PulseMetricProps) {
  return (
    <div className="market-pulse-metric" role="listitem">
      <span className="market-pulse-metric-label">{label}</span>
      <strong className={`market-pulse-metric-value market-pulse-metric-value-${tone}`}>{value}</strong>
      <span className="market-pulse-metric-helper">{helper}</span>
    </div>
  );
}
