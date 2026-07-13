"use client";

import { LoadingStatus, Shimmer } from "@/components/ui/shimmer";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";

function StoryCardSkeleton({ copy, delay = 0 }: { copy: MarketPulseLanguage; delay?: number }) {
  return (
    <article className="pulse-story-card pulse-briefing-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="pulse-story-main">
        <Shimmer className="pulse-shimmer-headline" delayMs={delay} />
        <Shimmer className="pulse-shimmer-headline pulse-shimmer-headline-secondary" delayMs={delay + 60} />
        <div className="pulse-story-briefing-lines">
          <Shimmer className="pulse-shimmer-line" delayMs={delay + 90} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 120} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 150} />
        </div>
      </div>
      <div className="pulse-story-snapshot">
        <span className="pulse-card-kicker pulse-skeleton-kicker">{copy.briefing.breadthSnapshot}</span>
        <div className="pulse-story-metrics">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="pulse-story-metric pulse-story-metric-skeleton" key={index}>
              <Shimmer className="pulse-shimmer-metric-label" delayMs={delay + 180 + index * 40} />
              <Shimmer className="pulse-shimmer-metric-value" delayMs={delay + 200 + index * 40} />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function StateCardSkeleton({ copy, delay = 0 }: { copy: MarketPulseLanguage; delay?: number }) {
  return (
    <article className="pulse-state-card pulse-briefing-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <p className="pulse-card-kicker">{copy.briefing.marketState}</p>
      <ul className="pulse-state-list">
        {Array.from({ length: 4 }).map((_, index) => (
          <li className="pulse-state-row pulse-state-row-skeleton" key={index}>
            <span className="pulse-state-label">
              <Shimmer className="pulse-shimmer-icon" delayMs={delay + index * 50} />
              <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 40 + index * 50} />
            </span>
            <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 60 + index * 50} />
          </li>
        ))}
      </ul>
      <footer className="pulse-state-overall pulse-state-overall-skeleton">
        <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 260} />
      </footer>
    </article>
  );
}

function FlowCardSkeleton({ copy, delay = 0 }: { copy: MarketPulseLanguage; delay?: number }) {
  return (
    <article className="pulse-flow-card pulse-briefing-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <p className="pulse-card-kicker">{copy.briefing.moneyFlow}</p>
      <div className="pulse-flow-group">
        <div className="pulse-flow-heading pulse-flow-heading-in pulse-flow-heading-skeleton">
          <Shimmer className="pulse-shimmer-icon pulse-shimmer-icon-sm" delayMs={delay} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 40} />
        </div>
        <div className="pulse-flow-sectors">
          {Array.from({ length: 2 }).map((_, index) => (
            <div className="pulse-flow-sector pulse-flow-sector-skeleton" key={`in-${index}`}>
              <div className="pulse-flow-sector-head">
                <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 80 + index * 60} />
                <Shimmer className="pulse-shimmer-line pulse-shimmer-line-tiny" delayMs={delay + 100 + index * 60} />
              </div>
              <Shimmer className="pulse-shimmer-flow-bar" delayMs={delay + 120 + index * 60} />
            </div>
          ))}
        </div>
      </div>
      <div className="pulse-flow-group pulse-flow-group-out">
        <div className="pulse-flow-heading pulse-flow-heading-out pulse-flow-heading-skeleton">
          <Shimmer className="pulse-shimmer-icon pulse-shimmer-icon-sm" delayMs={delay + 200} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 240} />
        </div>
        <div className="pulse-flow-sectors">
          {Array.from({ length: 2 }).map((_, index) => (
            <div className="pulse-flow-sector pulse-flow-sector-skeleton" key={`out-${index}`}>
              <div className="pulse-flow-sector-head">
                <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 280 + index * 60} />
                <Shimmer className="pulse-shimmer-line pulse-shimmer-line-tiny" delayMs={delay + 300 + index * 60} />
              </div>
              <Shimmer className="pulse-shimmer-flow-bar pulse-shimmer-flow-bar-out" delayMs={delay + 320 + index * 60} />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function OpportunityCardSkeleton({ copy, delay = 0 }: { copy: MarketPulseLanguage; delay?: number }) {
  return (
    <article className="pulse-opportunity-card pulse-briefing-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <p className="pulse-card-kicker">{copy.briefing.opportunityScore}</p>
      <div className="pulse-opportunity-gauge-wrap">
        <div className="pulse-opportunity-gauge-chart pulse-opportunity-gauge-chart-skeleton">
          <Shimmer className="pulse-shimmer-gauge-arc" delayMs={delay} />
          <Shimmer className="pulse-shimmer-gauge-score" delayMs={delay + 80} />
        </div>
        <div className="pulse-opportunity-history-wrap">
          <span className="pulse-opportunity-history-label">{copy.briefing.lastFiveSessions}</span>
          <div className="pulse-opportunity-history">
            {Array.from({ length: 5 }).map((_, index) => (
              <Shimmer className="pulse-shimmer-history-chip" delayMs={delay + 120 + index * 35} key={index} />
            ))}
          </div>
        </div>
        <div className="pulse-opportunity-context pulse-opportunity-context-skeleton">
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 300} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 330} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-tiny" delayMs={delay + 360} />
        </div>
      </div>
      <Shimmer className="pulse-shimmer-line pulse-shimmer-line-long" delayMs={delay + 400} />
    </article>
  );
}

