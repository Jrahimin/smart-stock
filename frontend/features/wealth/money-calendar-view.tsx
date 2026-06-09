"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { useAuth } from "@/features/auth/context/auth-context";
import { WealthFutureTimelineCalendar } from "@/features/wealth/components/wealth-future-timeline-calendar";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { useMoneySnapshot } from "@/features/wealth/hooks/use-money-snapshot";
import { readLocalMoneySnapshot } from "@/features/wealth/lib/local-money-snapshot";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

type CalendarAsset = {
  category: string;
  label: string;
  value: string | number;
  metadata: Record<string, unknown>;
};

type CalendarLiability = {
  category?: string;
  label: string;
  balance: string | number;
  interest_rate?: string | number | null;
  monthly_emi?: string | number | null;
  remaining_months?: number | string | null;
  metadata?: Record<string, unknown>;
};

type HorizonOption = {
  key: string;
  label: string;
  months: number;
};

type CalendarEvent = {
  amount: number;
  assetCategory: string;
  date: Date;
  detail: string;
  kind: "income" | "maturity" | "payment" | "payoff" | "milestone";
  label: string;
  monthOffset: number;
};

type CashflowDisplayEvent = CalendarEvent & {
  isSelectedDate: boolean;
  timingLabel: string;
};

type FinancialEventRow = {
  amount: string;
  assetCategory: string;
  dateLabel: string;
  detail: string;
  icon: string;
  kind: CalendarEvent["kind"];
  label: string;
  relativeLabel: string;
  status: "ahead" | "past" | "today";
  statusLabel: string;
};

type EventKindFilter = "all" | CalendarEvent["kind"];
type AssetTypeFilter = "all" | "deposit" | "dps" | "loan" | "sanchayapatra";

const EVENT_KIND_FILTERS: Array<{ key: EventKindFilter; label: string }> = [
  { key: "all", label: "All types" },
  { key: "maturity", label: "Maturity" },
  { key: "income", label: "Profit" },
  { key: "payment", label: "EMI" },
  { key: "payoff", label: "Payoff" },
];

const ASSET_TYPE_FILTERS: Array<{ key: AssetTypeFilter; label: string }> = [
  { key: "all", label: "All assets" },
  { key: "deposit", label: "FDR" },
  { key: "dps", label: "DPS" },
  { key: "sanchayapatra", label: "Sanchayapatra" },
  { key: "loan", label: "Loan" },
];

type ProjectionPoint = {
  assets: number;
  liabilities: number;
  label: string;
  month: number;
  netWorth: number;
  x: number;
};

type JourneyStatus = "achieved" | "upcoming" | "future";

const MAX_TIMELINE_MONTHS = 240;

