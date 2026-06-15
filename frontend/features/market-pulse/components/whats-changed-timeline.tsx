"use client";

import Link from "next/link";
import { ArrowRightLeft, RefreshCw, TrendingUp, Zap } from "lucide-react";

import type { PulseChangeModel } from "@/features/market-pulse/types/market-pulse-types";

type WhatsChangedTimelineProps = {
  changes: PulseChangeModel[];
  isLoading?: boolean;
};

function ChangeIcon({ type }: { type: PulseChangeModel["type"] }) {
  if (type === "volume-surge" || type === "momentum-shift") {
    return <Zap aria-hidden="true" size={16} />;
  }
  if (type === "score-jump" || type === "entered-focus") {
    return <TrendingUp aria-hidden="true" size={16} />;
  }
  if (type === "recommendation-shift" || type === "status-change") {
    return <ArrowRightLeft aria-hidden="true" size={16} />;
  }
  return <RefreshCw aria-hidden="true" size={16} />;
}

export function WhatsChangedTimeline({ changes, isLoading = false }: WhatsChangedTimelineProps) {
  if (!isLoading && changes.length === 0) {
    return null;
  }

  return (
    <section className="pulse-section pulse-changes-section" aria-labelledby="pulse-changes-heading">
      <div className="pulse-panel-card">
        <div className="pulse-section-head pulse-section-head-compact">
          <div>
            <p className="pulse-section-eyebrow">What&apos;s Changed</p>
            <h2 id="pulse-changes-heading">Since your last visit</h2>
          </div>
        </div>

        {isLoading ? (
          <div className="pulse-timeline pulse-timeline-loading">
            <div className="pulse-skeleton pulse-skeleton-line" />
            <div className="pulse-skeleton pulse-skeleton-line" />
          </div>
        ) : (
          <ol className="pulse-timeline pulse-timeline-inset">
          {changes.map((change) => {
            const content = (
              <>
                <div className="pulse-timeline-icon">
                  <ChangeIcon type={change.type} />
                </div>
                <div className="pulse-timeline-copy">
                  <time>{change.timeLabel}</time>
                  <strong>{change.title}</strong>
                  <p>{change.description}</p>
                </div>
                <span className={`pulse-timeline-badge pulse-timeline-badge-${change.badgeTone}`}>{change.badge}</span>
              </>
            );

            return (
              <li className="pulse-timeline-item" key={change.id}>
                {change.href ? (
                  <Link className="pulse-timeline-link" href={change.href}>
                    {content}
                  </Link>
                ) : (
                  <div className="pulse-timeline-row">{content}</div>
                )}
              </li>
            );
          })}
          </ol>
        )}
      </div>
    </section>
  );
}
