import { holderReasonLabel } from "@/lib/market/decision-presentation";
import type {
  BackendPortfolioHoldingDto,
  BackendDisplayQuoteDto,
  PortfolioAttentionCode,
  PortfolioPriceStatus,
} from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { formatTrendLabel, normalizeTrendDirection } from "@/lib/market/trend-display";

export type PortfolioHoldingFilter = "ALL" | "HOLDINGS" | "WATCHLIST" | "REVIEW" | "STABLE" | "INCOMPLETE";

export function isPortfolioHoldingIncomplete(item: BackendPortfolioHoldingDto) {
  if (!item.is_holding) return false;
  return item.quantity == null
    || item.average_buy_price == null;
}

export function isPortfolioReviewRow(item: BackendPortfolioHoldingDto) {
  if (item.is_holding) return item.requires_attention || item.holder_action === "REVIEW";
  return (item.action != null && item.action !== "WAIT") || item.risk === "HIGH" || item.risk === "SPECULATIVE" || item.scanner_conditions.length > 0 || item.relevant_event != null;
}

export function sortPortfolioGroupRows(items: BackendPortfolioHoldingDto[]) {
  return [...items].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function countCompletedHoldings(items: BackendPortfolioHoldingDto[]) {
  return items.filter((item) => item.is_holding && item.quantity != null && item.average_buy_price != null).length;
}

export function countIncompleteHoldings(items: BackendPortfolioHoldingDto[]) {
  return items.filter((item) => isPortfolioHoldingIncomplete(item)).length;
}

export function attentionFilterForCode(code: PortfolioAttentionCode): PortfolioHoldingFilter {
  return code === "INCOMPLETE_HOLDING" ? "INCOMPLETE" : "REVIEW";
}

export function formatPortfolioTrend(trend: string) {
  return formatTrendLabel(normalizeTrendDirection(trend));
}

export function formatPortfolioRisk(risk: BackendPortfolioHoldingDto["risk"]) {
  if (!risk) return null;
  return risk.charAt(0) + risk.slice(1).toLowerCase();
}

export function formatPortfolioPriceState(status: PortfolioPriceStatus, locale: AppLocale) {
  const labels = {
    en: {
      FINALIZED: null,
      PROVISIONAL: "Live price",
      NON_TRADED: "Not traded today",
      STALE_LAST_KNOWN: "Stale data",
      SUSPENDED: "Suspended",
      SUSPICIOUS: "Verify price",
      UNAVAILABLE: "Price unavailable",
    },
    bn: {
      FINALIZED: null,
      PROVISIONAL: "লাইভ দাম",
      NON_TRADED: "আজ লেনদেন হয়নি",
      STALE_LAST_KNOWN: "পুরোনো তথ্য",
      SUSPENDED: "স্থগিত",
      SUSPICIOUS: "দাম যাচাই করুন",
      UNAVAILABLE: "দাম পাওয়া যায়নি",
    },
  } as const;
  return labels[locale][status];
}

type GuidanceCopy = {
  addQuantity: string;
  addAveragePrice: string;
  needsSetup: string;
  signalUnavailable: string;
  guidance: Record<BackendPortfolioHoldingDto["what_next_code"], string>;
  reasonLabels: Record<string, string>;
  watching: string;
};

export function getPortfolioWhatNextCopy(
  item: BackendPortfolioHoldingDto,
  copy: GuidanceCopy,
  locale: AppLocale = "en",
) {
  if (!item.is_holding) {
    if (item.action == null) return copy.signalUnavailable;
    if (item.action === "WAIT") return copy.watching;
    return copy.reasonLabels[item.scanner_conditions[0] ?? ""] ?? copy.guidance[item.what_next_code];
  }
  if (item.quantity == null) return copy.addQuantity;
  if (item.average_buy_price == null) return copy.addAveragePrice;
  if (item.current_price == null) return copy.guidance.PRICE_STALE_OR_SUSPENDED;
  if (item.holder_action == null) return copy.signalUnavailable;
  if (item.what_next_code === "REVIEW_HOLDER_GUIDANCE" || item.holder_action === "REVIEW" && ["NO_ACTION_NEEDED", "PROFITABLE_TREND_INTACT"].includes(item.what_next_code)) {
    return holderReasonLabel(item.primary_reason_code, copy.guidance.REVIEW_HOLDER_GUIDANCE, locale);
  }
  return copy.guidance[item.what_next_code];
}

export function getPortfolioSignalMeta(
  item: BackendPortfolioHoldingDto,
  copy: { signalUnavailable: string; unknown: string },
) {
  const trend = normalizeTrendDirection(item.trend);
  const trendLabel = trend === "UNKNOWN" ? null : formatTrendLabel(trend);
  const riskLabel = formatPortfolioRisk(item.risk);
  const priceState = item.price_status === "FINALIZED" || item.price_status === "PROVISIONAL"
    ? null
    : item.price_status.replaceAll("_", " ").toLowerCase();
  const parts = [trendLabel, riskLabel, priceState].filter(Boolean);
  return {
    trendLabel,
    riskLabel,
    summary: parts.length ? parts.join(" · ") : copy.signalUnavailable,
  };
}

export function parseDecimal(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPortfolioMoney(value: string | number | null, locale: AppLocale, maximumFractionDigits = 2) {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  const formatted = new Intl.NumberFormat(locale === "bn" ? "en-BD" : "en-BD", {
    maximumFractionDigits,
  }).format(Math.abs(parsed));
  return parsed < 0 ? `-৳${formatted}` : `৳${formatted}`;
}

export function formatPortfolioNumber(
  value: string | number | null,
  maximumFractionDigits = 2,
) {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits }).format(parsed);
}

