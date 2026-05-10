import Link from "next/link";

import type { HeatmapTileModel } from "@/features/market-dashboard/types/market-dashboard-types";

type InstitutionalHeatmapProps = {
  tiles: HeatmapTileModel[];
};

export function InstitutionalHeatmap({ tiles }: InstitutionalHeatmapProps) {
  return (
    <section className="workspace-card heatmap-card">
      <div className="section-heading">
        <p className="eyebrow">Institutional Heatmap</p>
        <h2>Sector attention map</h2>
      </div>
      <div className="heatmap-grid">
        {tiles.length ? (
          tiles.map((tile) => (
            <Link
              className={`heatmap-tile heatmap-tile-${tile.tone}`}
              href={tile.href}
              key={tile.stockId}
              style={{ flexGrow: tile.weight }}
              title={`${tile.symbol} ${tile.sector} ${tile.latestPrice} ${tile.turnover}`}
            >
              <strong>{tile.label}</strong>
              <span>{tile.value}</span>
              <small>{tile.sector}</small>
            </Link>
          ))
        ) : (
          <div className="empty-state">No latest stock prices are available for heatmap construction yet.</div>
        )}
      </div>
    </section>
  );
}
