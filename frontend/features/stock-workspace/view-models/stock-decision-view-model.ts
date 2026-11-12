import { holderReasonLabel, evidenceLabel, controllingReasonLabel, selectedDecisionExplanation } from "@/lib/market/decision-presentation";
import type { DisplayMetricsDto, PatternDetectionDto, StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { holderActionLabels } from "@/lib/market/signal-action-labels";
import type { DecisionDisplayAction, HolderAction } from "@/lib/api/backend-api-types";
import { compatibleDisplayAction } from "@/lib/market/decision-action-compatibility";
import { getStockDecisionLanguage } from "@/features/stock-workspace/stock-decision-language";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";
import {
  formatFinancialDisplay,
  formatMarketCapBdt,
  formatNumber,
  formatPercent,
} from "@/lib/formatters/financial-formatters";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { applyStockDecisionLocalization } from "@/features/stock-workspace/stock-decision-language";

export type DecisionSignalKey =
  | "uptrend_intact"
  | "trend_under_pressure"
  | "momentum_healthy"
  | "momentum_fading"
  | "volume_above_average"
  | "weak_volume_confirmation"
  | "warning_ref";

export type DecisionSignal = {
  tone: "positive" | "warning";
  key: DecisionSignalKey | "selected_support" | "selected_limitation";
  text: string;
  warningCode?: string;
};

export type PricePositionVisual = {
  support: number | null;
  current: number | null;
  resistance: number | null;
  percentTowardResistance: number | null;
};

export type TradePlanVisual = {
  entryLow: number | null;
  entryHigh: number | null;
  current: number | null;
  reference: number | null;
  stopLoss: number | null;
  target: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  trailingRule: string | null;
  riskReward: number | null;
  status: "VALID_ENTRY_PLAN" | "WATCH_ONLY" | "UNAVAILABLE";
  asOfDate?: string | null;
  entryApplicability?: StockDecisionSupportDto["entry_applicability"];
};

export type StockDecisionViewModel = {
  holderInstruction?: { action: HolderAction; label: string; reason: string };
  available: boolean;
  recommendation: string;
  displayAction: DecisionDisplayAction | null;
  locale: AppLocale;
  audience: string;
  datedActionLabel: string;
  sourceDetail: string[];
  confidence: number;
  confidenceLabel: string;
  controllingReason?: string;
  recommendationTone: "buy" | "hold" | "wait" | "sell" | "neutral";
  entryCondition: string | null;
  decisionSignals: DecisionSignal[];
  opportunityScore: number;
  opportunityComponents: Array<{ key: string; label: string; score: number; explanation: string }>;
  riskScore: number;
  riskLabel: string;
  riskBasisLabel: string;
  riskComponents: Array<{ key: string; label: string; score: number; explanation: string }>;
  pricePositionVisual: PricePositionVisual;
  tradePlanVisual: TradePlanVisual;
  liquidity: { label: string; explanation: string; volumeRatio: string };
  warnings: Array<{ title: string; message: string; severity: string; code: string; parameters?: Record<string, string | number | boolean> }>;
  topWarnings: Array<{ title: string; message: string; severity: string; code: string }>;
  freshness: { label: string; helper: string; isStale: boolean };
  chartPatterns: PatternDetectionDto[];
  primaryPattern: PatternDetectionDto | null;
  secondaryPattern: PatternDetectionDto | null;
  breakout: StockDecisionSupportDto["breakout"];
  ownership: StockDecisionSupportDto["ownership"];
  valuation: StockDecisionSupportDto["valuation"];
  events: StockDecisionSupportDto["events"];
  support: number | null;
  resistance: number | null;
  trend: string;
};

const recommendationToneMap = {
  POTENTIAL_BUY: "buy",
  HOLD: "hold",
  WAIT: "wait",
  SELL: "sell",
} as const;

const SIGNAL_TEXT: Record<Exclude<DecisionSignalKey, "warning_ref">, string> = {
  uptrend_intact: "Uptrend intact",
  trend_under_pressure: "Trend under pressure",
  momentum_healthy: "Momentum healthy",
  momentum_fading: "Momentum fading",
  volume_above_average: "Volume above average",
  weak_volume_confirmation: "Volume below average",
};

function buildDecisionSignals(decision: StockDecisionSupportDto, locale: AppLocale): DecisionSignal[] {
  const selected = selectedDecisionExplanation(decision.decision, locale);
  return [
    ...(selected.limitation ? [{ key: "selected_limitation" as const, tone: "warning" as const, text: selected.limitation }] : []),
    ...(selected.support ? [{ key: "selected_support" as const, tone: "positive" as const, text: selected.support }] : []),
  ];
}

function computePercentTowardResistance(support: number | null, resistance: number | null, current: number | null) {
  if (support === null || resistance === null || current === null || resistance <= support) {
    return null;
  }
  return Math.max(0, Math.min(100, ((current - support) / (resistance - support)) * 100));
}

export function buildStockDecisionViewModel(
  decision: StockDecisionSupportDto | null | undefined,
  locale: AppLocale = DEFAULT_LOCALE,
  displayMetrics?: DisplayMetricsDto | null,
): StockDecisionViewModel {
  if (!decision) {
    return applyStockDecisionLocalization(
      {
        available: false,
        displayAction: null,
        locale,
        audience: "",
        datedActionLabel: "",
        sourceDetail: [],
        recommendation: "—",
        confidence: 0,
        confidenceLabel: "N/A",
        recommendationTone: "neutral",
        entryCondition: null,
        decisionSignals: [],
        opportunityScore: 0,
        opportunityComponents: [],
        riskScore: 0,
        riskLabel: "N/A",
        riskBasisLabel: locale === "bn" ? "ঝুঁকির তথ্য নেই" : "Risk unavailable",
        riskComponents: [],
        pricePositionVisual: { support: null, current: null, resistance: null, percentTowardResistance: null },
        tradePlanVisual: {
          entryLow: null,
          entryHigh: null,
          current: null,
          reference: null,
          stopLoss: null,
          target: null,
          targetLow: null,
          targetHigh: null,
          trailingRule: null,
          riskReward: null,
          status: "UNAVAILABLE",
        },
        liquidity: { label: "N/A", explanation: "", volumeRatio: "N/A" },
        warnings: [],
        topWarnings: [],
        freshness: { label: "Unavailable", helper: "", isStale: false },
        chartPatterns: [],
        primaryPattern: null,
        secondaryPattern: null,
        breakout: null,
        ownership: null,
        valuation: null,
        events: [],
        support: null,
        resistance: null,
        trend: "UNKNOWN",
      },
      locale,
    );
  }

  const warnings = decision.warnings.map((warning) => ({
    title: warning.title,
    message: warning.message,
    severity: warning.severity,
    code: warning.code,
    parameters: {
      ...(decision.technical_snapshot?.rsi != null ? { rsi: decision.technical_snapshot.rsi } : {}),
      ...(decision.technical_snapshot?.volatility != null ? { volatility: decision.technical_snapshot.volatility } : {}),
      ...(warning.code === "elevated_risk" && decision.risk?.label ? { riskLabel: decision.risk.label } : {}),
      ...(decision.primary_pattern ? { patternName: decision.primary_pattern.name, confirmed: decision.primary_pattern.status === "Confirmed" } : {}),
    },
  }));
  const risk = decision.trading_risk ?? decision.risk;
  const displayAction = compatibleDisplayAction(decision.decision);
  const asOfDate = decision.decision_session_date ?? decision.data_freshness.latest_trade_date;
  const condition = decision.decision.entry_condition ?? decision.trade_plan.condition_text;

  return applyStockDecisionLocalization(
    {
      available: true,
      displayAction,
      locale,
      audience: locale === "bn" ? "নতুন অবস্থান বিবেচনায়" : "For a prospective entry",
      datedActionLabel: `${locale === "bn" ? "সিদ্ধান্তের তারিখ" : "Decision as of"} ${asOfDate ?? "—"}`,
      sourceDetail: [decision.decision.primary_reason, decision.decision.measured_support, decision.decision.opposing_constraint, decision.trade_plan.trailing_rule].filter((text): text is string => !!text),
      recommendation: displayAction?.replace("_", " ") ?? (locale === "bn" ? "সিদ্ধান্ত অনুপলব্ধ" : "Decision unavailable"),
      confidence: decision.decision.confidence,
      confidenceLabel: evidenceLabel(decision.decision.evidence_status, locale),
      controllingReason: [
        decision.decision_status === "UPDATING" ? (locale === "bn" ? "সিদ্ধান্ত আপডেট হচ্ছে; আগের চূড়ান্ত ফল।" : "Updating; previous finalized result.") : null,
        controllingReasonLabel(decision.decision.primary_reason_code ?? decision.canonical_decision?.primary_reason_code, "", locale),
        decision.decision.non_holder_action === "AVOID" ? (locale === "bn" ? "নতুন long entry এড়িয়ে চলুন।" : "Avoid a new long entry.") : null,
      ].filter(Boolean).join(" "),
      recommendationTone:
        (displayAction ? recommendationToneMap[displayAction] : null) ?? "neutral",
      entryCondition:
        displayAction === "POTENTIAL_BUY" && decision.entry_applicability?.status === "APPLICABLE"
          ? decision.trade_plan.entry_timing === "PULLBACK"
            ? (locale === "bn" ? "দর pullback সীমার মধ্যে আছে; support টিকে থাকে কি না দেখুন।" : "Quote is in the pullback zone; watch whether support holds.")
            : decision.trade_plan.entry_timing === "BREAKOUT"
              ? (locale === "bn" ? "সম্পূর্ণ সেশনের close ও volume নিশ্চিত হয়েছে এবং অনুমোদিত entry session এসেছে; প্রকাশিত ব্যবস্থাপনার শর্ত অনুসরণ করুন।" : "Completed-session close and volume are confirmed and the permitted entry session has arrived; follow the dated management conditions.")
            : condition ? `${locale === "bn" ? "প্রকাশিত শর্ত: " : "Dated condition: "}${localizeEntryCondition(condition, locale)}` : null
          : null,
      decisionSignals: buildDecisionSignals(decision, locale),
      opportunityScore: decision.opportunity.score,
      opportunityComponents: decision.opportunity.components.map((component) => ({
        key: component.key,
        label: component.key === "risk_adjustment" ? "Legacy composite risk adjustment" : component.label,
        score: component.score,
        explanation: component.key === "risk_adjustment" ? `${component.explanation} This uses the legacy composite score, separately from trading risk.` : component.explanation,
      })),
      riskScore: risk.score,
      riskLabel: risk.label,
      riskBasisLabel: decision.trading_risk ? (locale === "bn" ? "এন্ট্রির ঝুঁকি" : "Entry risk") : (locale === "bn" ? "পুরোনো composite ঝুঁকি" : "Legacy composite risk"),
      riskComponents: risk.components.map((component) => ({
        key: component.key,
        label: component.key === "risk_adjustment" ? "Legacy composite risk adjustment" : component.label,
        score: component.score,
        explanation: component.key === "risk_adjustment" ? `${component.explanation} This uses the legacy composite score, separately from trading risk.` : component.explanation,
      })),
      pricePositionVisual: {
        support: decision.support,
        current: decision.price_position.current_price,
        resistance: decision.resistance,
        percentTowardResistance: computePercentTowardResistance(
          decision.support,
          decision.resistance,
          decision.price_position.current_price,
        ),
      },
      tradePlanVisual: {
        entryLow: decision.trade_plan.preferred_entry_zone_low ?? decision.trade_plan.entry_zone_low,
        entryHigh: decision.trade_plan.preferred_entry_zone_high ?? decision.trade_plan.entry_zone_high,
        current: displayMetrics?.current_price ?? null,
        reference: decision.price_position.current_price,
        stopLoss: decision.trade_plan.invalidation_price ?? decision.trade_plan.stop_loss,
        target: decision.trade_plan.target_high,
        targetLow: decision.trade_plan.target_low,
        targetHigh: decision.trade_plan.target_high,
        trailingRule: decision.trade_plan.management_mode === "TRAILING" ? locale === "bn" ? "সম্পূর্ণ সেশনের সর্বশেষ দামের গঠন অথবা প্রকাশিত ATR-ভিত্তিক সীমা—যেটি উঁচু—তার নিচে trailing invalidation অনুসরণ করুন।" : decision.trade_plan.trailing_rule ?? null : null,
        riskReward: decision.trade_plan.risk_reward_ratio,
        status: decision.trade_plan.status ?? (decision.trade_plan.entry_zone_low !== null && decision.trade_plan.entry_zone_high !== null ? "WATCH_ONLY" : "UNAVAILABLE"),
        asOfDate: decision.decision_session_date ?? decision.data_freshness.latest_trade_date,
        entryApplicability: decision.entry_applicability,
      },
      liquidity: {
        label: decision.liquidity.label,
        explanation: decision.liquidity.explanation,
        volumeRatio:
          decision.liquidity.latest_volume_ratio !== null
            ? `${decision.liquidity.latest_volume_ratio.toFixed(1)}x avg`
            : "N/A",
      },
      warnings,
      topWarnings: warnings.slice(0, 3),
      freshness: {
        label: decision.data_freshness.is_stale ? "Stale" : decision.data_freshness.is_sparse ? "Sparse" : "No missed sessions flagged",
        helper: `${decision.data_freshness.ohlcv_row_count} candles · ${decision.data_freshness.latest_trade_date ?? "unknown"}`,
        isStale: decision.data_freshness.is_stale || decision.data_freshness.is_sparse,
      },
      chartPatterns: decision.patterns.slice(0, 2),
      primaryPattern: decision.patterns[0] ?? null,
      secondaryPattern: decision.patterns[1] ?? null,
      breakout: decision.breakout,
      ownership: decision.ownership,
      valuation: decision.valuation,
      events: decision.events.slice(0, 5),
      support: decision.support,
      resistance: decision.resistance,
      trend: decision.trend,
    },
    locale,
  );
}

export function formatOwnershipPercent(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => `${parsed.toFixed(1)}%`);
}

