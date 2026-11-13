import { getPulsePresentationLanguage } from "@/features/market-pulse/market-pulse-presentation-language";
import { getTraderJourneyLanguage } from "@/lib/market/trader-journey-language";
import { formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { compatibleDisplayAction } from "@/lib/market/decision-action-compatibility";
import { breadthCoverageLabel, breadthDefinition } from "@/lib/market/breadth-presentation";
import { controllingReasonLabel, readinessLabel } from "@/lib/market/decision-presentation";
import type { BackendMarketPulseDto, BackendFocusStockDto, BackendMarketMoverDto, BackendMarketBriefingDto, PulseStoryHeadlineCode } from "@/lib/api/backend-api-types";
import { getMarketSession } from "@/lib/market/market-session-engine";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";
import type { AppLocale } from "@/lib/locale/app-locale";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { isCurrentIntradaySession } from "@/lib/market/market-session-engine";
import { sectorName } from "@/features/market-dashboard/terminal-copy";
import {
  getMarketPulseLanguage,
  type MarketPulseLeadershipCardKind,
} from "@/features/market-pulse/market-pulse-language";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";

import type {
  FocusStockModel,
  MarketAlertModel,
  MarketBriefingModel,
  MarketMoverModel,
  MarketMoversModel,
  MarketPulseModel,
  PulseBriefingChipModel,
  PulseChangeModel,
} from "@/features/market-pulse/types/market-pulse-types";

function mapBriefingTone(value: string): "positive" | "warning" | "info" | "negative" | "neutral" {
  if (value === "positive" || value === "warning" || value === "info" || value === "negative" || value === "neutral") {
    return value;
  }
  return "info";
}

function mapTone(value: string): "positive" | "warning" | "info" | "negative" {
  if (value === "positive" || value === "warning" || value === "info" || value === "negative") {
    return value;
  }
  return "info";
}

function mapPriceTone(value: string): "positive" | "negative" | "neutral" {
  if (value === "positive" || value === "negative") {
    return value;
  }
  return "neutral";
}

function mapFocusStock(stock: BackendFocusStockDto): FocusStockModel {
  const pair = stock.public_comparison;
  const verifiedTransition = pair?.status === "CHANGED" && pair.current_action === stock.recommendation && stock.recommendation === "POTENTIAL_BUY" &&
    (stock.focus_label !== "Signal Upgrade" || ["WAIT", "HOLD"].includes(pair.previous_action ?? ""));
  const legacyTransition = ["Signal Upgrade", "New BUY Setup"].includes(stock.focus_label) && !verifiedTransition;
  return {
    entryApplicability: stock.entry_applicability,
    measuredFacts: stock.measured_facts,
    displayQuote: stock.display_quote,
    entryRiskLabel: stock.entry_risk_label,
    rank: stock.rank,
    recommendation: compatibleDisplayAction({ display_action: stock.recommendation, decision_taxonomy_version: stock.decision_taxonomy_version ?? undefined }) ?? undefined,
    readiness: stock.entry_readiness,
    controllingReasonCode: stock.controlling_reason_code,
    controllingReason: stock.controlling_reason,
    decisionDate: stock.decision_session_date,
    watchLevel: stock.watch_level,
    actionableTrigger: stock.actionable_trigger,
    stockId: stock.stock_id,
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    href: buildStockDetailPath(stock.exchange, stock.symbol),
    pulseScore: stock.pulse_score,
    scoreBreakdown: {
      trend: stock.score_breakdown.trend,
      momentum: stock.score_breakdown.momentum,
      volume: stock.score_breakdown.volume,
      signalBoost: stock.score_breakdown.signal_boost,
      riskPenalty: stock.score_breakdown.risk_penalty,
      total: stock.score_breakdown.total,
      contributors: stock.score_breakdown.contributors,
      band: stock.score_breakdown.band,
    },
    focusLabel: legacyTransition ? stock.recommendation === "POTENTIAL_BUY" ? "Potential Buy Setup" : "Watch Closely" : stock.focus_label,
    labelTone: mapTone(stock.label_tone),
    // Legacy transition badges own their first why-here slot (build_why_here).
    // Drop that slot with an unverified badge; never parse a sentence to infer history.
    whyHere: legacyTransition ? stock.why_here.slice(1) : stock.why_here,
    trigger: stock.trigger,
    actionSummary: stock.action_summary,
    latestPrice: stock.display_quote ? formatNumber(stock.display_quote.current_price) : stock.latest_price,
    priceChangePercent: stock.display_quote ? formatPercent(stock.display_quote.price_change_percent) : stock.price_change_percent,
    priceTone: mapPriceTone(stock.price_tone),
    sparklinePoints: stock.sparkline_points,
  };
}

function mapChange(change: BackendMarketPulseDto["changes"][number]): PulseChangeModel {
  return {
    id: change.id,
    timeLabel: change.time_label,
    type: change.change_type,
    title: change.title,
    description: change.description,
    badge: change.badge,
    badgeTone: mapTone(change.badge_tone),
    href:
      change.symbol && change.exchange ? buildStockDetailPath(change.exchange, change.symbol) : undefined,
  };
}

function mapAlertSignificance(value: string): "HIGH" | "MEDIUM" | "WATCH" {
  if (value === "HIGH" || value === "MEDIUM" || value === "WATCH") {
    return value;
  }
  return "WATCH";
}

function mapAlert(alert: BackendMarketPulseDto["alerts"][number]): MarketAlertModel {
  return {
    id: alert.id,
    type: alert.alert_type,
    eventTitle: alert.event_title,
    eventExplanation: alert.event_explanation,
    whyItMatters: alert.why_it_matters,
    metricLabel: alert.metric_label,
    significance: mapAlertSignificance(alert.significance),
    timeLabel: alert.time_label,
    symbol: alert.symbol,
    latestPrice: alert.latest_price,
    priceChangePercent: alert.price_change_percent,
    priceTone: alert.price_tone ? mapPriceTone(alert.price_tone) : null,
    href:
      alert.symbol && alert.exchange ? buildStockDetailPath(alert.exchange, alert.symbol) : alert.alert_type === "sector-rotation" ? "/scanner" : null,
  };
}

function buildBriefingChips(dto: BackendMarketPulseDto): PulseBriefingChipModel[] {
  const chips: PulseBriefingChipModel[] = [];

  if (dto.hero.session_label) {
    chips.push({
      id: "session",
      label: "Market",
      value: dto.hero.session_label.toUpperCase(),
      tone: "info",
    });
  }

  if (dto.alerts.length > 0) {
    chips.push({
      id: "active-alerts",
      label: "Active Alerts",
      value: String(dto.alerts.length),
      tone: "warning",
    });
  }

  const sectorAlert = dto.alerts.find((alert) => alert.alert_type === "sector-rotation");
  if (sectorAlert?.symbol) {
    chips.push({
      id: "sector-focus",
      label: "Sector In Focus",
      value: sectorAlert.symbol,
      tone: "info",
    });
  } else if (dto.briefing?.money_flow.inflows[0]) {
    chips.push({
      id: "sector-focus",
      label: "Sector In Focus",
      value: dto.briefing.money_flow.inflows[0].sector,
      tone: "info",
    });
  }

  if (dto.hero.focus_count > 0) {
    chips.push({
      id: "in-focus",
      label: "In Focus",
      value: String(dto.hero.focus_count),
      tone: "primary",
    });
  }

  return chips.slice(0, 4);
}

function mapBriefing(briefing: BackendMarketBriefingDto): MarketBriefingModel {
  return {
    breadth: briefing.breadth,
    story: {
      headlineCode: briefing.story.headline_code,
      sectorCount: briefing.story.sector_count,
      headline: briefing.story.headline,
      explanation: briefing.story.explanation,
      tone: mapBriefingTone(briefing.story.tone),
      metrics: briefing.story.metrics.map((metric) => ({
        label: metric.label,
        value: metric.value,
        subValue: metric.sub_value,
        tone: mapBriefingTone(metric.tone),
      })),
    },
    state: {
      excludedSectorCount: briefing.state.excluded_sector_count ?? 0,
      dimensions: briefing.state.dimensions.map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
        value: dimension.value,
        tone: mapBriefingTone(dimension.tone),
      })),
      overallLabel: briefing.state.overall_label,
      overallTone: mapBriefingTone(briefing.state.overall_tone),
    },
    moneyFlow: {
      inflows: briefing.money_flow.inflows.map((sector) => ({
        sector: sector.sector,
        changeLabel: sector.change_label,
        strength: sector.strength,
        tone: sector.tone === "negative" ? "negative" : "positive",
      })),
      outflows: briefing.money_flow.outflows.map((sector) => ({
        sector: sector.sector,
        changeLabel: sector.change_label,
        strength: sector.strength,
        tone: sector.tone === "negative" ? "negative" : "positive",
      })),
    },
    opportunityScore: {
      score: briefing.opportunity_score.score,
      label: briefing.opportunity_score.label,
      history: briefing.opportunity_score.history,
      previousSession: briefing.opportunity_score.previous_session ?? null,
      weeklyAverage: briefing.opportunity_score.weekly_average ?? null,
      trendLabel: briefing.opportunity_score.trend_label ?? null,
    },
    playbook: {
      question: briefing.playbook.question,
      items: briefing.playbook.items.map((item) => ({
        profile: item.profile,
        summary: item.summary,
        guidance: item.guidance ?? "",
        tone: mapBriefingTone(item.tone),
      })),
    },
    highPriority: briefing.high_priority
      ? {
          symbol: briefing.high_priority.symbol,
          name: briefing.high_priority.name,
          exchange: briefing.high_priority.exchange,
          href: buildStockDetailPath(briefing.high_priority.exchange, briefing.high_priority.symbol),
          reason: briefing.high_priority.reason,
          triggerLevel: briefing.high_priority.trigger_level,
          metricLabel: briefing.high_priority.metric_label,
          latestPrice: briefing.high_priority.latest_price,
          priceChangePercent: briefing.high_priority.price_change_percent,
          priceTone: mapPriceTone(briefing.high_priority.price_tone),
          sparklinePoints: briefing.high_priority.sparkline_points,
        }
      : null,
    leadership: {
      cards: briefing.leadership.cards.map((card) => ({
        kind: card.kind,
        title: card.title,
        name: card.name,
        detail: card.detail,
        subtitle: card.subtitle,
        tone: mapBriefingTone(card.tone),
        href: card.href,
        sparklinePoints: card.sparkline_points,
      })),
      freshBuySignals: briefing.leadership.fresh_buy_signals,
      narrative: briefing.leadership.narrative ?? "",
      freshNewCount: briefing.leadership.fresh_new_count ?? 0,
      freshUpgradedCount: briefing.leadership.fresh_upgraded_count ?? 0,
    },
    summary: {
      text: briefing.summary.text,
      tone: mapBriefingTone(briefing.summary.tone),
      highlights: (briefing.summary.highlights ?? []).map((item) => ({
        label: item.label,
        value: item.value,
        tone: mapBriefingTone(item.tone),
      })),
      tradingEnvironment: briefing.summary.trading_environment
        ? {
            signals: briefing.summary.trading_environment.signals.map((signal) => ({
              text: signal.text,
              tone: mapBriefingTone(signal.tone),
            })),
            overallLabel: briefing.summary.trading_environment.overall_label,
            overallTone: mapBriefingTone(briefing.summary.trading_environment.overall_tone),
          }
        : null,
    },
  };
}

