"use client";

import type { JourneyRouteStop } from "@/features/wealth/view-models/wealth-comparison-view-model";

type WealthComparisonJourneyTimelineProps = {
  activeStopId: string;
  horizonYears: number;
  stops: JourneyRouteStop[];
};

export function WealthComparisonJourneyTimeline({
  activeStopId,
  horizonYears,
  stops,
}: WealthComparisonJourneyTimelineProps) {
  return (
    <section aria-label="Your journey through time" className="wealth-comparison-route wealth-comparison-route-horizontal">
      <div className="wealth-comparison-route-head">
        <p className="eyebrow">Your journey</p>
        <h2>The route your futures take</h2>
      </div>

      <ol className="wealth-comparison-route-track-horizontal">
        {stops.map((stop, index) => {
          const isActive = stop.id === activeStopId;
          const isPast = horizonYears + 0.05 >= stop.year;
          const isFuture = !isPast && !isActive;

          return (
            <li
              className={`wealth-comparison-route-station ${stop.highlight ? "wealth-comparison-route-station-turning" : ""} ${isActive ? "wealth-comparison-route-station-active" : ""} ${isPast ? "wealth-comparison-route-station-past" : ""} ${isFuture ? "wealth-comparison-route-station-future" : ""}`}
              key={stop.id}
            >
              <div aria-hidden="true" className="wealth-comparison-route-station-marker">
                <span />
                {index < stops.length - 1 ? <i /> : null}
              </div>
              <div className="wealth-comparison-route-station-copy">
                <span>{stop.yearLabel}</span>
                <strong>{stop.title}</strong>
                <p>{stop.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
