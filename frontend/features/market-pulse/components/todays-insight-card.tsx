"use client";

import type { TodayInsightModel } from "@/features/market-pulse/types/market-pulse-types";
import { Lightbulb } from "lucide-react";

type TodaysInsightCardProps = {
  insight: TodayInsightModel;
};

export function TodaysInsightCard({ insight }: TodaysInsightCardProps) {
  return (
    <section className="pulse-section pulse-insight-section" aria-labelledby="pulse-insight-heading">
      <article className={`pulse-insight-feature pulse-insight-feature-${insight.tone}`}>
        <div className="pulse-insight-feature-main">
          <div className="pulse-insight-feature-head">
            <p className="pulse-insight-kicker">
              <Lightbulb aria-hidden="true" size={14} />
              Today&apos;s Insight
            </p>
            <h2 id="pulse-insight-heading">{insight.title}</h2>
          </div>
          <p className="pulse-insight-lead">{insight.explanation}</p>
        </div>

        <div className="pulse-insight-why">
          <span className="pulse-insight-why-label">Why it matters</span>
          <p className="pulse-insight-highlight">{insight.whyItMatters}</p>
        </div>
      </article>
    </section>
  );
}
