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
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

const columnHelper = createColumnHelper<StockIntelligenceModel>();
const NUMERIC_EXPLORER_COLUMNS = new Set(["latestPrice", "change", "turnover", "volume", "rsi", "confidence"]);

export function StockExplorerView() {
  const { universe, isLoading, isError, stocks, refetch } = useMarketUniverse({ stockLimit: 500, priceWindowLimit: 30 });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [signalFilter, setSignalFilter] = useState("ALL");
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
        stock.sector.toLowerCase().includes(query);
      const matchesSignal = signalFilter === "ALL" || stock.signal.signal === signalFilter;
      return matchesSearch && matchesSignal;
    });
  }, [deferredSearch, signalFilter, universe]);
  const visibleUniverse = useMemo(() => filteredUniverse.slice(0, visibleCount), [filteredUniverse, visibleCount]);

  useEffect(() => {
    setVisibleCount(120);
    tableContainerRef.current?.scrollTo({ top: 0 });
  }, [deferredSearch, signalFilter]);

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
      columnHelper.accessor((row) => row.stock.symbol, {
        id: "symbol",
        header: "Symbol",
        cell: (info) => (
          <Link href={`/stocks/${info.row.original.stock.exchange}/${info.row.original.stock.symbol}`}>
            <strong>
              <span className={`signal-dot signal-dot-${info.row.original.signal.signal.toLowerCase()}`} />
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
      columnHelper.accessor((row) => row.signal.signal, {
        id: "signal",
        header: "Signal",
        cell: (info) => (
          <span className={`signal-chip signal-chip-${info.getValue().toLowerCase()}`}>
            <span className={`signal-dot signal-dot-${info.getValue().toLowerCase()}`} />
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.signal.confidence, {
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
            <option value="ALL">All signals</option>
            <option value="BUY">BUY</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>
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
