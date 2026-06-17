"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Crosshair,
  Shield,
  Target,
  TrendingDown,
  Zap,
} from "lucide-react";

import { MiniSparkline } from "@/features/market-pulse/components/pulse-score-badge";
import type { MarketBriefingModel } from "@/features/market-pulse/types/market-pulse-types";

type MarketBriefingSectionProps = {
  briefing: MarketBriefingModel;
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

function PlaybookIcon({ profile }: { profile: string }) {
  if (profile === "Aggressive") {
    return <Target aria-hidden="true" size={18} />;
  }
  if (profile === "Balanced") {
    return <Crosshair aria-hidden="true" size={18} />;
  }
  return <Shield aria-hidden="true" size={18} />;
}

function OpportunityGauge({
  score,
  history,
  previousSession,
  weeklyAverage,
  trendLabel,
}: {
  score: number;
  history: number[];
  previousSession: number | null;
  weeklyAverage: number | null;
  trendLabel: string | null;
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
        <span className="pulse-opportunity-history-label">Last 5 sessions</span>
        {history.length >= 2 ? (
          <div className="pulse-opportunity-history" aria-label="Last 5 sessions">
            {history.map((value, index) => (
              <span
                className={`pulse-opportunity-history-item${index === history.length - 1 ? " pulse-opportunity-history-item-current" : ""}`}
                key={`${value}-${index}`}
              >
                {value}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="pulse-opportunity-context">
        {previousSession !== null ? (
          <span>
            Yesterday: <strong>{previousSession}</strong>
          </span>
        ) : null}
        {weeklyAverage !== null ? (
          <span>
            5-Day Avg: <strong>{weeklyAverage}</strong>
          </span>
        ) : null}
        {trendLabel ? (
          <span>
            Trend: <strong className={`pulse-opportunity-trend-${trendLabel.toLowerCase()}`}>{trendLabel}</strong>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function resolveActivePlaybook(briefing: MarketBriefingModel) {
  if (briefing.state.overallTone === "warning" || briefing.state.overallTone === "negative") {
    return "Defensive";
  }
  if (briefing.opportunityScore.score >= 70) {
    return "Aggressive";
  }
  return "Balanced";
}

export function MarketBriefingSection({ briefing }: MarketBriefingSectionProps) {
  const { story, state, moneyFlow, opportunityScore, playbook, highPriority } = briefing;
  const headlineLines = story.headline.split("\n");
  const briefingLines = story.explanation.split("\n").filter(Boolean);
  const activePlaybook = resolveActivePlaybook(briefing);

  return (
    <>
      <section className="pulse-briefing-top" aria-label="Market briefing overview">
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
            <span className="pulse-story-snapshot-label">Market Breadth Snapshot</span>
            <div className="pulse-story-metrics" role="list" aria-label="Market breadth snapshot">
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
          <p className="pulse-card-kicker">Market State</p>
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
            Overall State: <strong>{state.overallLabel}</strong>
          </footer>
        </article>

        <article className="pulse-flow-card">
          <p className="pulse-card-kicker">Money Flow</p>
          <div className="pulse-flow-group">
            <p className="pulse-flow-heading pulse-flow-heading-in">
              <ArrowUpRight aria-hidden="true" size={14} />
              Inflowing
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
              Outflowing
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
          <p className="pulse-card-kicker">Opportunity Score</p>
          <OpportunityGauge
            history={opportunityScore.history}
            previousSession={opportunityScore.previousSession}
            score={opportunityScore.score}
            trendLabel={opportunityScore.trendLabel}
            weeklyAverage={opportunityScore.weeklyAverage}
          />
          <p className="pulse-opportunity-label">{opportunityScore.label}</p>
        </article>
      </section>

      <section className="pulse-playbook-row" aria-label="Today's playbook">
        <div className="pulse-playbook-strip">
          <p className="pulse-playbook-question">{playbook.question}</p>
          <div className="pulse-playbook-profiles">
            {playbook.items.map((item) => (
              <div
                className={`pulse-playbook-profile pulse-playbook-profile-${item.tone}${activePlaybook === item.profile ? " pulse-playbook-profile-active" : ""}`}
                key={item.profile}
              >
                <div className="pulse-playbook-profile-icon">
                  <PlaybookIcon profile={item.profile} />
                </div>
                <div className="pulse-playbook-profile-copy">
                  <strong>{item.profile}</strong>
                  <span className="pulse-playbook-profile-summary">{item.summary}</span>
                  <span className="pulse-playbook-profile-guidance">{item.guidance}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {highPriority ? (
          <Link className="pulse-high-priority-card" href={highPriority.href}>
            <span className="pulse-high-priority-badge">High Priority</span>
            <strong className="pulse-high-priority-symbol">{highPriority.symbol}</strong>
            <p className="pulse-high-priority-reason">{highPriority.metricLabel}</p>
            <div className="pulse-high-priority-trigger">
              <span>Trigger</span>
              <strong>{highPriority.triggerLevel}</strong>
            </div>
            <div className="pulse-high-priority-footer">
              <span className={`pulse-focus-change pulse-focus-change-${highPriority.priceTone}`}>
                {highPriority.priceChangePercent}
              </span>
              <MiniSparkline compact points={highPriority.sparklinePoints} tone={highPriority.priceTone} />
            </div>
          </Link>
        ) : null}
      </section>
    </>
  );
}

type MarketBriefingFooterProps = {
  leadership: MarketBriefingModel["leadership"];
  summary: MarketBriefingModel["summary"];
};

export function MarketBriefingFooter({ leadership, summary }: MarketBriefingFooterProps) {
  const [sectorCard, stockCard, accumulationCard] = leadership.cards;
  const summaryLines = summary.text.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <>
      <article className="pulse-leadership-card">
        <div className="pulse-section-head pulse-section-head-compact">
          <div>
            <p className="pulse-card-kicker">Market Leadership</p>
            <p className="pulse-leadership-subtitle">Who&apos;s leading the market today.</p>
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
              <span className="pulse-leadership-kind">Fresh Signals (Buy)</span>
              <div className="pulse-leadership-signal-stats">
                <span>New Today: {leadership.freshNewCount}</span>
                <span>Upgraded Today: {leadership.freshUpgradedCount}</span>
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
        <p className="pulse-card-kicker">Market State Summary</p>
        <div className="pulse-summary-main">
          <div className="pulse-summary-body">
            <div className="pulse-summary-copy">
              {summaryLines.map((line) => (
                <p className="pulse-summary-text" key={line}>
                  {line}
                </p>
              ))}
              {summary.tradingEnvironment ? (
                <div className="pulse-summary-trading-env">
                  <p className="pulse-summary-trading-env-label">Trading Environment</p>
                  <ul className="pulse-summary-trading-env-list">
                    {summary.tradingEnvironment.signals.map((signal) => (
                      <li
                        className={`pulse-summary-trading-env-item pulse-summary-trading-env-${signal.tone}`}
                        key={signal.text}
                      >
                        <span aria-hidden="true" className="pulse-summary-trading-env-mark">
                          {signal.tone === "positive" ? "✓" : "⚠"}
                        </span>
                        {signal.text}
                      </li>
                    ))}
                  </ul>
                  <p className={`pulse-summary-trading-env-overall pulse-summary-trading-env-overall-${summary.tradingEnvironment.overallTone}`}>
                    Overall: <strong>{summary.tradingEnvironment.overallLabel}</strong>
                  </p>
                </div>
              ) : null}
            </div>
            <div className="pulse-summary-icon" aria-hidden="true">
              <Shield size={32} strokeWidth={1.1} />
            </div>
          </div>
          <Link className="pulse-summary-link" href="/scanner">
            Read full analysis →
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