function mapLeadershipCardKind(kind: string): MarketPulseLeadershipCardKind | null {
  if (kind === "sector" || kind === "accumulation") {
    return kind;
  }
  if (kind === "stock") {
    return kind;
  }
  return null;
}

function localizeEmptyMessage(model: MarketPulseModel, locale: AppLocale) {
  if (locale === "en" || !model.emptyMessage) {
    return model.emptyMessage;
  }

  const language = getMarketPulseLanguage(locale);
  if (model.emptyState === "waiting-snapshot") return language.states.emptyWaitingSnapshot;
  if (model.emptyState === "insufficient-history") return language.states.emptyInsufficientHistory;
  if (model.emptyState === "no-attention") return language.states.emptyNoAttention;
  return model.emptyMessage;
}

function sectorLeadershipContext(briefing: MarketBriefingModel | null, locale: AppLocale) {
  const scope = briefing?.state.dimensions.find(item => item.key === "leadership")?.value;
  const unavailable = ["SECTOR_UNAVAILABLE", "BREADTH_UNAVAILABLE"].includes(briefing?.story.headlineCode ?? "");
  const sector = unavailable ? undefined : briefing?.moneyFlow.inflows[0]?.sector;
  const known = !unavailable && (briefing?.story.headlineCode === "NO_POSITIVE_SECTOR" || Boolean(briefing?.moneyFlow.outflows.length) || scope !== "Unavailable" && (briefing?.breadth ? briefing.breadth.known_count > 0 : scope !== "Unknown"));
  const value = sector ? scope === "Broad" ? "Broad" : "Narrow" : known ? "No positive leader" : "Unavailable";
  const line = !sector
    ? known ? locale === "bn" ? "কোনো খাতে ইতিবাচক দামের অগ্রগতি নেই।" : "No positive sector leader is present in this session."
      : locale === "bn" ? "খাতের অগ্রগতির তথ্য পাওয়া যায়নি।" : "Sector leadership data is unavailable."
    : locale === "bn" ? value === "Broad" ? `বিভিন্ন খাতে দামের অগ্রগতি ছড়িয়ে আছে, এগিয়ে ${sectorName(sector, locale)}।` : `${sectorName(sector, locale)} খাতে দামের অগ্রগতি সীমিত।`
      : value === "Broad" ? `Sector leadership is broad, led by ${sector}.` : `Sector leadership is concentrated in ${sector}.`;
  return { sector, value, line };
}