/** Share quantity is whole lots — strip API decimal padding like "8000.0000". */
export function formatPortfolioQuantity(value: string | number | null) {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Math.trunc(parsed));
}

export function toQuantityInputValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const parsed = parseDecimal(value);
  if (parsed == null || parsed <= 0) return "";
  return String(Math.trunc(parsed));
}

export function formatSignedPercent(value: string | number | null) {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

export function formatPortfolioPercent(value: string | number | null) {
  const parsed = parseDecimal(value);
  if (parsed == null) return "—";
  return `${parsed.toFixed(2)}%`;
}

export function financialTone(value: string | number | null): "neutral" | "positive" | "negative" {
  const parsed = parseDecimal(value);
  if (parsed == null || parsed === 0) return "neutral";
  return parsed > 0 ? "positive" : "negative";
}

export function filterPortfolioHoldings(
  holdings: BackendPortfolioHoldingDto[],
  options: {
    search: string;
    filter: PortfolioHoldingFilter;
    action: string;
    trend: string;
    selectedStockIds: Set<string> | null;
  },
) {
  const query = options.search.trim().toLowerCase();
  return holdings.filter((holding) => {
    if (options.selectedStockIds && !options.selectedStockIds.has(holding.stock_id)) return false;
    if (query && !`${holding.symbol} ${holding.name}`.toLowerCase().includes(query)) return false;
    if (options.filter === "HOLDINGS" && !holding.is_holding) return false;
    if (options.filter === "WATCHLIST" && holding.is_holding) return false;
    if (options.filter === "REVIEW" && !options.selectedStockIds && !isPortfolioReviewRow(holding)) return false;
    if (options.filter === "STABLE" && isPortfolioReviewRow(holding)) return false;
    if (
      options.filter === "INCOMPLETE" &&
      !isPortfolioHoldingIncomplete(holding)
    ) return false;
    if (options.action !== "ALL" && portfolioRowAction(holding) !== options.action) return false;
    if (options.trend !== "ALL" && holding.trend !== options.trend) return false;
    return true;
  }).sort((left, right) => {
    const group = Number(right.is_holding) - Number(left.is_holding);
    if (group) return group;
    return left.symbol.localeCompare(right.symbol);
  });
}

/** Preserve the precise audience instruction; REDUCE and REVIEW are never public SELL/WAIT. */
export function portfolioRowAction(item: BackendPortfolioHoldingDto) {
  if (item.decision_taxonomy_version && !["v1", "v2"].includes(item.decision_taxonomy_version)) return null;
  const action = item.is_holding ? item.holder_action : item.action;
  const allowed = item.is_holding ? ["HOLD", "REVIEW", "REDUCE", "SELL"] : ["POTENTIAL_BUY", "WAIT", "HOLD", "SELL"];
  return action && allowed.includes(action) ? action : null;
}

/** Dated holder evidence is independent of account setup and what-next tasks. */
export function portfolioHolderReason(item: BackendPortfolioHoldingDto, locale: AppLocale) {
  return item.is_holding && portfolioRowAction(item) ? holderReasonLabel(item.primary_reason_code, "", locale) : null;
}

export function portfolioRowComparison(item: BackendPortfolioHoldingDto) {
  const pair = item.is_holding ? item.holder_comparison : item.public_comparison;
  const action = portfolioRowAction(item);
  if (!pair || pair.status === "UNCOMPARABLE" || !pair.previous_session_date || !action || pair.current_action !== action || !pair.previous_action) return null;
  const actions = item.is_holding ? ["HOLD", "REVIEW", "REDUCE", "SELL"] : ["POTENTIAL_BUY", "WAIT", "HOLD", "SELL"];
  if (!actions.includes(pair.previous_action) || pair.status !== (pair.previous_action === action ? "UNCHANGED" : "CHANGED")) return null;
  return pair;
}

/** Attach a quote's dates/change only to the account price it actually marks. */
export function accountQuoteForPrice(item: { current_price: string | number | null; display_quote?: BackendDisplayQuoteDto | null }) {
  const quote = item.display_quote;
  const price = parseDecimal(item.current_price);
  if (!quote || quote.current_price == null || !Number.isFinite(quote.current_price) || quote.current_price <= 0 || !quote.as_of_trade_date) return null;
  // Account prices are projected at four decimal places by the server.
  return price === Number(quote.current_price.toFixed(4)) ? quote : null;
}
