"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, Flame, RotateCcw, TrendingUp, Zap } from "lucide-react";

import type { MarketAlertModel } from "@/features/market-pulse/types/market-pulse-types";

type MarketAlertsSectionProps = {
  alerts: MarketAlertModel[];
  isLoading?: boolean;
};

function AlertIcon({ type }: { type: MarketAlertModel["type"] }) {
  if (type === "unusual-volume") {
    return <Zap aria-hidden="true" size={15} />;
  }
  if (type === "momentum-reversal") {
    return <RotateCcw aria-hidden="true" size={15} />;
  }
  if (type === "liquidity-surge") {
    return <BarChart3 aria-hidden="true" size={15} />;
  }
  if (type === "sector-rotation") {
    return <TrendingUp aria-hidden="true" size={15} />;
  }
  if (type === "pulse-score-jump") {
    return <Flame aria-hidden="true" size={15} />;
  }
  return <AlertTriangle aria-hidden="true" size={15} />;
}

export function MarketAlertsSection({ alerts, isLoading = false }: MarketAlertsSectionProps) {
  if (!isLoading && alerts.length === 0) {
    return null;
  }

  return (
    <section className="pulse-section pulse-alerts-section" aria-labelledby="pulse-alerts-heading">
      <div className="pulse-panel-card">
        <div className="pulse-section-head pulse-section-head-compact">
          <div>
            <p className="pulse-section-eyebrow">Market Alerts</p>
            <h2 id="pulse-alerts-heading">Supporting signals</h2>
          </div>
        </div>

        {isLoading ? (
          <div className="pulse-alerts-stack pulse-alerts-stack-loading">
            {Array.from({ length: 2 }).map((_, index) => (
              <div className="pulse-skeleton pulse-skeleton-line pulse-skeleton-line-compact" key={index} />
            ))}
          </div>
        ) : (
          <div className="pulse-alerts-stack">
          {alerts.map((alert) => {
            const content = (
              <>
                <div className="pulse-alert-icon">
                  <AlertIcon type={alert.type} />
                </div>
                <div className="pulse-alert-copy">
                  <strong>{alert.eventTitle}</strong>
                  <p>{alert.whyItMatters}</p>
                  <span className="pulse-alert-metric">{alert.metricLabel}</span>
                </div>
                {alert.symbol && alert.latestPrice ? (
                  <div className="pulse-alert-context">
                    <span>{alert.symbol}</span>
                    <span className={`pulse-focus-change pulse-focus-change-${alert.priceTone ?? "neutral"}`}>
                      {alert.priceChangePercent}
                    </span>
                  </div>
                ) : null}
              </>
            );

            return alert.href ? (
              <Link className="pulse-alert-card" href={alert.href} key={alert.id}>
                {content}
              </Link>
            ) : (
              <article className="pulse-alert-card" key={alert.id}>
                {content}
              </article>
            );
          })}
          </div>
        )}
      </div>
    </section>
  );
}