function LeadershipCardSkeleton({ copy, delay = 0 }: { copy: MarketPulseLanguage; delay?: number }) {
  return (
    <article className="pulse-leadership-card pulse-briefing-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="pulse-section-head pulse-section-head-compact">
        <div>
          <p className="pulse-card-kicker">{copy.leadership.title}</p>
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay} />
        </div>
      </div>
      <Shimmer className="pulse-shimmer-line pulse-shimmer-line-long" delayMs={delay + 60} />
      <div className="pulse-leadership-widgets">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="pulse-leadership-widget pulse-leadership-widget-skeleton" key={index}>
            <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 100 + index * 70} />
            <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 130 + index * 70} />
            <Shimmer className="pulse-shimmer-line pulse-shimmer-line-tiny" delayMs={delay + 160 + index * 70} />
            {index < 2 ? <Shimmer className="pulse-shimmer-sparkline" delayMs={delay + 190 + index * 70} /> : null}
          </div>
        ))}
        <div className="pulse-leadership-widget-signals pulse-leadership-widget-signals-skeleton">
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 320} />
          <div className="pulse-leadership-signal-stats">
            <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 350} />
            <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 380} />
          </div>
          <div className="pulse-leadership-signal-list">
            {Array.from({ length: 4 }).map((_, index) => (
              <Shimmer className="pulse-shimmer-signal-pill" delayMs={delay + 410 + index * 40} key={index} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function SummaryCardSkeleton({ copy, delay = 0 }: { copy: MarketPulseLanguage; delay?: number }) {
  return (
    <article className="pulse-summary-card pulse-briefing-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="pulse-summary-head">
        <p className="pulse-card-kicker">{copy.summary.title}</p>
      </div>
      <div className="pulse-summary-main">
        <section className="pulse-summary-narrative">
          <Shimmer className="pulse-shimmer-line pulse-shimmer-headline" delayMs={delay} />
          <Shimmer className="pulse-shimmer-line" delayMs={delay + 60} />
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 90} />
        </section>
        <section className="pulse-summary-env-panel pulse-summary-env-panel-skeleton">
          <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 140} />
          <ul className="pulse-summary-trading-env-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <li className="pulse-summary-trading-env-item pulse-summary-trading-env-item-skeleton" key={index}>
                <Shimmer className="pulse-shimmer-icon pulse-shimmer-icon-sm" delayMs={delay + 180 + index * 50} />
                <Shimmer className="pulse-shimmer-line" delayMs={delay + 200 + index * 50} />
              </li>
            ))}
          </ul>
        </section>
        <Shimmer className="pulse-shimmer-line pulse-shimmer-line-short" delayMs={delay + 360} />
        <Shimmer className="pulse-shimmer-line pulse-shimmer-line-medium" delayMs={delay + 390} />
      </div>
    </article>
  );
}

export function MarketBriefingSectionSkeleton({ copy }: { copy: MarketPulseLanguage }) {
  return (
    <div className="pulse-briefing-loading-shell">
      <LoadingStatus className="pulse-briefing-loading-status" label={copy.states.loadingBriefing} />
      <section
        className="pulse-briefing-top pulse-briefing-top-loading"
        aria-busy="true"
        aria-label={copy.states.loadingBriefingAria}
      >
        <StoryCardSkeleton copy={copy} delay={0} />
        <StateCardSkeleton copy={copy} delay={80} />
        <FlowCardSkeleton copy={copy} delay={160} />
        <OpportunityCardSkeleton copy={copy} delay={240} />
      </section>
    </div>
  );
}

export function MarketBriefingFooterSkeleton({ copy }: { copy: MarketPulseLanguage }) {
  return (
    <>
      <LeadershipCardSkeleton copy={copy} delay={0} />
      <SummaryCardSkeleton copy={copy} delay={120} />
    </>
  );
}
