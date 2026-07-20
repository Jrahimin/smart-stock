"use client";

import { useEffect } from "react";
import Link from "next/link";

import { SignalBadge } from "@/components/ui/signal-badge";
import type { RelatedStocksCta, RelatedStocksGroup } from "@/features/stock-workspace/view-models/related-stocks-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type RelatedStocksSectionProps = {
  groups: RelatedStocksGroup[];
  cta: RelatedStocksCta;
  hasResults: boolean;
  isLoading: boolean;
  isError: boolean;
  loadEnabled: boolean;
  onRequestLoad: () => void;
  copy: StockWorkspaceLanguage["relatedStocks"];
};

export function RelatedStocksSection({
  groups,
  cta,
  hasResults,
  isLoading,
  isError,
  loadEnabled,
  onRequestLoad,
  copy,
}: RelatedStocksSectionProps) {
  useEffect(() => {
    const section = document.getElementById("related");
    if (!section) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onRequestLoad();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [onRequestLoad]);

  const showSkeleton = loadEnabled && isLoading && !hasResults;

  return (
    <div className="related-stocks-panel">
      {isError ? <div className="data-warning data-warning-compact">{copy.loadError}</div> : null}

      {showSkeleton ? (
        <div aria-hidden="true" className="related-stocks-skeleton">
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <div className="related-stocks-skeleton-cluster" key={rowIndex}>
              <div className="related-stocks-skeleton-legend" />
              <div className="related-stocks-skeleton-cards">
                {Array.from({ length: 4 }).map((__, cardIndex) => (
                  <div className="related-stocks-skeleton-card" key={cardIndex} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loadEnabled && !showSkeleton && hasResults ? (
        <div className="related-stocks-grid">
          {groups.map((group) => (
            <section className="related-stocks-cluster" key={group.id}>
              <h3 className="related-stocks-cluster-legend">{group.title}</h3>
              <div className="related-stocks-cluster-body">
                <div className="related-stocks-list">
                {group.items.length ? (
                  group.items.map((item) => {
                    const changeTone = item.changePercent.startsWith("+")
                      ? "positive"
                      : item.changePercent.startsWith("-")
                        ? "negative"
                        : "neutral";

                    return (
                      <Link className="scanner-result-card related-stock-card" href={item.href} key={item.stockId}>
                        <div className="scanner-card-topline">
                          <strong>{item.symbol}</strong>
                          <SignalBadge density="compact" signal={item.recommendation} />
                        </div>
                        <div className={`related-stock-quote related-stock-quote-${changeTone}`}>
                          <strong className="related-stock-quote-price">{item.price}</strong>
                          <span className="related-stock-quote-change">{item.changePercent}</span>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="related-stocks-empty related-stocks-empty-row">{copy.emptyRow}</div>
                )}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {loadEnabled && !showSkeleton && !hasResults && !isError ? (
        <div className="related-stocks-empty related-stocks-empty-section">{copy.emptySection}</div>
      ) : null}

      {loadEnabled && !showSkeleton && hasResults ? (
        <div className="related-stocks-cta-wrap">
          <Link className="related-stocks-cta" href={cta.href}>
            {cta.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
