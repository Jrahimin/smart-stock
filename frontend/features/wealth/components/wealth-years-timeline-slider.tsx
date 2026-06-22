"use client";

import { useMemo, type ReactNode } from "react";

export const WEALTH_YEARS_TIMELINE_MIN = 1;
export const WEALTH_YEARS_TIMELINE_MAX = 20;
export const WEALTH_YEARS_TIMELINE_MARKS = [1, 3, 5, 10, 15, 20] as const;

const INTEGER_STOPS = Array.from({ length: WEALTH_YEARS_TIMELINE_MAX }, (_, index) => index + 1);

type WealthYearsTimelineSliderProps = {
  ariaLabel: string;
  eyebrow: string;
  onYearsChange: (years: number) => void;
  valueLabel: ReactNode;
  years: number;
};

export function WealthYearsTimelineSlider({
  ariaLabel,
  eyebrow,
  onYearsChange,
  valueLabel,
  years,
}: WealthYearsTimelineSliderProps) {
  const selectedYears = snapWealthTimelineYear(years);
  const fillPercent = useMemo(() => timelinePercent(selectedYears), [selectedYears]);

  function handleChange(value: string) {
    onYearsChange(snapWealthTimelineYear(Number(value)));
  }

  function handleRelease() {
    onYearsChange(snapWealthTimelineYear(selectedYears));
  }

  return (
    <div className="wealth-dps-timeline-control">
      <div className="wealth-dps-timeline-heading">
        <p className="wealth-dps-timeline-summary">
          <span className="eyebrow">{eyebrow}</span>
          <strong>{selectedYears} years</strong>
        </p>
        <div className="wealth-dps-timeline-value">{valueLabel}</div>
      </div>
      <div className="wealth-dps-timeline-slider">
        <div className="wealth-dps-range-shell">
          <span className="wealth-dps-range-fill" style={{ width: `${fillPercent}%` }} />
          {INTEGER_STOPS.map((mark) => (
            <span
              className={`wealth-dps-range-tick ${WEALTH_YEARS_TIMELINE_MARKS.includes(mark as (typeof WEALTH_YEARS_TIMELINE_MARKS)[number]) ? "wealth-dps-range-tick-major" : ""} ${selectedYears >= mark ? "wealth-dps-stop-active" : ""}`}
              key={mark}
              style={{ left: `${timelinePercent(mark)}%` }}
            />
          ))}
          <input
            aria-label={ariaLabel}
            max={WEALTH_YEARS_TIMELINE_MAX}
            min={WEALTH_YEARS_TIMELINE_MIN}
            onBlur={handleRelease}
            onChange={(event) => handleChange(event.target.value)}
            onKeyUp={handleRelease}
            onPointerUp={handleRelease}
            step="1"
            type="range"
            value={selectedYears}
          />
        </div>
        <div className="wealth-dps-timeline-marks">
          {WEALTH_YEARS_TIMELINE_MARKS.map((mark) => (
            <button
              className={[
                selectedYears === mark ? "wealth-dps-mark-active" : "",
                mark === WEALTH_YEARS_TIMELINE_MIN ? "wealth-timeline-mark-start" : "",
                mark === WEALTH_YEARS_TIMELINE_MAX ? "wealth-timeline-mark-end" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={mark}
              onClick={() => onYearsChange(mark)}
              style={{ left: `${timelinePercent(mark)}%` }}
              type="button"
            >
              {mark}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function snapWealthTimelineYear(value: number) {
  return Math.round(clampWealthTimelineYear(value));
}

function clampWealthTimelineYear(value: number) {
  return Math.min(Math.max(value, WEALTH_YEARS_TIMELINE_MIN), WEALTH_YEARS_TIMELINE_MAX);
}

function timelinePercent(year: number) {
  return ((clampWealthTimelineYear(year) - WEALTH_YEARS_TIMELINE_MIN) / (WEALTH_YEARS_TIMELINE_MAX - WEALTH_YEARS_TIMELINE_MIN)) * 100;
}