function storyHeadlineFacts(briefing: MarketBriefingModel, leadership: ReturnType<typeof sectorLeadershipContext>): { code: PulseStoryHeadlineCode; count: number | null } {
  if (briefing.breadth?.known_count === 0) return { code: "BREADTH_UNAVAILABLE", count: null };
  const count = Number.isInteger(briefing.story.sectorCount) && briefing.story.sectorCount! > 0 ? briefing.story.sectorCount! : null;
  switch (briefing.story.headlineCode) {
    case "STRENGTH_SECTORS": return count && briefing.moneyFlow.inflows.length ? { code: "STRENGTH_SECTORS", count } : { code: "STRENGTH_STOCKS", count: null };
    case "WEAKNESS_SECTORS": return count && briefing.moneyFlow.outflows.length ? { code: "WEAKNESS_SECTORS", count } : { code: "WEAKNESS_STOCKS", count: null };
    case "STRENGTH_STOCKS": case "WEAKNESS_STOCKS": case "BREADTH_UNAVAILABLE": case "SECTOR_UNAVAILABLE": case "NO_POSITIVE_SECTOR":
      return { code: briefing.story.headlineCode, count: null };
  }
  // Older payloads have no typed headline facts. Keep their measured direction,
  // but never infer a numerical sector count from prose or a truncated list.
  if (!briefing.story.headlineCode && briefing.story.tone === "positive") return { code: "STRENGTH_STOCKS", count: null };
  if (!briefing.story.headlineCode && briefing.story.tone === "negative") return { code: "WEAKNESS_STOCKS", count: null };
  return { code: leadership.sector ? "MIXED_SECTORS" : leadership.value === "No positive leader" ? "NO_POSITIVE_SECTOR" : "SECTOR_UNAVAILABLE", count: null };
}

