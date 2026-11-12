import { buildStockDecisionViewModel, withStockHolderInstruction } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { evidenceLabel } from "@/lib/market/decision-presentation";
import { DecisionPublicationLabel, QuotePublicationLabel } from "@/components/ui/market-publication-label";
import { formatNumber, formatPercent, formatMarketCapBdt } from "@/lib/formatters/financial-formatters";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { compatibleDisplayAction } from "@/lib/market/decision-action-compatibility";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";

type StockDurableSummaryProps = {
  workspace: StockWorkspaceDto;
  locale?: AppLocale;
  isHolding?: boolean;
};

/**
 * Server-presentable durable facts for the stock details page.
 * Renders without client JS. Interactive workspace hydrates around this.
 */
export function StockDurableSummary({ workspace, locale = DEFAULT_LOCALE, isHolding = false }: StockDurableSummaryProps) {
  const copy = getStockWorkspaceLanguage(locale);
  const stock = workspace.stock;
  const decision = workspace.decision_support;
  const action = compatibleDisplayAction(decision.decision);
  const holder = isHolding ? withStockHolderInstruction(buildStockDecisionViewModel(decision, locale, workspace.display_metrics), decision, true).holderInstruction : undefined;
  const display = workspace.display_metrics;
  const freshness = decision.data_freshness;
  const latestPrice = display?.current_price ?? null;
  const changePercent = display?.price_change_percent ?? null;
  const marketCap =
    display?.market_cap ??
    decision.valuation?.market_cap ??
    (stock.market_cap != null ? Number(stock.market_cap) : null);

  const freshnessLabel = freshness.is_stale
    ? copy.durableSummary.freshness.stale
    : freshness.is_sparse
      ? copy.durableSummary.freshness.sparse
      : copy.durableSummary.freshness.fresh;
  const uncertaintyBits = [
    freshness.is_stale ? copy.durableSummary.uncertaintyStale : null,
    freshness.is_sparse ? copy.durableSummary.uncertaintySparse : null,
    ...(freshness.missing_fields ?? []).slice(0, 3).map((field) => copy.durableSummary.missingField(field)),
  ].filter(Boolean);

  return (
    <section aria-label={copy.durableSummary.ariaLabel} className="sr-only" data-testid="stock-durable-summary">
      <div className="stock-durable-summary-identity">
        <p className="eyebrow">
          {stock.exchange}
          {stock.sector ? ` / ${stock.sector}` : ""}
          {stock.category ? ` / ${copy.durableSummary.categoryPrefix} ${stock.category}` : ""}
        </p>
        <p className="stock-durable-summary-symbol">{stock.symbol}</p>
        <p className="stock-durable-summary-name">{stock.name}</p>
      </div>

      <dl className="stock-durable-summary-metrics">
        {holder && <div><dt>{locale === "bn" ? "আপনার হোল্ডিংয়ের জন্য" : "For your holding"}</dt><dd>{holder.label} · {holder.reason}</dd></div>}
        <div>
          <dt>{copy.durableSummary.decisionSupport} · {holder ? (locale === "bn" ? "সাধারণ অ্যাকশন · আরও যোগ করার ক্ষেত্রে" : "Public action · Adding to this position") : (locale === "bn" ? "নতুন অবস্থান বিবেচনায়" : "For a prospective entry")}</dt>
          <dd>
            {action?.replace("_", " ") ?? (locale === "bn" ? "সিদ্ধান্ত অনুপলব্ধ" : "Decision unavailable")}
            <DecisionPublicationLabel decision={decision} locale={locale} />
            <EntryApplicabilityLabel assessment={decision.entry_applicability} locale={locale} announce={false} />
            <span className="stock-durable-summary-confidence">{evidenceLabel(decision.decision.evidence_status, locale)}</span>
          </dd>
        </div>
        <div>
          <dt>{copy.header.last}</dt>
          <dd>{formatNumber(latestPrice)} <QuotePublicationLabel locale={locale} quote={display} /></dd>
        </div>
        <div>
          <dt>{copy.header.change}</dt>
          <dd>{formatPercent(changePercent)}</dd>
        </div>
        <div>
          <dt>{copy.header.marketCap}</dt>
          <dd>{formatMarketCapBdt(marketCap)}</dd>
        </div>
        <div>
          <dt>{copy.decision.risk}</dt>
          <dd>{decision.trading_risk?.label ?? decision.risk.label}</dd>
        </div>
        <div>
          <dt>{copy.durableSummary.data}</dt>
          <dd>
            {freshnessLabel}
            {" "}<DecisionPublicationLabel decision={decision} locale={locale} />
          </dd>
        </div>
      </dl>

      <p className="stock-durable-summary-disclaimer">
        {copy.durableSummary.disclaimer}
        {uncertaintyBits.length > 0 ? ` Uncertainty: ${uncertaintyBits.join("; ")}.` : ""}
      </p>
    </section>
  );
}
