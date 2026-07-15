"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { formatTrendAriaLabel } from "@/lib/market/trend-display";
import { getVolumeBehaviorId, resolveTraderDecision } from "@/lib/market/trader-decision";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

const columnHelper = createColumnHelper<StockIntelligenceModel>();
const NUMERIC_EXPLORER_COLUMNS = new Set(["latestPrice", "change", "turnover", "volume", "rsi", "confidence"]);

type ExplorerPortfolioScope = "ALL" | "WATCHLIST" | "HOLDINGS";

export function StockExplorerView() {
  const searchParams = useSearchParams();
  const { universe, isLoading, isError, listedStockCount, loadedPriceCount } = useMarketUniverse({
    stockLimit: 500,
  });
  const { watchedStockIds, holdingStockIds } = useUserWatchlist();
  const decisionByStockId = useMemo(
    () => new Map(universe.map((row) => [row.stock.id, resolveTraderDecision(row)] as const)),
    [universe],
  );
  const [search, setSearch] = useState("");
  const [portfolioScope, setPortfolioScope] = useState<ExplorerPortfolioScope>("ALL");
  const deferredSearch = useDeferredValue(search);
  const [signalFilter, setSignalFilter] = useState("ALL");
  const [volumeFilter, setVolumeFilter] = useState("ALL");
  const [sorting, setSorting] = useState<SortingState>([{ id: "change", desc: true }]);
  const [visibleCount, setVisibleCount] = useState(120);
  const [isPaging, setIsPaging] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const pagingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredUniverse = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return universe.filter((stock) => {
      const decision = decisionByStockId.get(stock.stock.id)!;
      const matchesSearch =
        !query ||
        stock.stock.symbol.toLowerCase().includes(query) ||
        stock.stock.name.toLowerCase().includes(query) ||
        (stock.stock.category ?? "").toLowerCase().includes(query) ||
        stock.sector.toLowerCase().includes(query);
      const matchesSignal = signalFilter === "ALL" || decision.recommendation === signalFilter;
      const matchesVolume = volumeFilter === "ALL" || getVolumeBehaviorId(stock) === volumeFilter;
      const stockId = stock.stock.id;
      const isWatched = watchedStockIds.has(stockId);
      const isHolding = holdingStockIds.has(stockId);
      const matchesPortfolioScope =
        portfolioScope === "ALL" ||
        (portfolioScope === "WATCHLIST" && isWatched) ||
        (portfolioScope === "HOLDINGS" && isHolding);
      return matchesSearch && matchesSignal && matchesVolume && matchesPortfolioScope;
    });
  }, [decisionByStockId, deferredSearch, holdingStockIds, portfolioScope, signalFilter, universe, volumeFilter, watchedStockIds]);
  const visibleUniverse = useMemo(() => filteredUniverse.slice(0, visibleCount), [filteredUniverse, visibleCount]);
  const showEmptyResults = !isLoading && !isError && filteredUniverse.length === 0;
  const emptyResultsMessage = useMemo(() => getEmptyResultsMessage(portfolioScope, deferredSearch), [deferredSearch, portfolioScope]);

  function togglePortfolioScope(scope: Exclude<ExplorerPortfolioScope, "ALL">) {
    setPortfolioScope((current) => (current === scope ? "ALL" : scope));
  }

  useEffect(() => {
    const initialSearch = searchParams.get("search");
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [searchParams]);

  useEffect(() => {
    setVisibleCount(120);
    tableContainerRef.current?.scrollTo({ top: 0 });
  }, [deferredSearch, portfolioScope, signalFilter, volumeFilter]);

  useEffect(() => {
    return () => {
      if (pagingTimerRef.current) {
        clearTimeout(pagingTimerRef.current);
      }
    };
  }, []);

  function handleTableScroll() {
    const element = tableContainerRef.current;
    if (!element || visibleCount >= filteredUniverse.length || isPaging) {
      return;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom > 260) {
      return;
    }

    setIsPaging(true);
    pagingTimerRef.current = setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 100, filteredUniverse.length));
      setIsPaging(false);
    }, 120);
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "watchlist",
        header: "",
        cell: (info) => <WatchlistStarToggle stockId={info.row.original.stock.id} />,
      }),
      columnHelper.accessor((row) => row.stock.symbol, {
        id: "symbol",
        header: "Symbol",
        cell: (info) => (
          <Link href={buildStockDetailPath(info.row.original.stock.exchange, info.row.original.stock.symbol)}>
            <strong>
              <span className={`signal-dot signal-dot-${decisionByStockId.get(info.row.original.stock.id)?.recommendation.toLowerCase() ?? "hold"}`} />
              {info.getValue()}
              <span
                className={`trend-icon trend-icon-${info.row.original.trend.toLowerCase()}`}
                aria-label={formatTrendAriaLabel(info.row.original.trend)}
                title={formatTrendAriaLabel(info.row.original.trend)}
              />
            </strong>
            <span>{info.row.original.stock.name}</span>
          </Link>
        ),
      }),
      columnHelper.accessor("latestPrice", {
        header: "Price",
        cell: (info) => formatNumber(info.getValue()),
      }),
      columnHelper.accessor("priceChangePercent", {
        id: "change",
        header: "% Change",
        cell: (info) => (
          <div className="explorer-change-cell">
            <span className={(info.getValue() ?? 0) >= 0 ? "text-positive" : "text-negative"}>{formatPercent(info.getValue())}</span>
            <div className="mini-momentum-bar" aria-label="Price momentum">
              <span style={{ width: `${Math.min(100, Math.abs(info.getValue() ?? 0) * 12)}%` }} />
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("turnover", {
        header: "Turnover",
        cell: (info) => formatCompactNumber(info.getValue()),
      }),
      columnHelper.accessor("volume", {
        header: "Volume",
        cell: (info) => (
          <div className="volume-intensity-cell">
            <span>{formatCompactNumber(info.getValue())}</span>
            <div className="volume-intensity-bar">
              <span style={{ width: `${getVolumeIntensity(info.row.original)}%` }} />
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("rsi", {
        header: "RSI",
        cell: (info) => (
          <div className="rsi-cell">
            <span>{formatNumber(info.getValue())}</span>
            <div className="rsi-meter">
              <span style={{ width: `${Math.max(0, Math.min(100, info.getValue() ?? 0))}%` }} />
            </div>
          </div>
        ),
      }),
      columnHelper.accessor((row) => decisionByStockId.get(row.stock.id)?.recommendation ?? "WAIT", {
        id: "signal",
        header: "Action",
        cell: (info) => {
          const decision = decisionByStockId.get(info.row.original.stock.id)!;
          return (
            <div className="signal-action-with-condition">
              <span className={`signal-chip signal-chip-${decision.recommendation.toLowerCase()}`} title={decision.reason}>
                <span className={`signal-dot signal-dot-${decision.recommendation.toLowerCase()}`} />
                {decision.recommendation.replace("_", " ")}
              </span>
              {decision.recommendation === "POTENTIAL_BUY" && decision.entryCondition ? (
                <small>{decision.entryCondition}</small>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => decisionByStockId.get(row.stock.id)?.confidence ?? 0, {
        id: "confidence",
        header: "Evidence",
        cell: (info) => (
          <div className="confidence-cell">
            <span>{info.getValue()}%</span>
            <div className="signal-confidence-meter">
              <span style={{ width: `${info.getValue()}%` }} />
            </div>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.stock.sector || "N/A", {
        id: "sector",
        header: "Sector",
        cell: (info) => <span className="stock-sector-value">{info.getValue()}</span>,
      }),
      columnHelper.accessor((row) => row.stock.category ?? "N/A", {
        id: "category",
        header: "Cat.",
        cell: (info) => <span className="stock-category-value">{info.getValue()}</span>,
      }),
    ],
    [decisionByStockId],
  );

  const table = useReactTable({
    data: visibleUniverse,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 58,
    getScrollElement: () => tableContainerRef.current,
    overscan: 8,
  });

  return (
    <section className="stock-explorer-view">
      <WorkspacePageHero
        eyebrow="Stock Explorer"
        filterContextName="stock explorer"
        onFilterTable={setSearch}
        subtitle={
          <>
            {filteredUniverse.length} price-backed instruments from {listedStockCount} listed stocks ({loadedPriceCount} with session data). Showing {visibleUniverse.length}.
          </>
        }
        title="High-speed stock discovery"
      >
        <div className="explorer-controls">
          <select value={signalFilter} onChange={(event) => setSignalFilter(event.target.value)}>
            <option value="ALL">All actions</option>
            <option value="POTENTIAL_BUY">POTENTIAL BUY</option>
            <option value="WAIT">WAIT</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>
          <select value={volumeFilter} onChange={(event) => setVolumeFilter(event.target.value)}>
            <option value="ALL">All volume</option>
            <option value="EXPANSION">Volume expansion</option>
            <option value="NORMAL">Normal volume</option>
            <option value="THIN">Thin volume</option>
          </select>
          <div className="explorer-scope-filters" role="group" aria-label="Portfolio scope">
            <label className={`explorer-scope-toggle ${portfolioScope === "WATCHLIST" ? "is-active" : ""}`}>
              <input
                checked={portfolioScope === "WATCHLIST"}
                onChange={() => togglePortfolioScope("WATCHLIST")}
                type="checkbox"
              />
              <span>Watchlist</span>
            </label>
            <label className={`explorer-scope-toggle ${portfolioScope === "HOLDINGS" ? "is-active" : ""}`}>
              <input
                checked={portfolioScope === "HOLDINGS"}
                onChange={() => togglePortfolioScope("HOLDINGS")}
                type="checkbox"
              />
              <span>Holdings</span>
            </label>
          </div>
        </div>
      </WorkspacePageHero>
      {isError ? <div className="data-warning">Could not load stock explorer data.</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
      {showEmptyResults ? (
        <div className="stock-explorer-empty-state">
          <strong>{emptyResultsMessage.title}</strong>
          <p>{emptyResultsMessage.body}</p>
        </div>
      ) : (
        <div className="stock-table-shell" onScroll={handleTableScroll} ref={tableContainerRef}>
        <table className="stock-explorer-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    className={getExplorerCellClassName(header.column.id)}
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];

              return (
                <tr
                  className="stock-explorer-row"
                  key={row.id}
                  style={{
                    position: "absolute",
                    transform: `translateY(${virtualRow.start}px)`,
                    width: "100%",
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td className={getExplorerCellClassName(cell.column.id)} key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {isPaging || visibleCount < filteredUniverse.length ? (
          <div className="stock-scroll-loader">
            {isPaging ? "Loading more rows..." : "Scroll down to load more rows"}
          </div>
        ) : null}
        </div>
      )}
    </section>
  );
}

function getEmptyResultsMessage(portfolioScope: ExplorerPortfolioScope, search: string) {
  if (portfolioScope === "WATCHLIST") {
    return {
      title: "No watchlist matches",
      body: "Star stocks from the explorer to build your watchlist, or turn off the Watchlist filter to browse everything.",
    };
  }

  if (portfolioScope === "HOLDINGS") {
    return {
      title: "No holdings match",
      body: "Linked portfolio holdings will appear here. Turn off the Holdings filter to browse the full universe.",
    };
  }

  if (search.trim()) {
    return {
      title: "No stocks match your search",
      body: "Try another symbol, name, or sector — or reset the action and volume filters.",
    };
  }

  return {
    title: "No stocks match these filters",
    body: "Adjust the action or volume filters to widen the result set.",
  };
}

function getExplorerCellClassName(columnId: string) {
  if (columnId === "watchlist") {
    return "stock-watchlist-cell";
  }

  if (columnId === "symbol") {
    return "stock-symbol-cell";
  }

  if (columnId === "sector") {
    return "stock-sector-cell";
  }

  if (columnId === "signal") {
    return "stock-signal-cell";
  }

  if (columnId === "category") {
    return "stock-category-cell";
  }

  if (NUMERIC_EXPLORER_COLUMNS.has(columnId)) {
    return "stock-numeric-cell";
  }

  return "stock-meta-cell";
}

function getVolumeIntensity(stock: StockIntelligenceModel) {
  if (!stock.averageVolume || stock.averageVolume <= 0) {
    return 18;
  }

  return Math.min(100, Math.round((stock.volume / stock.averageVolume) * 55));
}
