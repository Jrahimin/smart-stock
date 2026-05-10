import type { WatchlistStock } from "@/lib/api/backend-api-types";

import { StatusBadge } from "@/components/ui/status-badge";

type StockWatchlistTableProps = {
  stocks: WatchlistStock[];
};

export function StockWatchlistTable({ stocks }: StockWatchlistTableProps) {
  return (
    <div className="watchlist-table-wrapper">
      <table className="watchlist-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Exchange</th>
            <th>Price</th>
            <th>Change</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const tone =
              stock.signal === "BUY" ? "positive" : stock.signal === "SELL" ? "negative" : "neutral";

            return (
              <tr key={stock.symbol}>
                <td>{stock.symbol}</td>
                <td>{stock.name}</td>
                <td>{stock.exchange}</td>
                <td>{stock.price}</td>
                <td>{stock.changePercent}</td>
                <td>
                  <StatusBadge label={stock.signal} tone={tone} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