export function formatValuationMetric(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => formatNumber(parsed));
}

export function formatMarketCap(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => formatMarketCapBdt(parsed));
}

export function patternDirectionClass(direction: string) {
  if (direction === "bullish") {
    return "pattern-chip-bullish";
  }
  if (direction === "bearish") {
    return "pattern-chip-bearish";
  }
  return "pattern-chip-neutral";
}

/** Account membership changes the audience, never the dated public thesis or entry evaluator. */
export function withStockHolderInstruction(model: StockDecisionViewModel, decision: StockDecisionSupportDto | null | undefined, isHolding: boolean): StockDecisionViewModel {
  const action = decision?.decision.holder_action ?? decision?.canonical_decision?.holder_action;
  if (!isHolding || !model.displayAction || !action || !["HOLD", "REVIEW", "REDUCE", "SELL"].includes(action)) return model;
  const code = decision?.decision.primary_reason_code ?? decision?.canonical_decision?.primary_reason_code;
  const fallback = (model.locale === "en" ? decision?.decision.primary_reason ?? decision?.canonical_decision?.primary_reason : null)
    ?? (model.locale === "bn" ? "প্রকাশিত নির্দেশনার কারণ উৎসের বিস্তারিত অংশে দেখুন।" : "See the published source detail for the holder instruction's reason.");
  const reason = holderReasonLabel(code, fallback, model.locale);
  return { ...model, holderInstruction: { action, label: holderActionLabels[model.locale][action], reason } };
}
