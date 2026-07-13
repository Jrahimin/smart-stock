"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, Flame, RotateCcw, TrendingUp, Zap } from "lucide-react";

import type { MarketAlertModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";

type MarketAlertsSectionProps = {
  alerts: MarketAlertModel[];
  isLoading?: boolean;
  copy: MarketPulseLanguage["alerts"];
};

function AlertIcon({ type }: { type: MarketAlertModel["type"] }) {
  if (type === "unusual-volume") {
    return <Zap aria-hidden="true" size={13} />;
  }
  if (type === "momentum-reversal") {
    return <RotateCcw aria-hidden="true" size={13} />;
  }
  if (type === "liquidity-surge") {
    return <BarChart3 aria-hidden="true" size={13} />;
  }
  if (type === "sector-rotation") {
    return <TrendingUp aria-hidden="true" size={13} />;
  }
  if (type === "pulse-score-jump") {
    return <Flame aria-hidden="true" size={13} />;
  }
  return <AlertTriangle aria-hidden="true" size={13} />;
}

export function MarketAlertsSection({ alerts, isLoading = false, copy }: MarketAlertsSectionProps) {
  if (!isLoading && alerts.length === 0) {
    return null;
  }

  return (
    <section className="pulse-section pulse-alerts-section" aria-labelledby="pulse-alerts-heading">
      <div className="pulse-panel-card">
        <div className="pulse-section-head pulse-section-head-compact">
          <div>
            <p className="pulse-section-eyebrow">{copy.eyebrow}</p>
            <h2 id="pulse-alerts-heading">{copy.title}</h2>
          </div>
          <Link className="pulse-section-link" href="/signals">
            {copy.viewAll}
          </Link>
        </div>

        {isLoading ? (
          <div className="pulse-alerts-stack pulse-alerts-stack-loading">
            {Array.from({ length: 2 }).map((_, index) => (
              <div className="pulse-skeleton pulse-skeleton-line pulse-skeleton-line-compact" key={index} />
            ))}
          </div>
        ) : (
          <div className="pulse-alerts-feed">
            {alerts.map((alert, index) => {
              const row = (
                <div className="pulse-alert-content">
                  <div className="pulse-alert-head">
                    <span className={`pulse-alert-priority pulse-alert-priority-${alert.significance.toLowerCase()}`}>
                      {copy.significance[alert.significance]}
                    </span>
                    <div className="pulse-alert-title-row">
                      <div className="pulse-alert-icon">
                        <AlertIcon type={alert.type} />
                      </div>
                      <strong>{alert.eventTitle}</strong>
                    </div>
                  </div>
                  {alert.symbol ? (
                    <div className="pulse-alert-target">
                      <span>{alert.symbol}</span>
                      {alert.priceChangePercent ? (
                        <span className={`pulse-focus-change pulse-focus-change-${alert.priceTone ?? "neutral"}`}>
                          {alert.priceChangePercent}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                    {alert.eventExplanation ? <p className="pulse-alert-context">{alert.eventExplanation}</p> : null}
                    <div className="pulse-alert-footline">
                      <p className="pulse-alert-why">{alert.whyItMatters}</p>
                      {alert.timeLabel ? <time className="pulse-alert-time">{alert.timeLabel}</time> : null}
                    </div>
                </div>
              );

              return alert.href ? (
                <Link className={`pulse-alert-row pulse-alert-row-rank-${index}`} href={alert.href} key={alert.id}>
                  {row}
                </Link>
              ) : (
                <article className={`pulse-alert-row pulse-alert-row-rank-${index}`} key={alert.id}>
                  {row}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