export function applyMarketPulseLocalization(model: MarketPulseModel, locale: AppLocale): MarketPulseModel {
  const leadership = sectorLeadershipContext(model.briefing, locale);
  if (model.briefing) {
    const briefing = model.briefing;
    const headline = storyHeadlineFacts(briefing, leadership);
    const leadershipSignals = new Set(["Sector price leadership is broad", "Leadership remains concentrated", "No positive sector leader", "Sector leadership unavailable"]);
    model = { ...model, briefing: { ...briefing,
      story: { ...briefing.story, headline: getMarketPulseLanguage(locale).briefing.storyHeadline(headline.code, headline.count), explanation: [...briefing.story.explanation.split("\n").slice(0,1), leadership.line].join("\n") },
      state: { ...briefing.state, dimensions: briefing.state.dimensions.map(item => item.key === "leadership" ? { ...item, value: leadership.value, tone: leadership.sector ? item.tone : "neutral" } : item) },
      leadership: { ...briefing.leadership, cards: briefing.leadership.cards.filter(card => card.kind !== "sector" || Boolean(leadership.sector)), narrative: leadership.line },
      summary: { ...briefing.summary, text: [...briefing.summary.text.split("\n").slice(0,1), leadership.line].join("\n"),
        highlights: briefing.summary.highlights.map(item => item.label === "Leadership" ? { ...item, value: leadership.sector ? leadership.value : leadership.value === "No positive leader" ? (locale === "bn" ? "ইতিবাচক অগ্রগতি নেই" : "No positive leader") : (locale === "bn" ? "তথ্য নেই" : "Unavailable"), tone: leadership.sector ? item.tone : "neutral" } : item),
        tradingEnvironment: briefing.summary.tradingEnvironment ? { ...briefing.summary.tradingEnvironment, signals: briefing.summary.tradingEnvironment.signals.map(item => leadershipSignals.has(item.text) ? { ...item, text: leadership.line, tone: leadership.sector ? item.tone : "neutral" } : item) } : null,
      },
    } };
  }
  if (locale === "en") return model;

  const language = getMarketPulseLanguage(locale);
  const briefing = model.briefing;
  const sectors = leadership.sector ? [sectorName(leadership.sector, locale)] : [];
  const leadershipLine = leadership.line;
  const localizedBriefing = briefing
    ? {
        ...briefing,
        story: {
          ...briefing.story,
          explanation: language.briefing
            .storyExplanation(
              briefing.story.tone,
              briefing.moneyFlow.inflows[0] ? sectorName(briefing.moneyFlow.inflows[0].sector, locale) : null,
              briefing.moneyFlow.outflows[0] ? sectorName(briefing.moneyFlow.outflows[0].sector, locale) : null,
            )
            .slice(0, 1).concat(leadershipLine).join("\n"),
          metrics: briefing.story.metrics.map((metric) => ({
            ...metric,
            label: language.briefing.storyMetricLabel(metric.label),
          })),
        },
        state: {
          ...briefing.state,
          dimensions: briefing.state.dimensions.map((dimension) => ({
            ...dimension,
            label: language.briefing.stateDimensionLabel(dimension.key, dimension.label),
            value: language.briefing.stateDimensionValue(dimension.value),
          })),
          overallLabel: language.briefing.overallStateLabel(briefing.state.overallLabel),
        },
        opportunityScore: {
          ...briefing.opportunityScore,
          label: language.briefing.opportunityLabel(briefing.opportunityScore.score),
          trendLabel: briefing.opportunityScore.trendLabel
            ? language.briefing.opportunityTrendLabel(briefing.opportunityScore.trendLabel)
            : null,
        },
        moneyFlow: {
          ...briefing.moneyFlow,
          inflows: briefing.moneyFlow.inflows.map(row => ({ ...row, sector: sectorName(row.sector, locale) })),
          outflows: briefing.moneyFlow.outflows.map(row => ({ ...row, sector: sectorName(row.sector, locale) })),
        },
        leadership: {
          ...briefing.leadership,
          narrative: leadershipLine,
          cards: briefing.leadership.cards.map((card) => ({
            ...card,
            name: card.kind === "sector" ? sectorName(card.name, locale) : card.name,
            title: ({ sector: "দামে এগিয়ে থাকা খাত", stock: "দামের পরিবর্তনে এগিয়ে", accumulation: "আপেক্ষিক লেনদেনে এগিয়ে" } as Record<string, string>)[card.kind] ?? card.title,
            subtitle: language.leadership.cardSubtitle(mapLeadershipCardKind(card.kind), card.subtitle),
          })),
        },
        summary: {
          ...briefing.summary,
          text: language.summary
            .narrative(
              briefing.summary.tone,
              briefing.summary.tradingEnvironment?.overallLabel ?? "Selective Opportunity",
              sectors,
            )
            .slice(0, 1).concat(leadershipLine).join("\n"),
          tradingEnvironment: briefing.summary.tradingEnvironment
            ? {
                ...briefing.summary.tradingEnvironment,
                signals: briefing.summary.tradingEnvironment.signals.map((signal) => ({
                  ...signal,
                  text: language.summary.signal(signal.text),
                })),
              }
            : null,
        },
      }
    : null;

  const localizeFocusStock = (stock: FocusStockModel): FocusStockModel => ({
    ...stock,
    whyHere: stock.whyHere.map((reason) => language.focus.reason(reason, stock.focusLabel)),
    trigger: stock.actionableTrigger === false
      ? (locale === "bn" ? "অনুমোদিত entry trigger নেই" : "No permitted entry trigger")
      : language.focus.trigger(localizeEntryCondition(stock.trigger, locale) ?? stock.trigger),
    decisionContext: `${stock.recommendation ?? "—"} · ${readinessLabel(stock.readiness, locale)} · ${stock.decisionDate ?? "—"}`,
    controllingReason: controllingReasonLabel(stock.controllingReasonCode, stock.controllingReason ?? "", locale),
    actionSummary: language.focus.actionSummary(stock.actionSummary),
  });

  const qualityCount = model.dataQualityNote?.match(/^(\d+)/)?.[1];

  return {
    ...model,
    hero: {
      ...model.hero,
      attentionSubline: language.hero.subline,
      attentionHeadline: "সেশনের বাজারচিত্র",
    },
    sinceLastVisit: {
      ...model.sinceLastVisit,
      summaryLabel: language.sinceLastVisit.summary(
        model.sinceLastVisit.newChangesCount,
        model.sinceLastVisit.newFocusCount,
        model.sinceLastVisit.newAlertsCount,
      ),
    },
    briefing: localizedBriefing,
    focusStocks: model.focusStocks.map(localizeFocusStock),
    monitorCandidates: model.monitorCandidates.map(localizeFocusStock),
    alerts: model.alerts.map((alert) => ({
      ...alert,
      eventExplanation: language.alerts.eventExplanation(alert.type, alert.metricLabel, alert.symbol),
      whyItMatters: language.alerts.whyItMatters(alert.type),
    })),
    emptyMessage: localizeEmptyMessage(model, locale),
    dataQualityNote: model.dataQualityNote === "Some sector comparisons lack an exact source price-change basis." ? "কিছু খাতের তুলনার জন্য দামের পরিবর্তনের সঠিক উৎসভিত্তি নেই।" : qualityCount ? language.states.dataQualityNote(Number(qualityCount)) : model.dataQualityNote,
  };
}

