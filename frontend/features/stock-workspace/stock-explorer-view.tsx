"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";

import { useMarketUniverse } from "@/features/market-dashboard/hooks/use-market-universe";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

const columnHelper = createColumnHelper<StockIntelligenceModel>();

export function StockExplorerView() {
  const { universe, isLoading, isError } = useMarketUniverse();
  const [search, setSearch] = useState("");
  const [signalFilter, setSignalFilter] = useState("ALL");
  const [sorting, setSorting] = useState<SortingState>([{ id: "change", desc: true }]);

  const filteredUniverse = useMemo(() => {
    const query = search.trim().toLowerCase();
    return universe.filter((stock) => {
      const matchesSearch =
        !query ||
        stock.stock.symbol.toLowerCase().includes(query) ||
        stock.stock.name.toLowerCase().includes(query) ||
        stock.sector.toLowerCase().includes(query);
      const matchesSignal = signalFilter === "ALL" || stock.signal.signal === signalFilter;
      return matchesSearch && matchesSignal;
    });
  }, [search, signalFilter, universe]);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.stock.symbol, {
        id: "symbol",
        header: "Symbol",
        cell: (info) => (
          <Link href={`/stocks/${info.row.original.stock.exchange}/${info.row.original.stock.symbol}`}>
            <strong>{info.getValue()}</strong>
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
        cell: (info) => <span className={(info.getValue() ?? 0) >= 0 ? "text-positive" : "text-negative"}>{formatPercent(info.getValue())}</span>,
      }),
      columnHelper.accessor("turnover", {
        header: "Turnover",
        cell: (info) => formatCompactNumber(info.getValue()),
      }),
      columnHelper.accessor("volume", {
        header: "Volume",
        cell: (info) => formatCompactNumber(info.getValue()),
      }),
      columnHelper.accessor("rsi", {
        header: "RSI",
        cell: (info) => formatNumber(info.getValue()),
      }),
      columnHelper.accessor("trend", {
        header: "Trend",
      }),
      columnHelper.accessor((row) => row.signal.signal, {
        id: "signal",
        header: "Signal",
      }),
      columnHelper.accessor((row) => row.signal.confidence, {
        id: "confidence",
        header: "Conf.",
        cell: (info) => `${info.getValue()}%`,
      }),
      columnHelper.accessor((row) => row.stock.category ?? "N/A", {
        id: "category",
        header: "Cat.",
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: filteredUniverse,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <section className="stock-explorer-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Stock Explorer</p>
          <h1>High-speed stock discovery</h1>
          <span>{filteredUniverse.length} price-backed instruments loaded</span>
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
      {isLoading ? <div className="data-warning">Loading active stocks and latest prices...</div> : null}
      <div className="stock-table-shell">
        <table className="stock-explorer-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
