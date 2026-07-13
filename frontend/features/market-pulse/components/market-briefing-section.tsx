"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Crosshair,
  Shield,
  TrendingDown,
  Zap,
} from "lucide-react";

import { MiniSparkline } from "@/features/market-pulse/components/pulse-score-badge";
import {
  MarketBriefingFooterSkeleton,
  MarketBriefingSectionSkeleton,
} from "@/features/market-pulse/components/pulse-briefing-skeleton";
import type { MarketBriefingModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";

export { MarketBriefingFooterSkeleton, MarketBriefingSectionSkeleton };

type MarketBriefingSectionProps = {
  briefing: MarketBriefingModel;
  copy: MarketPulseLanguage;
};

function StateIcon({ stateKey }: { stateKey: string }) {
  if (stateKey === "sentiment") {
    return <TrendingDown aria-hidden="true" size={14} />;
  }
  if (stateKey === "participation") {
    return <Zap aria-hidden="true" size={14} />;
  }
  if (stateKey === "momentum") {
    return <ArrowUpRight aria-hidden="true" size={14} />;
  }
  return <Crosshair aria-hidden="true" size={14} />;
}

function OpportunityGauge({
  score,
  history,
  previousSession,
  weeklyAverage,
  trendLabel,
  copy,
}: {
  score: number;
  history: number[];
  previousSession: number | null;
  weeklyAverage: number | null;
  trendLabel: string | null;
  copy: MarketPulseLanguage["briefing"];
}) {
  const radius = 62;
  const centerX = 80;
  const centerY = 78;
  const startX = centerX - radius;
  const endX = centerX + radius;
  const arcPath = `M ${startX} ${centerY} A ${radius} ${radius} 0 0 1 ${endX} ${centerY}`;
  const progress = score / 100;

  return (
    <div className="pulse-opportunity-gauge-wrap">
      <div className="pulse-opportunity-gauge-chart">
        <svg aria-hidden="true" className="pulse-opportunity-gauge-svg" viewBox="0 0 160 88">
          <defs>
            <linearGradient id="pulseGaugeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="var(--positive)" />
              <stop offset="100%" stopColor="var(--primary)" />
            </linearGradient>
          </defs>
          <path
            className="pulse-opportunity-gauge-track"
            d={arcPath}
            pathLength={1}
            strokeWidth="9"
          />
          <path
            className="pulse-opportunity-gauge-fill"
            d={arcPath}
            pathLength={1}
            stroke="url(#pulseGaugeGradient)"
            strokeDasharray={`${progress} 1`}
            strokeWidth="9"
          />
        </svg>
        <div className="pulse-opportunity-gauge-score">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>
      <div className="pulse-opportunity-history-wrap">
        <span className="pulse-opportunity-history-label">{copy.lastFiveSessions}</span>
        <div className="pulse-opportunity-history" aria-label={copy.lastFiveSessions}>
          {Array.from({ length: 5 }, (_, slotIndex) => {
            const historyIndex = slotIndex - Math.max(0, 5 - history.length);
            const value = historyIndex >= 0 ? history[historyIndex] : undefined;
            const isCurrent = historyIndex === history.length - 1 && value !== undefined;
            if (value === undefined) {
              return (
                <span
                  className="pulse-opportunity-history-item pulse-opportunity-history-item-placeholder pulse-skeleton"
                  key={`placeholder-${slotIndex}`}
                />
              );
            }

            return (
              <span
                className={`pulse-opportunity-history-item${isCurrent ? " pulse-opportunity-history-item-current" : ""}`}
                key={`${value}-${slotIndex}`}
              >
                {value}
              </span>
            );
          })}
        </div>
      </div>
      <div className="pulse-opportunity-context">
        {previousSession !== null ? (
          <span>
            {copy.yesterday(previousSession)}
          </span>
        ) : null}
        {weeklyAverage !== null ? (
          <span>
            {copy.fiveDayAvg(weeklyAverage)}
          </span>
        ) : null}
        {trendLabel ? (
          <span>
            {copy.trend(trendLabel)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function MarketBriefingSection({ briefing, copy }: MarketBriefingSectionProps) {
  const { story, state, moneyFlow, opportunityScore } = briefing;
  const headlineLines = story.headline.split("\n");
  const briefingLines = story.explanation.split("\n").filter(Boolean);

  return (
    <>
      <section className="pulse-briefing-top" aria-label={copy.briefing.overviewAria}>
        <article className={`pulse-story-card pulse-story-card-${story.tone}`}>
          <div aria-hidden="true" className="pulse-story-watermark" />
          <div className="pulse-story-main">
            <h2 className="pulse-story-headline">
              {headlineLines.map((line, index) => (
                <span key={`${line}-${index}`}>
                  {line}
                  {index < headlineLines.length - 1 ? <br /> : null}
                </span>
              ))}
            </h2>
            <div className="pulse-story-briefing-lines">
              {briefingLines.map((line) => (
                <p className="pulse-story-briefing-line" key={line}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          <div className="pulse-story-snapshot">
            <span className="pulse-story-snapshot-label">{copy.briefing.breadthSnapshot}</span>
            <div className="pulse-story-metrics" role="list" aria-label={copy.briefing.breadthSnapshotAria}>
            {story.metrics.map((metric) => (
              <div className={`pulse-story-metric pulse-story-metric-${metric.tone}`} key={metric.label} role="listitem">
                <span className="pulse-story-metric-label">{metric.label}</span>
                <strong className="pulse-story-metric-value">
                  {metric.value}
                  {metric.subValue ? <small>{metric.subValue}</small> : null}
                </strong>
              </div>
            ))}
            </div>
          </div>
        </article>

        <article className="pulse-state-card">
          <p className="pulse-card-kicker">{copy.briefing.marketState}</p>
          <ul className="pulse-state-list">
            {state.dimensions.map((dimension) => (
              <li className="pulse-state-row" key={dimension.key}>
                <span className="pulse-state-label">
                  <StateIcon stateKey={dimension.key} />
                  {dimension.label}
                </span>
                <strong className={`pulse-state-value pulse-state-value-${dimension.tone}`}>{dimension.value}</strong>
              </li>
            ))}
          </ul>
          <footer className={`pulse-state-overall pulse-state-overall-${state.overallTone}`}>
            {copy.briefing.overallState} <strong>{state.overallLabel}</strong>
          </footer>
        </article>

        <article className="pulse-flow-card">
          <p className="pulse-card-kicker">{copy.briefing.moneyFlow}</p>
          <div className="pulse-flow-group">
            <p className="pulse-flow-heading pulse-flow-heading-in">
              <ArrowUpRight aria-hidden="true" size={14} />
              {copy.briefing.inflowing}
            </p>
            <div className="pulse-flow-sectors">
              {moneyFlow.inflows.map((sector, index) => (
                <div
                  className={`pulse-flow-sector pulse-flow-sector-in${index === 0 ? " pulse-flow-sector-dominant" : ""}`}
                  key={sector.sector}
                >
                  <div className="pulse-flow-sector-head">
                    <span>{sector.sector}</span>
                    <strong>{sector.changeLabel}</strong>
                  </div>
                  <div className="pulse-flow-bar" aria-hidden="true">
                    <span style={{ width: `${sector.strength}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pulse-flow-group pulse-flow-group-out">
            <p className="pulse-flow-heading pulse-flow-heading-out">
              <ArrowDownRight aria-hidden="true" size={14} />
              {copy.briefing.outflowing}
            </p>
            <div className="pulse-flow-sectors">
              {moneyFlow.outflows.map((sector) => (
                <div className="pulse-flow-sector pulse-flow-sector-out" key={sector.sector}>
                  <div className="pulse-flow-sector-head">
                    <span>{sector.sector}</span>
                    <strong>{sector.changeLabel}</strong>
                  </div>
                  <div className="pulse-flow-bar" aria-hidden="true">
                    <span style={{ width: `${sector.strength}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="pulse-opportunity-card">
          <p className="pulse-card-kicker">{copy.briefing.opportunityScore}</p>
          <OpportunityGauge
            copy={copy.briefing}
            history={opportunityScore.history}
            previousSession={opportunityScore.previousSession}
            score={opportunityScore.score}
            trendLabel={opportunityScore.trendLabel}
            weeklyAverage={opportunityScore.weeklyAverage}
          />
          <p className="pulse-opportunity-label">{opportunityScore.label}</p>
        </article>
      </section>
    </>
  );
}

type MarketBriefingFooterProps = {
  leadership: MarketBriefingModel["leadership"];
  summary: MarketBriefingModel["summary"];
  copy: {
    leadership: MarketPulseLanguage["leadership"];
    summary: MarketPulseLanguage["summary"];
  };
};

export function MarketBriefingFooter({ leadership, summary, copy }: MarketBriefingFooterProps) {
  const [sectorCard, stockCard, accumulationCard] = leadership.cards;
  const summaryLines = summary.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const summaryHeadline = summaryLines[0] ?? null;
  const summaryBodyLines = summaryLines.slice(1);

  return (
    <>
      <article className="pulse-leadership-card">
        <div className="pulse-section-head pulse-section-head-compact">
          <div>
            <p className="pulse-card-kicker">{copy.leadership.title}</p>
            <p className="pulse-leadership-subtitle">{copy.leadership.subtitle}</p>
          </div>
        </div>
        {leadership.narrative ? <p className="pulse-leadership-narrative">{leadership.narrative}</p> : null}
        <div className="pulse-leadership-widgets">
          {sectorCard ? (
            <LeadershipWidget card={sectorCard} className="pulse-leadership-widget-sector" dominant />
          ) : null}
          {stockCard ? <LeadershipWidget card={stockCard} className="pulse-leadership-widget-stock" stockDominant /> : null}
          {accumulationCard ? (
            <LeadershipWidget card={accumulationCard} className="pulse-leadership-widget-accumulation" accumulationLayout />
          ) : null}
          {leadership.freshBuySignals.length > 0 ? (
            <div className="pulse-leadership-widget-signals">
              <span className="pulse-leadership-kind">{copy.leadership.freshSignals}</span>
              <div className="pulse-leadership-signal-stats">
                <span>{copy.leadership.newToday(leadership.freshNewCount)}</span>
                <span>{copy.leadership.upgradedToday(leadership.freshUpgradedCount)}</span>
              </div>
              <div className="pulse-leadership-signal-list">
                {leadership.freshBuySignals.map((symbol) => (
                  <span className="pulse-leadership-signal" key={symbol}>
                    <span aria-hidden="true" className="pulse-leadership-signal-dot" />
                    {symbol}
                    <span className="pulse-leadership-signal-buy">BUY</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </article>

      <article className={`pulse-summary-card pulse-summary-card-${summary.tone}`}>
        <div className="pulse-summary-head">
          <p className="pulse-card-kicker">{copy.summary.title}</p>
          <div className="pulse-summary-icon-watermark" aria-hidden="true">
            <Shield size={44} strokeWidth={1.1} />
          </div>
        </div>

        <div className="pulse-summary-main">
          <section className="pulse-summary-narrative">
            {summaryHeadline ? <h3 className="pulse-summary-headline">{summaryHeadline}</h3> : null}
            {summaryBodyLines.map((line) => (
              <p className="pulse-summary-text" key={line}>
                {line}
              </p>
            ))}
          </section>

          {summary.tradingEnvironment ? (
            <section className="pulse-summary-env-panel">
              <div className="pulse-summary-env-head">
                <span className="pulse-summary-env-head-icon" aria-hidden="true">
                  <Zap size={13} strokeWidth={2.2} />
                </span>
                <span>{copy.summary.tradingEnvironment}</span>
              </div>
              <ul className="pulse-summary-trading-env-list">
                {summary.tradingEnvironment.signals.map((signal) => (
                  <li
                    className={`pulse-summary-trading-env-item pulse-summary-trading-env-${signal.tone}`}
                    key={signal.text}
                  >
                    <span aria-hidden="true" className="pulse-summary-trading-env-mark">
                      {signal.tone === "positive" ? <Check size={12} strokeWidth={2.6} /> : <AlertTriangle size={12} strokeWidth={2.4} />}
                    </span>
                    <span>{signal.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.tradingEnvironment ? (
            <div
              className={`pulse-summary-verdict pulse-summary-verdict-${summary.tradingEnvironment.overallTone}`}
            >
              <span className="pulse-summary-verdict-label">{copy.summary.overall}</span>
              <strong className="pulse-summary-verdict-value">{summary.tradingEnvironment.overallLabel}</strong>
            </div>
          ) : null}

          <Link className="pulse-summary-link" href="/scanner">
            {copy.summary.readFullAnalysis}
          </Link>
        </div>
      </article>
    </>
  );
}

function LeadershipWidget({
  card,
  className,
  dominant = false,
  stockDominant = false,
  accumulationLayout = false,
}: {
  card: MarketBriefingModel["leadership"]["cards"][number];
  className: string;
  dominant?: boolean;
  stockDominant?: boolean;
  accumulationLayout?: boolean;
}) {
  const showSparkline = !accumulationLayout && card.sparklinePoints.length >= 2;

  const content = (
    <>
      <span className="pulse-leadership-kind">{card.title}</span>
      <strong
        className={`pulse-leadership-name pulse-leadership-name-${card.tone}${dominant ? " pulse-leadership-dominant" : ""}${stockDominant ? " pulse-leadership-stock-dominant" : ""}${accumulationLayout ? " pulse-leadership-accumulation-name" : ""}`}
      >
        {card.name}
      </strong>
      {card.detail ? (
        <span className={`pulse-leadership-detail${accumulationLayout ? " pulse-leadership-accumulation-metric" : ""}`}>
          {card.detail}
        </span>
      ) : null}
      {card.subtitle ? <span className="pulse-leadership-subline">{card.subtitle}</span> : null}
      {showSparkline ? (
        <MiniSparkline points={card.sparklinePoints} tone={card.tone === "negative" ? "negative" : "positive"} />
      ) : null}
    </>
  );

  if (card.href) {
    return (
      <Link className={`pulse-leadership-widget ${className}`} href={card.href}>
        {content}
      </Link>
    );
  }

  return <div className={`pulse-leadership-widget ${className}`}>{content}</div>;
}