function mapMover(mover: BackendMarketMoverDto): MarketMoverModel {
  return {
    symbol: mover.symbol,
    name: mover.name,
    exchange: mover.exchange,
    latestPrice: mover.latest_price,
    priceChangePercent: mover.price_change_percent,
    priceTone: mapPriceTone(mover.price_tone),
    turnover: mover.turnover,
    href: buildStockDetailPath(mover.exchange, mover.symbol),
  };
}

function mapMarketMovers(movers: BackendMarketPulseDto["market_movers"] | undefined): MarketMoversModel {
  if (!movers) {
    return { gainers: [], losers: [] };
  }

  return {
    gainers: (movers.gainers ?? []).map(mapMover),
    losers: (movers.losers ?? []).map(mapMover),
  };
}

function parseChangePercent(value: string) {
  return Number.parseFloat(value.replace("%", "").replace("+", "")) || 0;
}

function deriveMoversFromFocusStocks(stocks: FocusStockModel[]): MarketMoversModel {
  const gainers = [...stocks]
    .filter((stock) => parseChangePercent(stock.priceChangePercent) > 0)
    .sort((left, right) => parseChangePercent(right.priceChangePercent) - parseChangePercent(left.priceChangePercent))
    .slice(0, 4)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      latestPrice: stock.latestPrice,
      priceChangePercent: stock.priceChangePercent,
      priceTone: stock.priceTone,
      turnover: null,
      href: stock.href,
    }));

  const losers = [...stocks]
    .filter((stock) => parseChangePercent(stock.priceChangePercent) < 0)
    .sort((left, right) => parseChangePercent(left.priceChangePercent) - parseChangePercent(right.priceChangePercent))
    .slice(0, 4)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      latestPrice: stock.latestPrice,
      priceChangePercent: stock.priceChangePercent,
      priceTone: stock.priceTone,
      turnover: null,
      href: stock.href,
    }));

  return { gainers, losers };
}

