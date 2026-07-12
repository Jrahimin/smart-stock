"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { HeatmapTileModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { formatPercent } from "@/lib/formatters/financial-formatters";

type InstitutionalHeatmapProps = {
  tiles: HeatmapTileModel[];
  copy: DashboardLanguage["heatmap"];
};

const HEATMAP_COLUMNS_PER_PAGE = 5;
const HEATMAP_ROWS_PER_PAGE = 3;

export function InstitutionalHeatmap({ tiles, copy }: InstitutionalHeatmapProps) {
  const [mode, setMode] = useState<"size" | "liquidity">("size");
  const sectorGroups = useMemo(() => {
    const groups = Object.entries(
      tiles.reduce<Record<string, HeatmapTileModel[]>>((groups, tile) => {
        const key = tile.sector || copy.unclassified;
        groups[key] = [...(groups[key] ?? []), tile];
        return groups;
      }, {}),
    )
      .map(([sector, sectorTiles]) => {
        const sortedTiles = [...sectorTiles].sort((a, b) =>
          mode === "liquidity" ? b.liquidityScore - a.liquidityScore : b.weight - a.weight,
        );
        const sectorChangePercent = computeSectorChangePercent(sectorTiles);

        return {
          sector,
          changePercent: sectorChangePercent,
          changeLabel: formatPercent(sectorChangePercent),
          changeTone: getChangeTone(sectorChangePercent),
          pages: buildHeatmapPages(sortedTiles),
          tiles: sortedTiles,
          totalWeight: sectorTiles.reduce((sum, tile) => sum + tile.weight, 0),
          totalLiquidity: sectorTiles.reduce((sum, tile) => sum + tile.liquidityScore, 0),
        };
      })
      .sort((a, b) => (mode === "liquidity" ? b.totalLiquidity - a.totalLiquidity : b.totalWeight - a.totalWeight));

    return groups;
  }, [mode, tiles, copy.unclassified]);
  const advancingCount = tiles.filter((tile) => tile.tone === "positive").length;
  const decliningCount = tiles.filter((tile) => tile.tone === "negative").length;

  return (
    <section className="workspace-card heatmap-card">
      <div className="section-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <span>{copy.description}</span>
      </div>
      <div className="heatmap-toolbar">
        <div aria-label="Heatmap mode" className="heatmap-mode-row">
          <button className={mode === "size" ? "active" : ""} onClick={() => setMode("size")} type="button">
            {copy.marketCap}
          </button>
          <button className={mode === "liquidity" ? "active" : ""} onClick={() => setMode("liquidity")} type="button">
            {copy.liquidity}
          </button>
        </div>
        <div className="heatmap-balance-strip">
          <span>{copy.advancing(advancingCount)}</span>
          <span>{copy.declining(decliningCount)}</span>
          <span>{copy.mapped(tiles.length)}</span>
        </div>
      </div>
      <div className="heatmap-grid">
        {tiles.length ? (
          sectorGroups.map((group, groupIndex) => (
            <div
              className="heatmap-sector-group"
              key={group.sector}
              style={{ "--sector-accent": getSectorAccent(groupIndex) } as CSSProperties}
            >
              <div className="heatmap-sector-heading">
                <div className="heatmap-sector-title">
                  <strong>{group.sector}</strong>
                  <span
                    className={`heatmap-sector-change heatmap-sector-change-${group.changeTone}`}
                    title="Turnover-weighted sector move for the latest session"
                  >
                    <span aria-hidden="true" className="heatmap-sector-change-icon">
                      {group.changeTone === "positive" ? "▲" : group.changeTone === "negative" ? "▼" : "—"}
                    </span>
                    {group.changeLabel}
                  </span>
                </div>
                <span>{copy.names(group.tiles.length)}</span>
              </div>
              <div className="heatmap-sector-scroll">
                {group.pages.map((page, pageIndex) => (
                  <div className="heatmap-sector-page" key={`${group.sector}-${pageIndex}`}>
                    {page.map((tile) => (
                      <Link
                        className={`heatmap-tile heatmap-tile-${tile.tone}`}
                        href={tile.href}
                        key={tile.stockId}
                        title={`${tile.symbol} ${group.sector} | Price ${tile.latestPrice} | Turnover ${tile.turnover}`}
                      >
                        <strong>{tile.label}</strong>
                        <span>{tile.value}</span>
                        <small>{mode === "liquidity" ? copy.liquidityScore(tile.liquidityScore) : tile.turnover}</small>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state empty-state-premium">
            <strong>{copy.emptyTitle}</strong>
            <span>{copy.emptyDescription}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function computeSectorChangePercent(tiles: HeatmapTileModel[]): number {
  if (!tiles.length) {
    return 0;
  }

  const turnoverBacked = tiles.filter((tile) => tile.turnoverValue > 0);
  if (!turnoverBacked.length) {
    return tiles.reduce((sum, tile) => sum + tile.changePercent, 0) / tiles.length;
  }

  const totalTurnover = turnoverBacked.reduce((sum, tile) => sum + tile.turnoverValue, 0);
  if (totalTurnover <= 0) {
    return tiles.reduce((sum, tile) => sum + tile.changePercent, 0) / tiles.length;
  }

  return turnoverBacked.reduce((sum, tile) => sum + tile.changePercent * tile.turnoverValue, 0) / totalTurnover;
}

function getChangeTone(changePercent: number): "positive" | "negative" | "neutral" {
  if (changePercent > 0) {
    return "positive";
  }
  if (changePercent < 0) {
    return "negative";
  }
  return "neutral";
}

function buildHeatmapPages(tiles: HeatmapTileModel[]) {
  const pageSize = HEATMAP_COLUMNS_PER_PAGE * HEATMAP_ROWS_PER_PAGE;
  const pages: HeatmapTileModel[][] = [];

  for (let index = 0; index < tiles.length; index += pageSize) {
    pages.push(tiles.slice(index, index + pageSize));
  }

  return pages;
}

function getSectorAccent(index: number) {
  return ["#7bb7ff", "#9d8cff", "#4bd6a4", "#f0c36a", "#ff9f7a", "#d88cff"][index % 6];
}
