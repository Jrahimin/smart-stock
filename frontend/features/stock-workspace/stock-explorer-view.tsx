"use client";

import Link from "next/link";
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

import { FloatingRefreshButton } from "@/components/ui/floating-refresh-button";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import type { WatchlistFilterMode } from "@/features/watchlist/types/watchlist-types";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { getVolumeBehaviorId, resolveTraderDecision } from "@/lib/market/trader-decision";

const columnHelper = createColumnHelper<StockIntelligenceModel>();
const NUMERIC_EXPLORER_COLUMNS = new Set(["latestPrice", "change", "turnover", "volume", "rsi", "confidence"]);

export function StockExplorerView() {
  const { universe, isLoading, isError, stocks, refetch } = useMarketUniverse({ stockLimit: 500, priceWindowLimit: 90 });
  const { watchedStockIds, holdingStockIds } = useUserWatchlist();
  const [search, setSearch] = useState("");
  const [watchlistFilter, setWatchlistFilter] = useState<WatchlistFilterMode>("ALL");
  const deferredSearch = useDeferredValue(search);
  const [dataQualityFilter, setDataQualityFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");
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
      const matchesSearch =
        !query ||
        stock.stock.symbol.toLowerCase().includes(query) ||
        stock.stock.name.toLowerCase().includes(query) ||
        (stock.stock.category ?? "").toLowerCase().includes(query) ||
        stock.sector.toLowerCase().includes(query);
      const decision = resolveTraderDecision(stock);
      const matchesSignal = signalFilter === "ALL" || decision.recommendation === signalFilter;
      const matchesRisk = riskFilter === "ALL" || decision.riskLabel === riskFilter;
      const matchesDataQuality = dataQualityFilter === "ALL" || stock.dataQuality === dataQualityFilter;
      const matchesVolume = volumeFilter === "ALL" || getVolumeBehaviorId(stock) === volumeFilter;
      const stockId = stock.stock.id;
      const isWatched = watchedStockIds.has(stockId);
      const isHolding = holdingStockIds.has(stockId);
      const matchesWatchlist =
        watchlistFilter === "ALL" ||
        (watchlistFilter === "WATCHLISTED" && isWatched) ||
        (watchlistFilter === "NOT_WATCHLISTED" && !isWatched) ||
        (watchlistFilter === "HOLDINGS" && isHolding);
      return matchesSearch && matchesSignal && matchesRisk && matchesDataQuality && matchesVolume && matchesWatchlist;
    });
  }, [dataQualityFilter, deferredSearch, holdingStockIds, riskFilter, signalFilter, universe, volumeFilter, watchlistFilter, watchedStockIds]);
  const visibleUniverse = useMemo(() => filteredUniverse.slice(0, visibleCount), [filteredUniverse, visibleCount]);

  useEffect(() => {
    setVisibleCount(120);
    tableContainerRef.current?.scrollTo({ top: 0 });
  }, [dataQualityFilter, deferredSearch, riskFilter, signalFilter, volumeFilter, watchlistFilter]);

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
          <Link href={`/stocks/${info.row.original.stock.exchange}/${info.row.original.stock.symbol}`}>
            <strong>
              <span className={`signal-dot signal-dot-${resolveTraderDecision(info.row.original).recommendation.toLowerCase()}`} />
              {info.getValue()}
              <span
                className={`trend-icon trend-icon-${info.row.original.trend.toLowerCase()}`}
                aria-label={formatTrend(info.row.original.trend)}
                title={formatTrend(info.row.original.trend)}
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
      columnHelper.accessor((row) => resolveTraderDecision(row).recommendation, {
        id: "signal",
        header: "Action",
        cell: (info) => {
          const decision = resolveTraderDecision(info.row.original);
          return (
            <span className={`signal-chip signal-chip-${decision.recommendation.toLowerCase()}`} title={decision.reason}>
              <span className={`signal-dot signal-dot-${decision.recommendation.toLowerCase()}`} />
              {decision.recommendation}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => resolveTraderDecision(row).confidence, {
        id: "confidence",
        header: "Conf.",
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
    [],
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
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Stock Explorer</p>
          <h1>High-speed stock discovery</h1>
          <span>
            {filteredUniverse.length} price-backed instruments from {stocks.length} active stocks. Showing {visibleUniverse.length}.
          </span>
        </div>
        <div className="explorer-controls">
          <input placeholder="Search symbol, company, sector..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={signalFilter} onChange={(event) => setSignalFilter(event.target.value)}>
            <option value="ALL">All actions</option>
            <option value="BUY">BUY</option>
            <option value="WAIT">WAIT</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="ALL">All risk</option>
            <option value="LOW">Low risk</option>
            <option value="MEDIUM">Medium risk</option>
            <option value="HIGH">High risk</option>
            <option value="SPECULATIVE">Speculative</option>
          </select>
          <select value={dataQualityFilter} onChange={(event) => setDataQualityFilter(event.target.value)}>
            <option value="ALL">All quality</option>
            <option value="OK">OK</option>
            <option value="PARTIAL">Partial</option>
            <option value="SUSPICIOUS">Source check</option>
          </select>
          <select value={volumeFilter} onChange={(event) => setVolumeFilter(event.target.value)}>
            <option value="ALL">All volume</option>
            <option value="EXPANSION">Volume expansion</option>
            <option value="NORMAL">Normal volume</option>
            <option value="THIN">Thin volume</option>
          </select>
          <div className="explorer-controls-watchlist" role="group" aria-label="Watchlist filters">
            <select value={watchlistFilter} onChange={(event) => setWatchlistFilter(event.target.value as WatchlistFilterMode)}>
              <option value="ALL">All stocks</option>
              <option value="WATCHLISTED">Watchlisted only</option>
              <option value="NOT_WATCHLISTED">Not watchlisted</option>
              <option value="HOLDINGS">Holdings only</option>
            </select>
            <button
              className={`explorer-watchlist-quick ${watchlistFilter === "WATCHLISTED" ? "is-active" : ""}`}
              onClick={() => setWatchlistFilter("WATCHLISTED")}
              type="button"
            >
              My watchlist
            </button>
          </div>
        </div>
      </div>
      {isError ? <div className="data-warning">Could not load stock explorer data.</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
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
      <FloatingRefreshButton onRefresh={refetch} />
    </section>
  );
}

function formatTrend(trend: StockIntelligenceModel["trend"]) {
  return trend.replace("_", " ");
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
