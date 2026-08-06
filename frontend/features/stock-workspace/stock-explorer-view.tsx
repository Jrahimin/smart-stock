"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import { ExplorerTableSearch } from "@/features/stock-workspace/components/explorer-table-search";
import {
  buildExplorerSearchTextByStockId,
  createDefaultExplorerTableFilters,
  filterExplorerUniverseRows,
  hasActiveExplorerTableFilters,
  resolveTraderDecisionsByStockId,
  type ExplorerPortfolioScope,
  type ExplorerTableFilters,
} from "@/features/stock-workspace/lib/stock-explorer-filters";
import { getStockExplorerLanguage } from "@/features/stock-workspace/stock-explorer-language";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { formatTrendAriaLabel } from "@/lib/market/trend-display";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

const columnHelper = createColumnHelper<StockIntelligenceModel>();
const NUMERIC_EXPLORER_COLUMNS = new Set(["latestPrice", "change", "turnover", "volume", "rsi", "confidence"]);

type StockExplorerViewProps = {
  locale?: AppLocale;
};

export function StockExplorerView({ locale = DEFAULT_LOCALE }: StockExplorerViewProps) {
  const language = getStockExplorerLanguage(locale);
  const searchParams = useSearchParams();
  const { universe, isLoading, isError, isWarmingUp, listedStockCount, loadedPriceCount } = useMarketUniverse({
    stockLimit: 500,
  });
  const { watchedStockIds, holdingStockIds } = useUserWatchlist();
  const decisionByStockId = useMemo(() => resolveTraderDecisionsByStockId(universe), [universe]);
  const searchTextByStockId = useMemo(() => buildExplorerSearchTextByStockId(universe), [universe]);

  const [filters, setFilters] = useState<ExplorerTableFilters>(createDefaultExplorerTableFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "change", desc: true }]);
  const [visibleCount, setVisibleCount] = useState(120);
  const [isPaging, setIsPaging] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const pagingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTableSearch = useCallback((tableSearch: string) => {
    setFilters((current) => ({ ...current, tableSearch }));
  }, []);

  const deferredTableSearch = useDeferredValue(filters.tableSearch);

  const scopedUniverse = useMemo(
    () =>
      filterExplorerUniverseRows({
        universe,
        decisionByStockId,
        searchTextByStockId,
        filters: {
          tableSearch: "",
          signalFilter: filters.signalFilter,
          volumeFilter: filters.volumeFilter,
          portfolioScope: filters.portfolioScope,
        },
        watchedStockIds,
        holdingStockIds,
      }),
    [
      decisionByStockId,
      filters.portfolioScope,
      filters.signalFilter,
      filters.volumeFilter,
      holdingStockIds,
      searchTextByStockId,
      universe,
      watchedStockIds,
    ],
  );

  function togglePortfolioScope(scope: Exclude<ExplorerPortfolioScope, "ALL">) {
    setFilters((current) => ({
      ...current,
      portfolioScope: current.portfolioScope === scope ? "ALL" : scope,
    }));
  }

  function resetTableFilters() {
    setFilters(createDefaultExplorerTableFilters());
  }

  useEffect(() => {
    const initialSearch = searchParams.get("search");
    if (initialSearch) {
      setTableSearch(initialSearch);
    }
  }, [searchParams, setTableSearch]);

  useEffect(() => {
    setVisibleCount(120);
    tableContainerRef.current?.scrollTo({ top: 0 });
  }, [deferredTableSearch, filters.portfolioScope, filters.signalFilter, filters.volumeFilter]);

  useEffect(() => {
    return () => {
      if (pagingTimerRef.current) {
        clearTimeout(pagingTimerRef.current);
      }
    };
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "watchlist",
        header: "",
        cell: (info) => <WatchlistStarToggle stockId={info.row.original.stock.id} />,
      }),
      columnHelper.accessor((row) => row.stock.symbol, {
        id: "symbol",
        header: language.columns.symbol,
        cell: (info) => (
          <Link href={buildStockDetailPath(info.row.original.stock.exchange, info.row.original.stock.symbol)}>
            <strong>
              <span
                className={`signal-dot signal-dot-${decisionByStockId.get(info.row.original.stock.id)?.recommendation.toLowerCase() ?? "hold"}`}
              />
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
        header: language.columns.price,
        cell: (info) => formatNumber(info.getValue()),
      }),
      columnHelper.accessor("priceChangePercent", {
        id: "change",
        header: language.columns.change,
        cell: (info) => (
          <div className="explorer-change-cell">
            <span className={(info.getValue() ?? 0) >= 0 ? "text-positive" : "text-negative"}>
              {formatPercent(info.getValue())}
            </span>
            <div className="mini-momentum-bar" aria-label="Price momentum">
              <span style={{ width: `${Math.min(100, Math.abs(info.getValue() ?? 0) * 12)}%` }} />
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("turnover", {
        header: language.columns.turnover,
        cell: (info) => formatCompactNumber(info.getValue()),
      }),
      columnHelper.accessor("volume", {
        header: language.columns.volume,
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
        header: language.columns.rsi,
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
        header: language.columns.action,
        cell: (info) => {
          const decision = decisionByStockId.get(info.row.original.stock.id)!;
          return (
            <span className="stock-explorer-action-badge" title={decision.reason || undefined}>
              <SignalBadge density="compact" signal={decision.recommendation} />
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => decisionByStockId.get(row.stock.id)?.confidence ?? 0, {
        id: "confidence",
        header: language.columns.evidence,
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
        header: language.columns.sector,
        cell: (info) => <span className="stock-sector-value">{info.getValue()}</span>,
      }),
      columnHelper.accessor((row) => row.stock.category ?? "N/A", {
        id: "category",
        header: language.columns.category,
        cell: (info) => <span className="stock-category-value">{info.getValue()}</span>,
      }),
    ],
    [decisionByStockId, language.columns],
  );

  const table = useReactTable({
    data: scopedUniverse,
    columns,
    state: {
      sorting,
      globalFilter: deferredTableSearch,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: (updater) => {
      const next = typeof updater === "function" ? updater(filters.tableSearch) : updater;
      setTableSearch(typeof next === "string" ? next : String(next ?? ""));
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "").trim().toLowerCase();
      if (!query) {
        return true;
      }
      const searchText = searchTextByStockId.get(row.original.stock.id) ?? "";
      return searchText.includes(query);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const filteredRows = table.getRowModel().rows;
  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);
  const filteredCount = filteredRows.length;
  const isTableFiltered = hasActiveExplorerTableFilters(filters);
  const showEmptyResults = !isLoading && !isError && !isWarmingUp && filteredCount === 0;
  const emptyResultsMessage = useMemo(
    () => getEmptyResultsMessage(filters, language),
    [filters, language],
  );

  function handleTableScroll() {
    const element = tableContainerRef.current;
    if (!element || visibleCount >= filteredCount || isPaging) {
      return;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom > 260) {
      return;
    }

    setIsPaging(true);
    pagingTimerRef.current = setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 100, filteredCount));
      setIsPaging(false);
    }, 120);
  }

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    estimateSize: () => 54,
    getScrollElement: () => tableContainerRef.current,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8,
  });

  return (
    <section className="stock-explorer-view">
      <WorkspacePageHero
        commandSearchAriaLabel={language.search.globalAriaLabel}
        commandSearchPlacement="status"
        commandSearchPlaceholder={language.search.globalPlaceholder}
        eyebrow={language.hero.eyebrow}
        locale={locale}
        localeSwitcherAria={language.localeSwitcherAria}
        subtitle={
          isLoading
            ? language.hero.loadingSubtitle
            : language.hero.readySubtitle({
                filteredCount,
                listedStockCount,
                loadedPriceCount,
                visibleCount: visibleRows.length,
                isTableFiltered,
              })
        }
        title={language.hero.title}
      >
        <div className="explorer-controls explorer-toolbar" role="toolbar" aria-label={language.filters.toolbarAria}>
          <div className="explorer-toolbar-filters">
            <select
              value={filters.signalFilter}
              onChange={(event) => setFilters((current) => ({ ...current, signalFilter: event.target.value }))}
            >
              <option value="ALL">{language.filters.allActions}</option>
              <option value="POTENTIAL_BUY">POTENTIAL BUY</option>
              <option value="WAIT">WAIT</option>
              <option value="HOLD">HOLD</option>
              <option value="SELL">SELL</option>
            </select>
            <select
              value={filters.volumeFilter}
              onChange={(event) => setFilters((current) => ({ ...current, volumeFilter: event.target.value }))}
            >
              <option value="ALL">{language.filters.allVolume}</option>
              <option value="EXPANSION">{language.filters.volumeExpansion}</option>
              <option value="NORMAL">{language.filters.volumeNormal}</option>
              <option value="THIN">{language.filters.volumeThin}</option>
            </select>
            <div className="explorer-scope-filters" role="group" aria-label={language.filters.portfolioScopeAria}>
              <label className={`explorer-scope-toggle ${filters.portfolioScope === "WATCHLIST" ? "is-active" : ""}`}>
                <input
                  checked={filters.portfolioScope === "WATCHLIST"}
                  onChange={() => togglePortfolioScope("WATCHLIST")}
                  type="checkbox"
                />
                <span>{language.filters.watchlist}</span>
              </label>
              <label className={`explorer-scope-toggle ${filters.portfolioScope === "HOLDINGS" ? "is-active" : ""}`}>
                <input
                  checked={filters.portfolioScope === "HOLDINGS"}
                  onChange={() => togglePortfolioScope("HOLDINGS")}
                  type="checkbox"
                />
                <span>{language.filters.holdings}</span>
              </label>
            </div>
          </div>
          <div className="explorer-toolbar-search">
            <ExplorerTableSearch
              ariaLabel={language.search.tableAriaLabel}
              clearAriaLabel={language.search.clearTableSearchAria}
              onChange={setTableSearch}
              placeholder={language.search.tablePlaceholder}
              value={filters.tableSearch}
            />
            <button
              className="explorer-toolbar-reset"
              disabled={!isTableFiltered}
              onClick={resetTableFilters}
              type="button"
            >
              {language.filters.reset}
            </button>
          </div>
        </div>
      </WorkspacePageHero>
      {isWarmingUp ? <div className="data-warning">{language.states.warmingUp}</div> : null}
      {isError ? <div className="data-warning">{language.states.loadError}</div> : null}
      {isLoading ? <MarketActivityLoader /> : null}
      {showEmptyResults ? (
        <div className="stock-explorer-empty-state">
          <strong>{emptyResultsMessage.title}</strong>
          <p>{emptyResultsMessage.body}</p>
          {isTableFiltered ? (
            <button className="explorer-empty-reset" onClick={resetTableFilters} type="button">
              {language.states.resetFiltersAction}
            </button>
          ) : null}
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
                const row = visibleRows[virtualRow.index];

                return (
                  <tr
                    className="stock-explorer-row"
                    data-index={virtualRow.index}
                    key={row.id}
                    ref={rowVirtualizer.measureElement}
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
          {isPaging || visibleCount < filteredCount ? (
            <div className="stock-scroll-loader">
              {isPaging ? language.states.loadingMore : language.states.scrollForMore}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function getEmptyResultsMessage(
  filters: ExplorerTableFilters,
  language: ReturnType<typeof getStockExplorerLanguage>,
) {
  if (filters.portfolioScope === "WATCHLIST") {
    return {
      title: language.states.emptyWatchlistTitle,
      body: language.states.emptyWatchlistBody,
    };
  }

  if (filters.portfolioScope === "HOLDINGS") {
    return {
      title: language.states.emptyHoldingsTitle,
      body: language.states.emptyHoldingsBody,
    };
  }

  if (filters.tableSearch.trim()) {
    return {
      title: language.states.emptySearchTitle(filters.tableSearch.trim()),
      body: language.states.emptySearchBody,
    };
  }

  return {
    title: language.states.emptyFiltersTitle,
    body: language.states.emptyFiltersBody,
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
