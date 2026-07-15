import { formatNumber, formatPercent, formatMarketCapBdt } from "@/lib/formatters/financial-formatters";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { getStockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type StockDurableSummaryProps = {
  workspace: StockWorkspaceDto;
  locale?: AppLocale;
};

/**
 * Server-presentable durable facts for the stock details page.
 * Renders without client JS. Interactive workspace hydrates around this.
 */
export function StockDurableSummary({ workspace, locale = DEFAULT_LOCALE }: StockDurableSummaryProps) {
  const copy = getStockWorkspaceLanguage(locale);
  const stock = workspace.stock;
  const decision = workspace.decision_support;
  const display = workspace.display_metrics;
  const freshness = decision.data_freshness;
  const prices = [...(workspace.prices ?? [])].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latest = prices.at(-1);
  const latestPrice = display?.current_price ?? (latest ? Number(latest.close_price) : null);
  const changePercent =
    latest?.price_change_percent != null ? Number(latest.price_change_percent) : null;
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
        <div>
          <dt>{copy.header.last}</dt>
          <dd>{formatNumber(latestPrice)}</dd>
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
          <dt>{copy.durableSummary.decisionSupport}</dt>
          <dd>
            {(decision.decision.display_action ??
              (decision.decision.recommendation === "SELL" ? "SELL" : "WAIT")
            ).replace("_", " ")}
            <span className="stock-durable-summary-confidence">
              {" "}
              · {copy.durableSummary.modelConfidence(decision.decision.confidence)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{copy.decision.risk}</dt>
          <dd>{decision.risk.label}</dd>
        </div>
        <div>
          <dt>{copy.durableSummary.data}</dt>
          <dd>
            {freshnessLabel}
            {freshness.latest_trade_date ? copy.durableSummary.asOf(freshness.latest_trade_date) : ""}
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
