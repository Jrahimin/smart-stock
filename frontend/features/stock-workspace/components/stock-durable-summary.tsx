import { formatNumber, formatPercent, formatMarketCapBdt } from "@/lib/formatters/financial-formatters";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";

type StockDurableSummaryProps = {
  workspace: StockWorkspaceDto;
};

/**
 * Server-presentable durable facts for the stock details page.
 * Renders without client JS. Interactive workspace hydrates around this.
 */
export function StockDurableSummary({ workspace }: StockDurableSummaryProps) {
  const stock = workspace.stock;
  const decision = workspace.decision_support;
  const display = workspace.display_metrics;
  const freshness = decision.data_freshness;
  const prices = [...(workspace.prices ?? [])].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const latest = prices.at(-1);
  const previous = prices.at(-2);
  const latestPrice = display?.current_price ?? (latest ? Number(latest.close_price) : null);
  const changePercent =
    latest && previous && Number(previous.close_price) > 0
      ? ((Number(latest.close_price) - Number(previous.close_price)) / Number(previous.close_price)) * 100
      : latest?.price_change_percent != null
        ? Number(latest.price_change_percent)
        : null;
  const marketCap = display?.market_cap ?? decision.valuation?.market_cap ?? (stock.market_cap != null ? Number(stock.market_cap) : null);

  const freshnessLabel = freshness.is_stale ? "Stale" : freshness.is_sparse ? "Sparse" : "Fresh";
  const uncertaintyBits = [
    freshness.is_stale ? "stale prices" : null,
    freshness.is_sparse ? "sparse history" : null,
    ...(freshness.missing_fields ?? []).slice(0, 3).map((field) => `missing ${field}`),
  ].filter(Boolean);

  return (
    <section aria-label="Stock summary" className="sr-only" data-testid="stock-durable-summary">
      <div className="stock-durable-summary-identity">
        <p className="eyebrow">
          {stock.exchange}
          {stock.sector ? ` / ${stock.sector}` : ""}
          {stock.category ? ` / Category ${stock.category}` : ""}
        </p>
        <p className="stock-durable-summary-symbol">{stock.symbol}</p>
        <p className="stock-durable-summary-name">{stock.name}</p>
      </div>

      <dl className="stock-durable-summary-metrics">
        <div>
          <dt>Last</dt>
          <dd>{formatNumber(latestPrice)}</dd>
        </div>
        <div>
          <dt>Change</dt>
          <dd>{formatPercent(changePercent)}</dd>
        </div>
        <div>
          <dt>Market Cap</dt>
          <dd>{formatMarketCapBdt(marketCap)}</dd>
        </div>
        <div>
          <dt>Decision support</dt>
          <dd>
            {decision.decision.recommendation}
            <span className="stock-durable-summary-confidence">
              {" "}
              · {decision.decision.confidence}% model confidence
            </span>
          </dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{decision.risk.label}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>
            {freshnessLabel}
            {freshness.latest_trade_date ? ` · as of ${freshness.latest_trade_date}` : ""}
          </dd>
        </div>
      </dl>

      <p className="stock-durable-summary-disclaimer">
        Snapshot-based market data and rule-based decision support — not live quotes and not investment advice.
        {uncertaintyBits.length > 0 ? ` Uncertainty: ${uncertaintyBits.join("; ")}.` : ""}
      </p>
    </section>
  );
}
