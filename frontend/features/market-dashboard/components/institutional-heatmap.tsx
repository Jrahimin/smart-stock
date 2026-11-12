"use client";

import Link from "next/link";
import { getPremiumCopy } from "../premium-copy";
import { useId, useMemo, useState } from "react";

import { sectorName, type TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { HeatmapTileModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { formatPercent } from "@/lib/formatters/financial-formatters";
import type { AppLocale } from "@/lib/locale/app-locale";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";

export function InstitutionalHeatmap({ tiles, copy, locale, loading }: {
  tiles: HeatmapTileModel[]; copy: TerminalCopy; locale: AppLocale; loading: boolean;
}) {
  const premium = getPremiumCopy(locale);
  const [mode, setMode] = useState<"size" | "liquidity">("size");
  const [expanded, setExpanded] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [hoveredId, setHoveredId] = useState("");
  const [focusedId, setFocusedId] = useState("");
  const id = useId();
  const sectorGroups = useMemo(() => {
    const groups = new Map<string, HeatmapTileModel[]>();
    for (const tile of tiles) {
      const key = tile.sector || "Unclassified";
      const group = groups.get(key);
      if (group) group.push(tile);
      else groups.set(key, [tile]);
    }
    return Array.from(groups, ([sector, sectorTiles]) => ({
      sector,
      summary: sectorTiles[0]?.sectorSummary,
      tiles: sectorTiles.sort((a, b) => mode === "liquidity" ? b.liquidityScore - a.liquidityScore : b.weight - a.weight),
      totalWeight: sectorTiles.reduce((sum, tile) => sum + tile.weight, 0),
      totalLiquidity: sectorTiles.reduce((sum, tile) => sum + tile.liquidityScore, 0),
    })).sort((a, b) => mode === "liquidity" ? b.totalLiquidity - a.totalLiquidity : b.totalWeight - a.totalWeight);
  }, [mode, tiles]);
  const hasMore = sectorGroups.length > 2 || sectorGroups.some((group) => group.tiles.length > 6);
  const visibleGroups = expanded ? sectorGroups : sectorGroups.slice(0, 2);
  const picked = tiles.find((tile) => tile.stockId === pickedId);
  const active = tiles.find((tile) => tile.stockId === (hoveredId || focusedId));
  const tileDetails = (tile: HeatmapTileModel) =>
    `${copy.price} ${tile.latestPrice === "N/A" ? copy.missing : `BDT ${tile.latestPrice}`} · ${copy.turnover} ${tile.turnover === "N/A" ? copy.missing : `BDT ${tile.turnover}`} · ${tile.tradeDate ? shortTradeDate(tile.tradeDate, locale) : copy.missing}`;

  return <section className="sw-map" aria-labelledby={id + "-title"} aria-busy={loading}>
    <div data-guide="sector-map">
      <div className="sw-map-header">
        <h2 className="sw-section-title" id={id + "-title"}>{premium.sectorMap}</h2>
        <div className="sw-map-legend">
          <span className="sw-positive"><i aria-hidden="true" />{copy.up}</span>
          <span><i aria-hidden="true" />{copy.flat}</span>
          <span className="sw-negative"><i aria-hidden="true" />{copy.down}</span>
        </div>
      </div>
      {!loading && tiles.length > 0 ? <>
      <div className="sw-map-toolbar">
        <div className="sw-mode" aria-label={copy.mode} aria-describedby={tiles.length ? id + "-order" : undefined} role="group">
          <button aria-pressed={mode === "size"} onClick={() => setMode("size")} type="button">{copy.marketCap}</button>
          <button aria-pressed={mode === "liquidity"} onClick={() => setMode("liquidity")} type="button">{copy.liquidity}</button>
        </div>
        <span className="sw-map-scope" id={id + "-order"}>{!expanded && hasMore ? copy.mapPreview(visibleGroups.length, sectorGroups.length) : copy.coverage(tiles.length)}</span>
        {hasMore ? <button aria-controls={id + "-tiles"} aria-expanded={expanded} className="sw-map-expand" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? copy.showLess : copy.showFullMap} <span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
        </button> : null}
        <div className="sw-map-inspect">
        <details>
          <summary>{copy.tileDetails}</summary>
          <div className="sw-map-picker">
            <select aria-label={copy.pickStock} value={pickedId} onChange={(event) => setPickedId(event.target.value)}>
              <option value="">{copy.pickStock}</option>
              {sectorGroups.map((group) => <optgroup key={group.sector} label={sectorName(group.sector, locale)}>
                {group.tiles.map((tile) => <option key={tile.stockId} value={tile.stockId}>{tile.symbol}</option>)}
              </optgroup>)}
            </select>
            {picked ? <><span role="status">{tileDetails(picked)}</span>
              <Link href={picked.href} prefetch={false}>{copy.stockDetailLink} <span aria-hidden="true">→</span></Link></> : null}
          </div>
        </details>
        </div>
      </div>
      <div className="sw-map-explanation">
        <details className="sw-map-method"><summary>{premium.methodology}</summary><p>{copy.coverage(tiles.length)}. {copy.mapOrder} {premium.method}</p></details>
        <p className="sw-map-readout" aria-hidden="true">{active ? <><strong>{active.symbol}</strong> · {tileDetails(active)}</> : null}</p>
      </div>
      </> : null}
    </div>
    {loading ? <p className="sw-state" role="status">{copy.loading}</p> : tiles.length ? <>
      <div className={expanded ? "sw-map-viewport is-expanded" : "sw-map-viewport"} id={id + "-tiles"} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? copy.map : undefined} role={expanded ? "region" : undefined}>
        {visibleGroups.map((group, index) => <div className="sw-sector" key={group.sector}>
          <h3 className="sw-sector-heading">
            {sectorName(group.sector, locale)}
            <span className={"sw-sector-move sw-" + getChangeTone(group.summary?.changePercent ?? null)}>{formatPercent(group.summary?.changePercent ?? null)}</span>
            <small>{group.summary ? premium.measured(group.summary.measuredCount, group.summary.totalCount) : copy.missing}{group.summary?.weighting === "EQUAL" ? ` · ${copy.mappedEqualWeight}` : ""}</small>
          </h3>
          <div className="sw-sector-grid" data-guide={index === 0 && !expanded ? "sector-map-tiles" : undefined}>
            {(expanded ? group.tiles : group.tiles.slice(0, 14)).map((tile) => <Link
              className={"sw-tile sw-tile-" + tile.tone}
              href={tile.href}
              key={tile.stockId}
              prefetch={false}
              aria-label={tile.label + " " + (tile.changePercent === null ? copy.missing : tile.value)}
              aria-describedby={id + "-stock-" + tile.stockId}
              onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredId(tile.stockId); }}
              onPointerLeave={() => setHoveredId("")}
              onFocus={() => setFocusedId(tile.stockId)}
              onBlur={() => setFocusedId("")}
            >
              <strong>{tile.label}</strong>
              <span className={"sw-" + tile.tone}>{tile.changePercent === null ? copy.missing : tile.value}</span>
              <span className="sr-only" id={id + "-stock-" + tile.stockId}>{tileDetails(tile)}</span>
            </Link>)}
          </div>
        </div>)}
      </div>
    </> : <p className="sw-state">{copy.mapEmpty}</p>}
  </section>;
}
function getChangeTone(changePercent: number | null): "positive" | "negative" | "neutral" {
  if (changePercent !== null && changePercent > 0) {
    return "positive";
  }
  if (changePercent !== null && changePercent < 0) {
    return "negative";
  }
  return "neutral";
}