const HORIZONS: HorizonOption[] = [
  { key: "today", label: "Today", months: 0 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1Y", months: 12 },
  { key: "3y", label: "3Y", months: 36 },
  { key: "5y", label: "5Y", months: 60 },
  { key: "10y", label: "10Y", months: 120 },
  { key: "retirement", label: "Retirement", months: 240 },
];

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_PADDING = 28;

export function MoneyCalendarView() {
  const { isAuthenticated } = useAuth();
  const { snapshot } = useMoneySnapshot();
  const [localDraft, setLocalDraft] = useState(() => readLocalMoneySnapshot());
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxTimelineDate = useMemo(() => addMonths(today, MAX_TIMELINE_MONTHS), [today]);
  const [selectedDate, setSelectedDate] = useState(() => addMonths(new Date(), 60));
  const [eventKindFilter, setEventKindFilter] = useState<EventKindFilter>("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");

  useEffect(() => {
    if (!isAuthenticated) {
      setLocalDraft(readLocalMoneySnapshot());
    }
  }, [isAuthenticated]);

  const calendarSource = useMemo(() => {
    const assets: CalendarAsset[] =
      isAuthenticated && snapshot
        ? snapshot.assets.map((asset) => ({
            category: asset.category,
            label: asset.label,
            value: asset.value,
            metadata: asset.metadata_json ?? {},
          }))
        : localDraft.assets.map((asset) => ({
            category: asset.category,
            label: asset.label,
            value: asset.value,
            metadata: asset.metadata ?? {},
          }));

    const liabilities: CalendarLiability[] =
      isAuthenticated && snapshot
        ? snapshot.liabilities.map((liability) => ({
            category: liability.category,
            label: liability.label,
            balance: liability.balance,
            interest_rate: liability.interest_rate,
            monthly_emi: liability.monthly_emi,
            remaining_months: liability.remaining_months,
            metadata: liability.metadata_json ?? {},
          }))
        : localDraft.liabilities.map((liability) => ({
            category: liability.category,
            label: liability.label,
            balance: liability.balance,
            interest_rate: liability.interest_rate,
            monthly_emi: liability.monthly_emi,
            remaining_months: liability.remaining_months,
            metadata: liability.metadata ?? {},
          }));

    return {
      assets,
      liabilities,
      monthlySavings: isAuthenticated && snapshot ? toNumber(snapshot.monthly_savings) : toNumber(localDraft.monthly_savings),
    };
  }, [isAuthenticated, localDraft.assets, localDraft.liabilities, snapshot]);

  const clampedSelectedDate = useMemo(() => clampDate(selectedDate, today, maxTimelineDate), [maxTimelineDate, selectedDate, today]);
  const selectedMonths = useMemo(() => Math.max(0, monthsBetween(today, clampedSelectedDate)), [clampedSelectedDate, today]);
  const activeHorizonKey = HORIZONS.find((option) => option.months === selectedMonths)?.key ?? null;

  const simulator = useMemo(
    () => buildFutureSimulator(calendarSource.assets, calendarSource.liabilities, calendarSource.monthlySavings, clampedSelectedDate, today),
    [calendarSource.assets, calendarSource.liabilities, calendarSource.monthlySavings, clampedSelectedDate, today],
  );

  const filteredFinancialEvents = useMemo(() => {
    return simulator.financialEvents.filter((event) => {
      if (eventKindFilter !== "all" && event.kind !== eventKindFilter) {
        return false;
      }
      if (assetTypeFilter !== "all" && !matchesAssetTypeFilter(event.assetCategory, assetTypeFilter)) {
        return false;
      }
      return true;
    });
  }, [assetTypeFilter, eventKindFilter, simulator.financialEvents]);

  const jumpToMonths = (months: number) => {
    setSelectedDate(addMonths(today, months));
  };

  const onScrubberChange = (months: number) => {
    setSelectedDate(addMonths(today, months));
  };
  if (!simulator.hasFinancialContext) {
    return (
      <section className="wealth-snapshot-page wealth-calendar-page">
        <WealthSubNav />

        <section className="wealth-calendar-empty-state">
          <div className="wealth-calendar-empty-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">Financial Future Simulator</p>
          <h1>Your future timeline is empty.</h1>
          <p>
            The more financial details you add, the richer your future timeline becomes. Add assets, income streams, and
            liabilities to see your future financial life unfold.
          </p>
          <div className="wealth-calendar-empty-actions">
            <Link className="wealth-primary-button" href="/wealth/tools/dps">
              Add DPS
            </Link>
            <Link className="wealth-chip" href="/wealth/tools/fdr">
              Add FDR
            </Link>
            <Link className="wealth-chip" href="/wealth/tools/sanchayapatra">
              Add Sanchayapatra
            </Link>
            <Link className="wealth-chip" href="/wealth/snapshot">
              Build Money Snapshot
            </Link>
          </div>
        </section>
      </section>
    );
  }

  const heroRailPoints = [
    { dateLabel: formatDateLabel(simulator.today.toISOString()), key: "today", label: "Today" },
    ...simulator.heroMilestones.map((milestone) => ({
      dateLabel: milestone.dateLabel,
      key: milestone.label,
      label: milestone.label,
    })),
    {
      dateLabel: formatDateLabel(simulator.selectedDate.toISOString()),
      key: "future",
      label: "Your future",
    },
  ];

  return (
    <section className="wealth-snapshot-page wealth-calendar-page">
      <WealthSubNav />

      <header className="wealth-calendar-hero">
        <div className="wealth-calendar-hero-copy">
          <p className="eyebrow">Financial Future Timeline</p>
          <h1>Pick any future date and see your financial life on that day.</h1>
          <p>{simulator.nextMilestone.detail}</p>
        </div>
        <div className="wealth-calendar-hero-rail" aria-label="Today to selected future date">
          <div
            className="wealth-calendar-rail-track"
            style={{ "--rail-count": heroRailPoints.length } as CSSProperties}
          >
            {heroRailPoints.map((point) => (
              <div className="wealth-calendar-rail-point" key={point.key}>
                <span className="wealth-calendar-rail-label">{point.label}</span>
                <span className="wealth-calendar-rail-dot" />
                <span className="wealth-calendar-rail-date">{point.dateLabel}</span>
              </div>
            ))}
          </div>
        </div>
        <article className="wealth-calendar-next-milestone">
          <span>Next Milestone</span>
          <strong>{simulator.nextMilestone.label}</strong>
          <small>{simulator.nextMilestone.countdown}</small>
          <b>{simulator.nextMilestone.value}</b>
        </article>
      </header>

      <section className="wealth-calendar-top-grid">
        <article className="wealth-calendar-snapshot-card">
          <div className="wealth-calendar-date-selector wealth-calendar-snapshot-rail">
            <div className="wealth-calendar-scrubber">
              <div className="wealth-calendar-scrubber-labels">
                <span>Today</span>
                <span>{maxTimelineDate.getFullYear()}</span>
              </div>
              <input
                aria-label="Timeline scrubber"
                aria-valuetext={formatSelectedDateLabel(clampedSelectedDate)}
                className="wealth-calendar-scrubber-input"
                max={MAX_TIMELINE_MONTHS}
                min={0}
                onChange={(event) => onScrubberChange(Number(event.target.value))}
                type="range"
                value={selectedMonths}
              />
            </div>
            <div aria-label="Quick date jumps" className="wealth-calendar-time-tabs" role="group">
              {HORIZONS.map((option) => (
                <button
                  className={option.key === activeHorizonKey ? "wealth-calendar-time-tab-active" : ""}
                  key={option.key}
                  onClick={() => jumpToMonths(option.months)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="wealth-calendar-snapshot-layout">
            <div className="wealth-calendar-snapshot-main">
              <p className="wealth-calendar-selected-date">{simulator.selectedDateLabel}</p>
              <p className="eyebrow">Projected Net Worth</p>
              <h2>{formatLargeCurrency(simulator.selectedNetWorth)}</h2>
              <div className="wealth-calendar-comparison">
                <div className="wealth-calendar-comparison-point">
                  <span>Today</span>
                  <strong>{formatLargeCurrency(simulator.currentNetWorth)}</strong>
                </div>
                <span aria-hidden="true" className="wealth-calendar-comparison-arrow">
                  →
                </span>
                <div className="wealth-calendar-comparison-point">
                  <span>{simulator.selectedDateShortLabel}</span>
                  <strong>{formatLargeCurrency(simulator.selectedNetWorth)}</strong>
                </div>
                <p className="wealth-calendar-comparison-delta">
                  + {formatWealthCurrency(simulator.netWorthDelta)} growth
                </p>
              </div>
              <div className="wealth-calendar-growth-line">
                <strong>{simulator.growthPercent}%</strong>
                <span>growth from today</span>
              </div>
              <p className="wealth-calendar-narrative">{simulator.narrative}</p>

              <div className="wealth-calendar-metric-grid">
                <SnapshotMetric label="Monthly Passive Income" tone="income" value={formatWealthCurrency(simulator.passiveIncome)} />
                <SnapshotMetric label="Liquid Cash" tone="cash" value={formatWealthCurrency(simulator.liquidCash)} />
                <SnapshotMetric label="Active Assets" tone="assets" value={String(simulator.activeAssetCount)} />
                <SnapshotMetric label="Upcoming Events" tone="events" value={String(simulator.upcomingEvents.length)} />
              </div>
            </div>

            <div className="wealth-calendar-snapshot-aside">
              <WealthFutureTimelineCalendar
                eventDateKeys={simulator.eventDateKeys}
                maxDate={maxTimelineDate}
                onSelectDate={setSelectedDate}
                selectedDate={clampedSelectedDate}
                today={today}
              />
            </div>
          </div>
        </article>

        <article className="wealth-calendar-future-me-card">
          <p className="eyebrow">Future Me</p>
          <span className="wealth-calendar-date-pill">You on {simulator.selectedDateShortLabel}</span>
          <h2>{simulator.identity}</h2>
          <p className="wealth-calendar-future-me-quote">{simulator.futureMeInterpretation}</p>
          <ul>
            {simulator.futureMeChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="wealth-calendar-events-card wealth-calendar-section-supporting">
        <div className="wealth-calendar-section-heading wealth-calendar-events-heading">
          <div>
            <p className="eyebrow">Financial Events</p>
            <h2>Maturities, profits, and payments on your timeline</h2>
            <p className="wealth-calendar-events-subtitle">Upcoming from today</p>
          </div>
        </div>

        <div className="wealth-calendar-events-toolbar">
          <div className="wealth-calendar-events-filters">
            <div className="wealth-calendar-events-filter-block">
              <span className="wealth-calendar-events-filter-label">Event type</span>
              <div aria-label="Filter by event type" className="wealth-calendar-events-filter-group" role="group">
                {EVENT_KIND_FILTERS.map((filter) => (
                  <button
                    className={eventKindFilter === filter.key ? "wealth-calendar-events-filter-active" : ""}
                    key={filter.key}
                    onClick={() => setEventKindFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <span aria-hidden="true" className="wealth-calendar-events-filter-divider" />
            <div className="wealth-calendar-events-filter-block">
              <span className="wealth-calendar-events-filter-label">Asset</span>
              <div aria-label="Filter by asset type" className="wealth-calendar-events-filter-group" role="group">
                {ASSET_TYPE_FILTERS.map((filter) => (
                  <button
                    className={assetTypeFilter === filter.key ? "wealth-calendar-events-filter-active" : ""}
                    key={filter.key}
                    onClick={() => setAssetTypeFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <span className="wealth-calendar-events-count">{filteredFinancialEvents.length} shown</span>
        </div>

        <div
          className={`wealth-calendar-events-scroller ${filteredFinancialEvents.length > 5 ? "wealth-calendar-events-scroller-active" : ""}`}
        >
          <div className="wealth-calendar-events-list">
            {filteredFinancialEvents.length > 0 ? (
              filteredFinancialEvents.map((event) => (
                <article
                  className={`wealth-calendar-event-row wealth-calendar-event-${event.kind} wealth-calendar-event-${event.status}`}
                  key={`${event.label}-${event.dateLabel}-${event.relativeLabel}`}
                >
                  <span aria-hidden="true" className={`wealth-calendar-event-icon wealth-calendar-event-icon-${event.kind}`}>
                    {event.icon}
                  </span>
                  <div className="wealth-calendar-event-copy">
                    <div className="wealth-calendar-event-date-row">
                      <time className="wealth-calendar-event-date">{event.dateLabel}</time>
                      <span className="wealth-calendar-event-relative">{event.relativeLabel}</span>
                    </div>
                    <strong>{event.label}</strong>
                    <small>{event.detail}</small>
                  </div>
                  <div className="wealth-calendar-event-row-meta">
                    <b>{event.amount}</b>
                  </div>
                </article>
              ))
            ) : (
              <p className="wealth-calendar-events-empty">
                {simulator.financialEvents.length > 0
                  ? "No events match these filters. Try a broader asset or event type."
                  : "No upcoming maturities or payouts yet. Add assets in Money Snapshot to populate this timeline."}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="wealth-calendar-journey-card wealth-calendar-section-supporting">
        <div className="wealth-calendar-section-heading">
          <div>
            <p className="eyebrow">Wealth Journey</p>
            <h2>Personal milestones along the way</h2>
          </div>
        </div>
        <div className="wealth-calendar-journey-track">
          {simulator.journey.map((milestone) => (
            <article
              className={`wealth-calendar-journey-node wealth-calendar-journey-node-${milestone.status}`}
              key={milestone.label}
            >
              <span>{milestone.statusIcon}</span>
              <strong>{milestone.label}</strong>
              <small>{milestone.statusLabel}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="wealth-calendar-evolution-card">
        <div className="wealth-calendar-section-heading">
          <div>
            <p className="eyebrow">Net Worth Evolution</p>
            <h2>The story of wealth accumulation</h2>
          </div>
          <span>{simulator.selectedDateShortLabel}</span>
        </div>
        <NetWorthChart points={simulator.chartPoints} selectedMonth={selectedMonths} milestones={simulator.chartMilestones} />
      </section>

      <section className="wealth-calendar-lower-grid">
        <article className="wealth-calendar-asset-card wealth-calendar-section-supporting">
          <div className="wealth-calendar-section-heading">
            <div>
              <p className="eyebrow">Assets Working For You</p>
              <h2>On {simulator.selectedDateShortLabel}</h2>
            </div>
          </div>
          <div className="wealth-calendar-asset-grid">
            {simulator.assetSummaries.map((asset) => (
              <div className="wealth-calendar-asset-summary" key={asset.label}>
                <span>{asset.label}</span>
                <strong>{asset.primary}</strong>
                <small>{asset.secondary}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="wealth-calendar-cashflow-card wealth-calendar-section-supporting">
          <div className="wealth-calendar-section-heading">
            <div>
              <p className="eyebrow">Future Cashflow Stream</p>
              <h2>Money moving through time</h2>
            </div>
            <span>±30 days</span>
          </div>
          <div className="wealth-calendar-cashflow-stream">
            {simulator.cashflowStream.map((event, index) => (
              <div className="wealth-calendar-cashflow-segment" key={`${event.label}-${event.date.getTime()}`}>
                <div
                  className={`wealth-calendar-cashflow-event wealth-calendar-cashflow-${event.kind}${event.isSelectedDate ? " wealth-calendar-cashflow-selected" : ""}`}
                >
                  <span>
                    {event.timingLabel}
                    {event.isSelectedDate ? " · Selected date" : ""}
                  </span>
                  <strong>{event.label}</strong>
                  <small>
                    {event.kind === "payment" ? "−" : "+"}
                    {formatWealthCurrency(event.amount)}
                  </small>
                </div>
                {index < simulator.cashflowStream.length - 1 ? (
                  <span aria-hidden="true" className="wealth-calendar-cashflow-connector" />
                ) : null}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="wealth-calendar-insights-card wealth-calendar-section-supporting">
        <div className="wealth-calendar-section-heading">
          <div>
            <p className="eyebrow">Future Insights</p>
            <h2>What your timeline reveals</h2>
          </div>
        </div>
        <ul className="wealth-calendar-insight-list">
          {simulator.insights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function SnapshotMetric({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className={`wealth-calendar-metric wealth-calendar-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NetWorthChart({
  milestones,
  points,
  selectedMonth,
}: {
  milestones: Array<{ label: string; month: number; x: number; y: number }>;
  points: ProjectionPoint[];
  selectedMonth: number;
}) {
  const selectedPoint = nearestPoint(points, selectedMonth);
  const maxValue = Math.max(...points.flatMap((point) => [point.assets, point.netWorth, point.liabilities]), 1);
  const assetsPath = buildChartPath(points, "assets", maxValue);
  const liabilitiesPath = buildChartPath(points, "liabilities", maxValue);
  const netWorthPath = buildChartPath(points, "netWorth", maxValue);
  const selectedX = selectedPoint ? selectedPoint.x : CHART_PADDING;

  return (
    <div className="wealth-calendar-chart-wrap">
      <svg className="wealth-calendar-chart" role="img" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <defs>
          <linearGradient id="wealth-calendar-net-worth-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(139 92 246 / 0.38)" />
            <stop offset="100%" stopColor="rgb(139 92 246 / 0)" />
          </linearGradient>
        </defs>
        <path className="wealth-calendar-chart-fill" d={`${netWorthPath} L ${points.at(-1)?.x ?? CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} L ${CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} Z`} />
        <path className="wealth-calendar-chart-assets" d={assetsPath} />
        <path className="wealth-calendar-chart-liabilities" d={liabilitiesPath} />
        <path className="wealth-calendar-chart-net" d={netWorthPath} />
        <line className="wealth-calendar-chart-selected-line" x1={selectedX} x2={selectedX} y1={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} />
        {milestones.map((milestone) => (
          <g className="wealth-calendar-chart-marker" key={milestone.label}>
            <circle cx={milestone.x} cy={milestone.y} r="4" />
            <text dominantBaseline="auto" x={milestone.x} y={milestone.y - 10}>
              {milestone.label}
            </text>
          </g>
        ))}
        {points.map((point) => (
          <text className="wealth-calendar-chart-year" key={point.label} x={point.x} y={CHART_HEIGHT - 6}>
            {point.label}
          </text>
        ))}
      </svg>
      <div className="wealth-calendar-chart-legend">
        <span className="wealth-calendar-legend-assets">Assets</span>
        <span className="wealth-calendar-legend-liabilities">Liabilities</span>
        <span className="wealth-calendar-legend-net">Net Worth</span>
      </div>
    </div>
  );
}

function buildFutureSimulator(
  assets: CalendarAsset[],
  liabilities: CalendarLiability[],
  monthlySavings: number,
  selectedDate: Date,
  today: Date,
) {
  const selectedMonths = Math.max(0, monthsBetween(today, selectedDate));
  const currentAssets = sumNumbers(assets.map((asset) => asset.value));
  const currentLiabilities = sumNumbers(liabilities.map((liability) => liability.balance));
  const currentNetWorth = currentAssets - currentLiabilities;
  const todayPassiveIncome = Math.round(assets.reduce((total, asset) => total + monthlyPassiveIncome(asset), 0));
  const passiveIncome = Math.round(
    assets
      .filter((asset) => isAssetGeneratingIncomeOnDate(asset, selectedDate))
      .reduce((total, asset) => total + monthlyPassiveIncome(asset), 0),
  );
  const liquidCash = Math.round(
    projectAssets(
      assets.filter((asset) => isLiquidAsset(asset)),
      0,
      selectedMonths,
    ),
  );
  const activeAssetCount = countActiveAssetsOnDate(assets, selectedDate);
  const events = buildCalendarEvents(assets, liabilities, today);
  const selectedAssets = projectAssets(assets, monthlySavings, selectedMonths);
  const selectedLiabilities = projectLiabilities(liabilities, selectedMonths);
  const selectedNetWorth = selectedAssets - selectedLiabilities;
  const growthPercent = currentNetWorth > 0 ? Math.round(((selectedNetWorth - currentNetWorth) / currentNetWorth) * 100) : 0;
  const lifestyleExpense = Math.max(monthlySavings * 2.4, todayPassiveIncome * 2.4, 60000);
  const passiveCoverage = Math.min(100, Math.round((passiveIncome / lifestyleExpense) * 100));
  const chartMonths = Math.max(selectedMonths, 120);
  const chartPoints = buildProjectionPoints(assets, liabilities, monthlySavings, chartMonths, today);
  const chartMilestones = buildChartMilestones(chartPoints);
  const futureEvents = events.filter((event) => event.date > today && event.date <= selectedDate);
  const nextMilestone = events.find((event) => event.date > today) ?? fallbackMilestone(selectedDate, selectedNetWorth);
  const heroMilestones = buildHeroMilestones(events, today, selectedDate);
  const selectedDateLabel = formatSelectedDateLabel(selectedDate);
  const selectedDateShortLabel = formatDateShortLabel(selectedDate);
  const identity = selectedLiabilities <= 0 ? "Financially Stable" : selectedNetWorth >= 10000000 ? "First Crore Builder" : "Future Focused";
  const futureMeChecks = buildFutureMeChecks(selectedNetWorth, selectedLiabilities, passiveCoverage, assets, events, selectedDate);
  const assetSummaries = buildAssetSummaries(assets, liabilities, selectedDate, today);
  const cashflowStream = buildCashflowStream(events, selectedDate, selectedNetWorth);
  const financialEvents = buildFinancialEventTimeline(events, selectedDate, today);

  return {
    activeAssetCount,
    assetSummaries,
    cashflowStream,
    chartMilestones,
    chartPoints,
    currentNetWorth,
    eventDateKeys: new Set(events.map((event) => toDateKey(event.date))),
    netWorthDelta: selectedNetWorth - currentNetWorth,
    financialEvents,
    futureMeChecks,
    futureMeInterpretation: `On this date, passive income covers approximately ${passiveCoverage}% of your current lifestyle expenses.`,
    growthPercent,
    hasFinancialContext: assets.length > 0 || liabilities.length > 0 || monthlySavings > 0,
    heroMilestones,
    identity,
    insights: buildInsights(
      todayPassiveIncome,
      passiveIncome,
      passiveCoverage,
      selectedLiabilities,
      selectedNetWorth,
      events,
      selectedDate,
      today,
    ),
    journey: buildJourney(assets, liabilities, chartMilestones, chartPoints, events, selectedMonths, today),
    liquidCash,
    narrative: `If your current plan continues, your wealth could grow from ${formatWealthCurrency(currentNetWorth)} today to ${formatLargeCurrency(selectedNetWorth)} on ${selectedDateLabel}.`,
    nextMilestone: {
      countdown:
        nextMilestone.date <= today
          ? "Available now"
          : `${Math.max(1, daysBetween(today, nextMilestone.date))} days remaining`,
      detail: `Next milestone: ${nextMilestone.label} unlocks ${formatWealthCurrency(nextMilestone.amount)}.`,
      label: nextMilestone.label,
      value: `${formatWealthCurrency(nextMilestone.amount)} ${nextMilestone.kind === "payment" ? "scheduled" : "unlocked"}`,
    },
    passiveIncome,
    selectedDate,
    selectedDateLabel,
    selectedDateShortLabel,
    selectedNetWorth,
    today,
    upcomingEvents: futureEvents,
  };
}

function buildCalendarEvents(assets: CalendarAsset[], liabilities: CalendarLiability[], today: Date) {
  const events: CalendarEvent[] = [];

  for (const asset of assets) {
    const maturityDateValue = metadataString(asset.metadata, "maturity_date");
    const maturityDate = maturityDateValue ? parseDate(maturityDateValue) : null;
    appendIncomeEventsForAsset(asset, today, maturityDate, events);

    if (maturityDateValue) {
      const date = parseDate(maturityDateValue);
      events.push({
        amount: toNumber(asset.value),
        assetCategory: asset.category,
        date,
        detail: `${asset.label} matures`,
        kind: "maturity",
        label: `${asset.label} matures`,
        monthOffset: Math.max(0, monthsBetween(today, date)),
      });
    }
  }

  for (const liability of liabilities) {
    if (liability.monthly_emi) {
      const paymentDate = addMonths(today, 1);
      events.push({
        amount: toNumber(liability.monthly_emi),
        assetCategory: liability.category ?? "LOAN",
        date: paymentDate,
        detail: `${liability.label} EMI payment`,
        kind: "payment",
        label: `${liability.label} EMI`,
        monthOffset: 1,
      });
    }
    if (liability.remaining_months) {
      const payoffDate = addMonths(today, toNumber(liability.remaining_months));
      events.push({
        amount: toNumber(liability.balance),
        assetCategory: liability.category ?? "LOAN",
        date: payoffDate,
        detail: `${liability.label} completion`,
        kind: "payoff",
        label: `${liability.label} completed`,
        monthOffset: Math.max(0, monthsBetween(today, payoffDate)),
      });
    }
  }

  return events.sort((left, right) => left.date.getTime() - right.date.getTime()).slice(0, 24);
}

function appendIncomeEventsForAsset(
  asset: CalendarAsset,
  today: Date,
  maturityDate: Date | null,
  events: CalendarEvent[],
) {
  const periodicProfit = monthlyPassiveIncome(asset);
  if (!periodicProfit) {
    return;
  }

  const interval = payoutMonths(asset);
  let payoutDate = addMonths(today, interval);
  let added = 0;

  while (added < 6) {
    if (payoutDate <= today) {
      payoutDate = addMonths(payoutDate, interval);
      continue;
    }
    if (maturityDate && payoutDate > maturityDate) {
      break;
    }

    events.push({
      amount: periodicProfit,
      assetCategory: asset.category,
      date: payoutDate,
      detail: `${asset.label} ${payoutLabel(asset).toLowerCase()} profit`,
      kind: "income",
      label: `${asset.label} profit`,
      monthOffset: monthsBetween(today, payoutDate),
    });
    payoutDate = addMonths(payoutDate, interval);
    added += 1;
  }
}

function buildFinancialEventTimeline(events: CalendarEvent[], _selectedDate: Date, today: Date): FinancialEventRow[] {
  return events
    .filter((event) => event.date >= today)
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map((event) => {
      const dayDiff = daysBetween(today, event.date);
      let status: FinancialEventRow["status"] = "ahead";
      let statusLabel = `In ${dayDiff} days`;

      if (dayDiff === 0) {
        status = "today";
        statusLabel = "Today";
      }

      const relativeLabel = formatRelativeTimeFromToday(dayDiff);

      return {
        amount: formatWealthCurrency(event.amount),
        assetCategory: event.assetCategory,
        dateLabel: formatDateShortLabel(event.date),
        detail: event.detail,
        icon: financialEventIcon(event.kind, event.assetCategory),
        kind: event.kind,
        label: event.label,
        relativeLabel,
        status,
        statusLabel,
      };
    });
}

function formatRelativeTimeFromToday(dayDiff: number) {
  if (dayDiff <= 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Tomorrow";
  }
  if (dayDiff < 7) {
    return `${dayDiff} days later`;
  }
  if (dayDiff < 14) {
    return "1 week later";
  }
  if (dayDiff < 21) {
    return "2 weeks later";
  }
  if (dayDiff < 28) {
    return "3 weeks later";
  }

  const months = Math.max(1, Math.round(dayDiff / 30));
  if (dayDiff < 365) {
    return months === 1 ? "1 month later" : `${months} months later`;
  }

  const years = Math.max(1, Math.round(dayDiff / 365));
  return years === 1 ? "1 year later" : `${years} years later`;
}

function financialEventIcon(kind: CalendarEvent["kind"], assetCategory: string) {
  if (kind === "maturity") {
    return "◆";
  }
  if (kind === "payoff") {
    return "✓";
  }
  if (kind === "payment") {
    return "⇢";
  }

  const category = assetCategory.toUpperCase();
  if (category === "DPS") {
    return "◎";
  }
  if (category === "SANCHAYAPATRA") {
    return "◈";
  }
  if (category === "DEPOSIT" || category === "FDR") {
    return "▣";
  }
  if (category === "LOAN" || category === "LIABILITY") {
    return "↘";
  }

  return "↗";
}

function matchesAssetTypeFilter(assetCategory: string, filter: AssetTypeFilter) {
  return normalizeAssetTypeFilterKey(assetCategory) === filter;
}

function normalizeAssetTypeFilterKey(assetCategory: string): AssetTypeFilter | "other" {
  const category = assetCategory.toUpperCase();
  if (category === "DEPOSIT" || category === "FDR") {
    return "deposit";
  }
  if (category === "DPS") {
    return "dps";
  }
  if (category === "SANCHAYAPATRA") {
    return "sanchayapatra";
  }
  if (category === "LOAN" || category === "LIABILITY") {
    return "loan";
  }
  return "other";
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return value == null ? "" : String(value);
}

function monthlyPassiveIncome(asset: CalendarAsset) {
  const stored = asset.metadata.periodic_profit ?? asset.metadata.monthly_profit;
  if (stored) {
    return toNumber(stored);
  }
  const distribution = metadataString(asset.metadata, "profit_distribution") || "monthly";
  const divisor = distribution === "quarterly" ? 3 : distribution === "yearly" ? 12 : distribution === "maturity" ? 0 : 1;
  if (!divisor || !isIncomeAsset(asset)) {
    return 0;
  }
  const amount = Number(asset.value);
  const rate = Number(asset.metadata.interest_rate || (asset.category === "SANCHAYAPATRA" ? 11.52 : 9));
  if (!amount || !rate) {
    return 0;
  }
  return Math.round((amount * rate) / 1200);
}

function payoutLabel(asset: CalendarAsset) {
  const distribution = metadataString(asset.metadata, "profit_distribution") || "monthly";
  if (distribution === "quarterly") {
    return "Quarterly";
  }
  if (distribution === "yearly") {
    return "Yearly";
  }
  return "Monthly";
}

function payoutMonths(asset: CalendarAsset) {
  const distribution = metadataString(asset.metadata, "profit_distribution") || "monthly";
  if (distribution === "quarterly") {
    return 3;
  }
  if (distribution === "yearly") {
    return 12;
  }
  return 1;
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumNumbers(values: unknown[]) {
  return values.reduce<number>((total, value) => total + toNumber(value), 0);
}

function isIncomeAsset(asset: CalendarAsset) {
  return ["DEPOSIT", "DPS", "SANCHAYAPATRA"].includes(asset.category.toUpperCase());
}

function isLiquidAsset(asset: CalendarAsset) {
  const category = asset.category.toUpperCase();
  return category === "CASH" || category === "BANK" || category === "SAVINGS";
}

function growthRateForAsset(asset: CalendarAsset) {
  const metadataRate = toNumber(asset.metadata.interest_rate ?? asset.metadata.expected_return);
  if (metadataRate > 0) {
    return metadataRate / 100;
  }
  const category = asset.category.toUpperCase();
  if (category === "STOCK") {
    return 0.12;
  }
  if (category === "DPS" || category === "SANCHAYAPATRA") {
    return 0.105;
  }
  if (category === "DEPOSIT") {
    return 0.09;
  }
  return 0.04;
}

function projectAssets(assets: CalendarAsset[], monthlySavings: number, months: number) {
  const assetValue = assets.reduce((total, asset) => {
    const value = toNumber(asset.value);
    return total + value * (1 + growthRateForAsset(asset) * (months / 12));
  }, 0);
  const savingsGrowth = monthlySavings * months * (1 + 0.06 * (months / 24));
  return Math.round(assetValue + savingsGrowth);
}

function projectLiabilities(liabilities: CalendarLiability[], months: number) {
  return Math.round(
    liabilities.reduce((total, liability) => {
      const balance = toNumber(liability.balance);
      const emi = toNumber(liability.monthly_emi);
      const remainingMonths = toNumber(liability.remaining_months);
      if (remainingMonths > 0) {
        return total + (months >= remainingMonths ? 0 : balance * (1 - months / remainingMonths));
      }
      if (emi > 0) {
        return total + Math.max(0, balance - emi * months);
      }
      return total + balance;
    }, 0),
  );
}

function buildProjectionPoints(
  assets: CalendarAsset[],
  liabilities: CalendarLiability[],
  monthlySavings: number,
  maxMonths: number,
  today: Date,
) {
  const pointCount = 6;
  return Array.from({ length: pointCount }, (_, index) => {
    const month = Math.round((maxMonths / (pointCount - 1)) * index);
    const assetsValue = projectAssets(assets, monthlySavings, month);
    const liabilitiesValue = projectLiabilities(liabilities, month);
    return {
      assets: assetsValue,
      liabilities: liabilitiesValue,
      label: String(today.getFullYear() + Math.round(month / 12)),
      month,
      netWorth: assetsValue - liabilitiesValue,
      x: CHART_PADDING + ((CHART_WIDTH - CHART_PADDING * 2) / (pointCount - 1)) * index,
    };
  });
}

function buildChartPath(points: ProjectionPoint[], key: "assets" | "liabilities" | "netWorth", maxValue: number) {
  return points
    .map((point, index) => {
      const y = chartY(point[key], maxValue);
      return `${index === 0 ? "M" : "L"} ${point.x} ${y}`;
    })
    .join(" ");
}

function chartY(value: number, maxValue: number) {
  const usableHeight = CHART_HEIGHT - CHART_PADDING * 2;
  return CHART_HEIGHT - CHART_PADDING - (Math.max(0, value) / maxValue) * usableHeight;
}

function nearestPoint(points: ProjectionPoint[], selectedMonth: number) {
  return points.reduce((nearest, point) =>
    Math.abs(point.month - selectedMonth) < Math.abs(nearest.month - selectedMonth) ? point : nearest,
  );
}

function buildChartMilestones(points: ProjectionPoint[]) {
  const milestones = [
    { label: "First 10 Lakh", value: 1000000 },
    { label: "First 50 Lakh", value: 5000000 },
    { label: "First Crore", value: 10000000 },
  ];
  const maxValue = Math.max(...points.map((point) => point.netWorth), 1);

  return milestones.flatMap((milestone) => {
    const point = points.find((candidate) => candidate.netWorth >= milestone.value);
    return point
      ? [
          {
            label: milestone.label,
            month: point.month,
            x: point.x,
            y: chartY(point.netWorth, maxValue),
          },
        ]
      : [];
  });
}

function buildHeroMilestones(events: CalendarEvent[], today: Date, selectedDate: Date) {
  const milestones: Array<{ dateLabel: string; label: string }> = [];

  for (const event of events.filter((candidate) => candidate.date > today && candidate.date < selectedDate)) {
    const overlapsExistingMarker = milestones.some((milestone) => milestone.label === formatHeroMilestoneLabel(event));

    if (!overlapsExistingMarker) {
      milestones.push({
        dateLabel: formatDateLabel(event.date.toISOString()),
        label: formatHeroMilestoneLabel(event),
      });
    }

    if (milestones.length === 2) {
      break;
    }
  }

  return milestones;
}

function formatHeroMilestoneLabel(event: CalendarEvent) {
  if (event.kind === "payment") {
    return "EMI";
  }
  if (event.kind === "income") {
    return "Profit";
  }
  if (event.kind === "payoff") {
    return "Debt free";
  }
  return event.label.replace(" matures", "");
}

function fallbackMilestone(selectedDate: Date, selectedNetWorth: number): CalendarEvent {
  return {
    amount: Math.max(0, selectedNetWorth),
    assetCategory: "MILESTONE",
    date: selectedDate,
    detail: "Projected future net worth",
    kind: "milestone",
    label: "Future Snapshot",
    monthOffset: 0,
  };
}

function buildFutureMeChecks(
  selectedNetWorth: number,
  selectedLiabilities: number,
  passiveCoverage: number,
  assets: CalendarAsset[],
  events: CalendarEvent[],
  selectedDate: Date,
) {
  const completedMaturities = events.filter((event) => event.kind === "maturity" && event.date <= selectedDate).length;
  const activeAssets = countActiveAssetsOnDate(assets, selectedDate);
  return [
    selectedLiabilities <= 0 ? "Debt free on this date" : `${formatWealthCurrency(selectedLiabilities)} debt remaining`,
    selectedNetWorth >= 10000000 ? "First crore achieved" : "First crore still ahead",
    `Passive income covers ${passiveCoverage}% of lifestyle`,
    `${completedMaturities} maturities completed by this date`,
    `${activeAssets} assets working for you`,
  ];
}

function buildAssetSummaries(assets: CalendarAsset[], liabilities: CalendarLiability[], selectedDate: Date, today: Date) {
  const fdrAssets = assets.filter((asset) => asset.category.toUpperCase() === "DEPOSIT");
  const activeFdrs = fdrAssets.filter((asset) => isAssetActiveOnDate(asset, selectedDate));
  const dpsAssets = assets.filter((asset) => asset.category.toUpperCase() === "DPS");
  const runningDps = dpsAssets.filter((asset) => isAssetActiveOnDate(asset, selectedDate));
  const sanchayapatraAssets = assets.filter((asset) => asset.category.toUpperCase() === "SANCHAYAPATRA");
  const maturedSanchayapatra = sanchayapatraAssets.filter((asset) => !isAssetActiveOnDate(asset, selectedDate));
  const incomeSanchayapatra = sanchayapatraAssets.filter((asset) => isAssetGeneratingIncomeOnDate(asset, selectedDate));
  const monthlyIncome = incomeSanchayapatra.reduce((total, asset) => total + monthlyPassiveIncome(asset), 0);
  const loansCompleted = liabilities.length > 0 && liabilities.every((liability) => isLoanCompletedOnDate(liability, selectedDate, today));

  return [
    {
      label: "FDR",
      primary: `${activeFdrs.length} active`,
      secondary:
        activeFdrs.length > 0
          ? `${fdrAssets.length - activeFdrs.length} matured by this date`
          : fdrAssets.length > 0
            ? "All FDRs matured before this date"
            : "No FDR saved yet",
    },
    {
      label: "DPS",
      primary: runningDps.length > 0 ? `${runningDps.length} still running` : "Completed or not started",
      secondary:
        runningDps.length > 0 ? "Disciplined savings still compounding" : dpsAssets.length > 0 ? "DPS journey completed" : "Add a DPS to build rhythm",
    },
    {
      label: "Sanchayapatra",
      primary:
        incomeSanchayapatra.length > 0
          ? `${incomeSanchayapatra.length} generating income`
          : maturedSanchayapatra.length > 0
            ? `${maturedSanchayapatra.length} matured`
            : sanchayapatraAssets.length > 0
              ? `${sanchayapatraAssets.length} held`
              : "None saved",
      secondary:
        monthlyIncome > 0
          ? `${formatWealthCurrency(monthlyIncome)} / month`
          : maturedSanchayapatra.length > 0
            ? "Income ended after maturity"
            : "No income stream on this date",
    },
    {
      label: "Loan",
      primary: liabilities.length === 0 ? "No loans saved" : loansCompleted ? "Completed" : `${liabilities.length} still active`,
      secondary:
        liabilities.length === 0
          ? "Debt-free picture"
          : loansCompleted
            ? "Debt cleared before this date"
            : `Payoff projected after ${formatDateShortLabel(selectedDate)}`,
    },
  ];
}

function buildCashflowStream(events: CalendarEvent[], selectedDate: Date, selectedNetWorth: number): CashflowDisplayEvent[] {
  const windowStart = addDays(selectedDate, -30);
  const windowEnd = addDays(selectedDate, 30);
  const inWindow = events
    .filter((event) => event.date >= windowStart && event.date <= windowEnd)
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const stream = (inWindow.length > 0 ? inWindow : [...events].sort((left, right) => Math.abs(daysBetween(left.date, selectedDate)) - Math.abs(daysBetween(right.date, selectedDate))).slice(0, 5)).map(
    (event) => enrichCashflowEvent(event, selectedDate),
  );

  if (stream.length > 0) {
    return stream;
  }

  return [enrichCashflowEvent(fallbackMilestone(selectedDate, selectedNetWorth), selectedDate)];
}

function buildJourney(
  assets: CalendarAsset[],
  liabilities: CalendarLiability[],
  chartMilestones: Array<{ label: string; month: number }>,
  chartPoints: ProjectionPoint[],
  events: CalendarEvent[],
  selectedMonths: number,
  today: Date,
) {
  const firstMaturity = events.find((event) => event.kind === "maturity");
  const payoff = events.find((event) => event.kind === "payoff");
  const journey = [
    { label: assets.length ? "Snapshot Started" : "Plan Started", month: 0 },
    { label: "First 1 Lakh Saved", month: findMonthWhenNetWorthReaches(chartPoints, 100000) },
    { label: "First 10 Lakh Achieved", month: findMilestoneMonth(chartMilestones, "First 10 Lakh") },
    { label: "FDR Matured", month: firstMaturity?.monthOffset ?? 999 },
    { label: "Loan Completed", month: payoff?.monthOffset ?? 999 },
    { label: "First Crore Achieved", month: findMilestoneMonth(chartMilestones, "First Crore") },
  ];

  return journey.map((milestone) => {
    const status = resolveJourneyStatus(milestone.month, selectedMonths);
    return {
      ...milestone,
      dateLabel: milestone.month === 999 ? "Future" : formatDateLabel(addMonths(today, milestone.month).toISOString()),
      status,
      statusIcon: journeyStatusIcon(status),
      statusLabel: journeyStatusLabel(status, milestone.month, selectedMonths, today),
    };
  });
}

function buildInsights(
  todayPassiveIncome: number,
  passiveIncome: number,
  passiveCoverage: number,
  selectedLiabilities: number,
  selectedNetWorth: number,
  events: CalendarEvent[],
  selectedDate: Date,
  today: Date,
) {
  const payoff = events.find((event) => event.kind === "payoff");
  const maturitiesBefore = events.filter((event) => event.kind === "maturity" && event.date <= selectedDate);
  const lastMaturity = maturitiesBefore.at(-1);
  const insights: string[] = [];

  if (todayPassiveIncome > 0 && passiveIncome >= todayPassiveIncome * 1.8) {
    insights.push("By this date your passive income has roughly doubled from today.");
  } else if (passiveIncome > 0) {
    insights.push(`On this date passive income is projected at ${formatWealthCurrency(passiveIncome)} per month.`);
  }

  if (lastMaturity) {
    const monthsAgo = monthsBetween(lastMaturity.date, selectedDate);
    insights.push(
      monthsAgo <= 0
        ? `An FDR maturity occurs on ${formatDateShortLabel(selectedDate)}.`
        : `Your most recent FDR maturity occurred ${monthsAgo} month${monthsAgo === 1 ? "" : "s"} before this date.`,
    );
  }

  if (payoff) {
    if (payoff.date <= selectedDate) {
      insights.push(`You became debt free on ${formatDateShortLabel(payoff.date)}.`);
    } else {
      const monthsUntil = monthsBetween(selectedDate, payoff.date);
      insights.push(`You are projected to become debt free in ${monthsUntil} month${monthsUntil === 1 ? "" : "s"} from this date.`);
    }
  } else if (selectedLiabilities <= 0) {
    insights.push("On this date you are projected to carry no remaining debt.");
  } else {
    insights.push(`Debt remaining on this date: ${formatWealthCurrency(selectedLiabilities)}.`);
  }

  if (selectedNetWorth >= 10000000) {
    insights.push("You cross the first crore milestone by this date.");
  } else {
    insights.push(`Projected net worth on this date: ${formatLargeCurrency(selectedNetWorth)}.`);
  }

  insights.push(`Passive income covers about ${passiveCoverage}% of your current lifestyle on this date.`);

  return insights.slice(0, 5);
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function monthsBetween(startDate: Date, endDate: Date) {
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
}

function formatLargeCurrency(value: number) {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 10000000) {
    return `BDT ${(value / 10000000).toFixed(2)} Crore`;
  }
  if (absoluteValue >= 100000) {
    return `BDT ${(value / 100000).toFixed(2)} Lakh`;
  }
  return formatWealthCurrency(value);
}

function findMilestoneMonth(chartMilestones: Array<{ label: string; month: number }>, label: string) {
  return chartMilestones.find((milestone) => milestone.label === label)?.month ?? 999;
}

function findMonthWhenNetWorthReaches(points: ProjectionPoint[], value: number) {
  const point = points.find((candidate) => candidate.netWorth >= value);
  return point?.month ?? 999;
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function clampDate(date: Date, minDate: Date, maxDate: Date) {
  const normalized = startOfDay(date);
  if (normalized < minDate) {
    return minDate;
  }
  if (normalized > maxDate) {
    return maxDate;
  }
  return normalized;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSelectedDateLabel(date: Date) {
  return date.toLocaleDateString("en-BD", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}

function formatDateShortLabel(date: Date) {
  return date.toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" });
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return startOfDay(nextDate);
}

function daysBetween(startDate: Date, endDate: Date) {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.round((startOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / millisecondsPerDay);
}

function countActiveAssetsOnDate(assets: CalendarAsset[], selectedDate: Date) {
  return assets.filter((asset) => isAssetActiveOnDate(asset, selectedDate)).length;
}

function isAssetActiveOnDate(asset: CalendarAsset, selectedDate: Date) {
  const maturityDate = metadataString(asset.metadata, "maturity_date");
  if (!maturityDate) {
    return true;
  }
  return parseDate(maturityDate) > selectedDate;
}

function isAssetGeneratingIncomeOnDate(asset: CalendarAsset, selectedDate: Date) {
  if (!isAssetActiveOnDate(asset, selectedDate)) {
    return false;
  }
  return monthlyPassiveIncome(asset) > 0;
}

function isLoanCompletedOnDate(liability: CalendarLiability, selectedDate: Date, today: Date) {
  const remainingMonths = toNumber(liability.remaining_months);
  if (remainingMonths <= 0) {
    return toNumber(liability.balance) <= 0;
  }
  return addMonths(today, remainingMonths) <= selectedDate;
}

function enrichCashflowEvent(event: CalendarEvent, selectedDate: Date): CashflowDisplayEvent {
  const dayDistance = daysBetween(selectedDate, event.date);
  let timingLabel = formatDateShortLabel(event.date);

  if (dayDistance === 0) {
    timingLabel = "Selected date";
  } else if (dayDistance < 0) {
    timingLabel = `${Math.abs(dayDistance)} days before`;
  } else {
    timingLabel = `${dayDistance} days after`;
  }

  return {
    ...event,
    isSelectedDate: dayDistance === 0,
    timingLabel,
  };
}

function resolveJourneyStatus(milestoneMonth: number, selectedMonths: number): JourneyStatus {
  if (milestoneMonth === 999) {
    return "future";
  }
  if (milestoneMonth <= selectedMonths) {
    return "achieved";
  }
  if (milestoneMonth <= selectedMonths + 12) {
    return "upcoming";
  }
  return "future";
}

function journeyStatusIcon(status: JourneyStatus) {
  if (status === "achieved") {
    return "✓";
  }
  if (status === "upcoming") {
    return "○";
  }
  return "◇";
}

function journeyStatusLabel(status: JourneyStatus, milestoneMonth: number, selectedMonths: number, today: Date) {
  if (status === "achieved") {
    return `Achieved · ${formatDateShortLabel(addMonths(today, milestoneMonth))}`;
  }
  if (status === "upcoming") {
    const monthsAway = milestoneMonth - selectedMonths;
    return `Upcoming · ${monthsAway} month${monthsAway === 1 ? "" : "s"} ahead`;
  }
  return "Still ahead";
}