function resolveMarketMovers(dto: BackendMarketPulseDto, focusStocks: FocusStockModel[]): MarketMoversModel {
  const mapped = mapMarketMovers(dto.market_movers);
  if (mapped.gainers.length > 0 || mapped.losers.length > 0) {
    return mapped;
  }

  const pool = [...focusStocks, ...dto.monitor_candidates.map(mapFocusStock)];
  const unique = Array.from(new Map(pool.map((stock) => [stock.stockId, stock])).values());
  return deriveMoversFromFocusStocks(unique);
}

function focusEvidenceReason(stock: FocusStockModel, locale: AppLocale): string[] {
  const copy = getPulsePresentationLanguage(locale);
  const facts = stock.measuredFacts;
  const reasons: string[] = [];
  if (["Signal Upgrade", "New BUY Setup"].includes(stock.focusLabel)) reasons.push(copy.focusReasons[stock.focusLabel as "Signal Upgrade" | "New BUY Setup"]);
  const factCount = [facts?.rsi, facts?.volume_ratio].filter(value => value != null && Number.isFinite(value)).length;
  if (facts?.resistance != null && Number.isFinite(facts.resistance) && facts.resistance > 0 && facts.resistance !== facts.trigger_price
    && (factCount >= 2 || factCount >= 1 && facts.trigger_price != null)) {
    reasons.push(copy.resistanceEvidence(formatNumber(facts.resistance, { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  }
  return reasons;
}

function presentPulseAlert(alert: MarketAlertModel, locale: AppLocale): MarketAlertModel {
  const copy = getPulsePresentationLanguage(locale);
  return { ...alert, eventTitle: `${alert.symbol ? `${alert.symbol} · ` : ""}${(copy.alertTitles as Record<string, string>)[alert.type] ?? copy.sessionAlert}`,
    eventExplanation: (copy.alertExplanations as Record<string, (metric: string) => string>)[alert.type]?.(alert.metricLabel) ?? "",
    whyItMatters: copy.alertAdvice };
}

export function buildMarketPulseViewModel(dto: BackendMarketPulseDto, locale: AppLocale = "en"): MarketPulseModel {
  const status = dto.coverage?.market_status;
  const copy = getPulsePresentationLanguage(locale);
  const statusLabel = status ? copy.status[status] : copy.statusUnavailable;
  const decisionDate = dto.coverage?.decision_session_date ?? dto.coverage?.session_trade_date;
  const quoteDate = dto.coverage?.quote_session_date ?? [...dto.focus_stocks, ...dto.monitor_candidates]
    .map(stock => stock.display_quote?.observation_session_date ?? stock.display_quote?.as_of_trade_date).filter((value): value is string => Boolean(value)).sort().at(-1);
  const focusStocks = dto.focus_stocks.map(mapFocusStock);
  const monitorCandidates = dto.monitor_candidates.map(mapFocusStock);

  const model: MarketPulseModel = {
    hero: {
      greeting: dto.hero.greeting,
      attentionHeadline: dto.hero.attention_headline,
      attentionSubline: dto.hero.attention_subline,
      lastUpdatedLabel: dto.hero.last_updated_label,
      relativeUpdatedLabel: dto.hero.relative_updated_label,
      sessionLabel: dto.decision_status === "UPDATING"
        ? `${locale === "bn" ? "আপডেট হচ্ছে; চূড়ান্ত সিদ্ধান্ত" : "Updating; finalized decisions"} ${dto.coverage?.session_trade_date ?? ""}`
        : dto.hero.session_label,
      focusCount: dto.hero.focus_count,
      recentFocusCount: dto.hero.recent_focus_count,
    },
    sinceLastVisit: {
      visible: dto.since_last_visit.visible,
      newChangesCount: dto.since_last_visit.new_changes_count,
      newFocusCount: dto.since_last_visit.new_focus_count,
      newAlertsCount: dto.since_last_visit.new_alerts_count,
      summaryLabel: dto.since_last_visit.summary_label,
    },
    briefingChips: buildBriefingChips(dto),
    briefing: dto.briefing ? mapBriefing(dto.briefing) : null,
    focusStocks,
    monitorCandidates,
    todayInsight: null,
    changes: [],
    alerts: dto.alerts.map(mapAlert),
    marketMovers: { gainers: [], losers: [] },
    emptyState: dto.empty_state as MarketPulseModel["emptyState"],
    emptyMessage: dto.empty_message,
    dataQualityNote: dto.data_quality_note,
    sessionDisablesRefresh: false,
    sessionDescription: statusLabel ?? (locale === "bn" ? "সেশনের অবস্থা নেই" : "Session state unavailable"),
  };

  const localized = applyMarketPulseLocalization(model, locale);
  const focus = (stock: FocusStockModel): FocusStockModel => ({ ...stock, locale,
    whyHere: focusEvidenceReason(stock, locale),
    controllingReason: controllingReasonLabel(stock.controllingReasonCode, "", locale),
    decisionContext: `${copy.forNewBuyers} · ${shortTradeDate(stock.decisionDate, locale)}`,
  });
  const facts = dto.briefing?.breadth ?? dto.coverage?.breadth;
  const changed = dto.focus_stocks.filter((stock) => stock.public_comparison?.status === "CHANGED" && stock.public_comparison.current_action === stock.recommendation && stock.recommendation === "POTENTIAL_BUY");
  const upgraded = changed.filter((stock) => ["WAIT", "HOLD"].includes(stock.public_comparison?.previous_action ?? ""));
  return { ...localized,
    hero: { ...localized.hero, attentionHeadline: locale === "bn" ? "সেশনের বাজারচিত্র" : localized.hero.attentionHeadline === "Story of the day" ? "Session overview" : localized.hero.attentionHeadline, sessionLabel: status === "OPEN" && quoteDate && !isCurrentIntradaySession("OPEN", quoteDate)
      ? copy.earlierPrices(shortTradeDate(quoteDate, locale), shortTradeDate(decisionDate, locale))
      : `${statusLabel ?? dto.hero.session_label ?? "—"} · ${copy.analysis} ${shortTradeDate(decisionDate, locale)}` },
    briefingChips: localized.briefingChips.map((chip) => chip.id === "session" ? { ...chip, value: statusLabel } : chip),
    alerts: localized.alerts.map((alert) => presentPulseAlert(alert, locale)),
    focusStocks: localized.focusStocks.map(focus), monitorCandidates: localized.monitorCandidates.map(focus),
    dataQualityNote: dto.data_quality_note ? copy.priceReview : null,
    briefing: localized.briefing ? { ...localized.briefing,
      state: { ...localized.briefing.state, dimensions: localized.briefing.state.dimensions.map((dimension) => ({ ...dimension,
        label: (copy.dimensions as Record<string, string>)[dimension.key] ?? dimension.label,
      })) },
      story: { ...localized.briefing.story, explanation: facts && facts.known_count > 0
        ? `${copy.breadth(facts.advancing, facts.declining, facts.unchanged)}\n${sectorLeadershipContext(localized.briefing, locale).line}`
        : localized.briefing.story.explanation },
      breadth: facts, breadthNote: breadthCoverageLabel(facts, locale), breadthDefinition: breadthDefinition(facts, locale),
      sectorBasis: `${copy.sectorBasis} · ${shortTradeDate(facts?.as_of_date ?? decisionDate, locale)}${localized.briefing.state.excludedSectorCount ? ` · ${getTraderJourneyLanguage(locale).excludedSectors(localized.briefing.state.excludedSectorCount)}` : ""}`,
      opportunityScore: { ...localized.briefing.opportunityScore, label: getMarketPulseLanguage(locale).briefing.opportunityLabel(localized.briefing.opportunityScore.score) },
      leadership: { ...localized.briefing.leadership, decisionDate, freshBuySignals: changed.map((stock) => stock.symbol), freshNewCount: changed.length - upgraded.length, freshUpgradedCount: upgraded.length,
        cards: localized.briefing.leadership.cards.map((card) => ({ ...card,
          name: card.kind === "sector" ? sectorName(card.name, locale) : card.name,
          subtitle: card.kind === "sector" ? copy.sameSessionReturn : card.kind === "stock" ? copy.priceLeader : copy.volumeLeader,
        })),
      },
      ...(facts?.known_count === 0 ? { story: { ...localized.briefing.story,
        headline: locale === "bn" ? "বাজারের বিস্তারের তথ্য নেই" : "Breadth unavailable",
        explanation: locale === "bn" ? "এই সেশনের শেয়ারের দামের পরিবর্তনের তথ্য পাওয়া যায়নি।" : "Stock price changes are unavailable for this session.",
        metrics: [], tone: "info" as const }, state: { ...localized.briefing.state,
          dimensions: [],
          overallLabel: locale === "bn" ? "তথ্য অসম্পূর্ণ" : "Coverage incomplete", overallTone: "info" as const },
        moneyFlow: { inflows: [], outflows: [] },
        leadership: { ...localized.briefing.leadership, cards: localized.briefing.leadership.cards.filter((card) => !["sector", "stock"].includes(card.kind)), narrative: "", freshBuySignals: [], freshNewCount: 0, freshUpgradedCount: 0 },
        summary: { ...localized.briefing.summary, text: locale === "bn" ? "বাজারের বিস্তারের তথ্য অসম্পূর্ণ।" : "Market breadth coverage is incomplete.", highlights: [], tradingEnvironment: null, tone: "info" as const },
      } : {}),
    } : null,
  };
}

export function buildMarketPulseSnapshotFromDto(dto: BackendMarketPulseDto) {
  const scores: Record<string, number> = {};
  const recommendations: Record<string, string> = {};
  const trackedStocks = [...dto.focus_stocks, ...dto.monitor_candidates];

  for (const stock of trackedStocks) {
    scores[stock.stock_id] = stock.pulse_score;
    recommendations[stock.stock_id] = stock.recommendation;
  }

  return {
    lastSyncedAt: null,
    scoreVersion:
      dto.coverage?.score_version ??
      trackedStocks[0]?.score_breakdown.score_version ??
      null,
    decisionTaxonomyVersion:
      dto.coverage?.decision_taxonomy_version ?? null,
    focusStockIds: dto.focus_stocks.map((stock) => stock.stock_id),
    scores,
    recommendations,
    alertIds: dto.alerts.map((alert) => alert.id),
  };
}
