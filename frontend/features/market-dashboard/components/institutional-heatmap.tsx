"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import type { HeatmapTileModel } from "@/features/market-dashboard/types/market-dashboard-types";

type InstitutionalHeatmapProps = {
  tiles: HeatmapTileModel[];
};

const HEATMAP_COLUMNS_PER_PAGE = 5;
const HEATMAP_ROWS_PER_PAGE = 3;

export function InstitutionalHeatmap({ tiles }: InstitutionalHeatmapProps) {
  const [mode, setMode] = useState<"size" | "liquidity">("size");
  const sectorGroups = useMemo(() => {
    const groups = Object.entries(
        tiles.reduce<Record<string, HeatmapTileModel[]>>((groups, tile) => {
          const key = tile.sector || "Unclassified";
          groups[key] = [...(groups[key] ?? []), tile];
          return groups;
        }, {}),
      )
      .map(([sector, sectorTiles]) => {
        const sortedTiles = [...sectorTiles].sort((a, b) =>
          mode === "liquidity" ? b.liquidityScore - a.liquidityScore : b.weight - a.weight,
        );

        return {
          sector,
          pages: buildHeatmapPages(sortedTiles),
          tiles: sortedTiles,
          totalWeight: sectorTiles.reduce((sum, tile) => sum + tile.weight, 0),
          totalLiquidity: sectorTiles.reduce((sum, tile) => sum + tile.liquidityScore, 0),
        };
      })
      .sort((a, b) => (mode === "liquidity" ? b.totalLiquidity - a.totalLiquidity : b.totalWeight - a.totalWeight));

    return groups;
  }, [mode, tiles]);
  const advancingCount = tiles.filter((tile) => tile.tone === "positive").length;
  const decliningCount = tiles.filter((tile) => tile.tone === "negative").length;

  return (
    <section className="workspace-card heatmap-card">
      <div className="section-heading">
        <p className="eyebrow">Institutional Heatmap</p>
        <h2>Sector-weighted market map</h2>
        <span>Tiles size by market footprint; color shows latest price pressure.</span>
      </div>
      <div className="heatmap-toolbar">
        <div className="heatmap-mode-row" aria-label="Heatmap mode">
          <button className={mode === "size" ? "active" : ""} onClick={() => setMode("size")} type="button">
            Market cap
          </button>
          <button className={mode === "liquidity" ? "active" : ""} onClick={() => setMode("liquidity")} type="button">
            Liquidity
          </button>
        </div>
        <div className="heatmap-balance-strip">
          <span>{advancingCount} advancing</span>
          <span>{decliningCount} declining</span>
          <span>{tiles.length} mapped</span>
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
                <strong>{group.sector}</strong>
                <span>{group.tiles.length} names</span>
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
                        <span className="heatmap-tile-star">
                          <WatchlistStarToggle stockId={tile.stockId} stopPropagation />
                        </span>
                        <strong>{tile.label}</strong>
                        <span>{tile.value}</span>
                        <small>{mode === "liquidity" ? `Liquidity ${tile.liquidityScore}%` : tile.turnover}</small>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state empty-state-premium">
            <strong>Market map awaiting price rows</strong>
            <span>Once latest OHLCV data syncs, this area will rank liquid sector clusters and attention-worthy movers.</span>
          </div>
        )}
      </div>
    </section>
  );
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
