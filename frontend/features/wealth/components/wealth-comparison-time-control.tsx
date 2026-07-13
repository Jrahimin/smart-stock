"use client";

import { useMemo, type ChangeEvent, type CSSProperties, type FormEvent } from "react";

import {
  COMPARISON_MAX_MONTHS,
  COMPARISON_SCENARIO_HORIZON_OPTIONS,
  UNIFIED_JOURNEY_RAIL_MONTHS,
  buildJourneyShortcuts,
  monthsFromRailPercent,
  railMarkerOffset,
  railPositionPercent,
  snapJourneySliderMonths,
  type JourneyMoment,
  type UnifiedJourneyStop,
} from "@/features/wealth/view-models/wealth-comparison-view-model";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthComparisonTimeControlProps = {
  activeStopId: string;
  journeyMoment: JourneyMoment;
  onScenarioChange: (months: number) => void;
  onViewChange: (months: number) => void;
  scenarioMonths: number;
  turningPointYear: number | null;
  unifiedStops: UnifiedJourneyStop[];
  viewMonths: number;
  locale: AppLocale;
};

type RailStopLayout = {
  offset: string;
  percent: number;
  stop: UnifiedJourneyStop;
};

export function WealthComparisonTimeControl({
  activeStopId,
  journeyMoment,
  onScenarioChange,
  onViewChange,
  scenarioMonths,
  turningPointYear,
  unifiedStops,
  viewMonths,
  locale,
}: WealthComparisonTimeControlProps) {
  const copy = getWealthToolsLanguage(locale).comparison;
  const viewYears = viewMonths / 12;
  const sliderMonths = snapViewMonthsToYear(viewMonths, scenarioMonths);
  const sliderPercent = railPositionPercent(sliderMonths, UNIFIED_JOURNEY_RAIL_MONTHS);
  const stopLayouts = useMemo(() => buildRailStopLayout(unifiedStops), [unifiedStops]);
  const journeyShortcuts = useMemo(
    () => buildJourneyShortcuts(turningPointYear, scenarioMonths),
    [scenarioMonths, turningPointYear],
  );

  const handleStopClick = (stop: UnifiedJourneyStop) => {
    if (stop.extendsScenario && stop.months > scenarioMonths) {
      onScenarioChange(stop.months);
      return;
    }

    onViewChange(stop.months);
  };

  const handleShortcutClick = (months: number, extendsScenario?: boolean) => {
    if (extendsScenario && months > scenarioMonths) {
      onScenarioChange(months);
      return;
    }

    onViewChange(Math.min(scenarioMonths, months));
  };

  const applySliderPercent = (rawPercent: string) => {
    const months = monthsFromRailPercent(Number(rawPercent), UNIFIED_JOURNEY_RAIL_MONTHS);
    const snapped = snapJourneySliderMonths(months, scenarioMonths, unifiedStops);

    if (snapped > scenarioMonths) {
      onScenarioChange(snapped);
      return;
    }

    onViewChange(snapped);
  };

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    applySliderPercent(event.target.value);
  };

  const handleSliderInput = (event: FormEvent<HTMLInputElement>) => {
    applySliderPercent(event.currentTarget.value);
  };

  return (
    <section className="wealth-comparison-time-travel" aria-label={copy.travelAria}>
      <div className="wealth-comparison-horizon-bar">
        <div className="wealth-comparison-horizon-bar-copy">
          <span className="eyebrow">{copy.horizonEyebrow}</span>
          <span className="wealth-comparison-horizon-bar-question">{copy.horizonQuestion}</span>
        </div>
        <span aria-hidden="true" className="wealth-comparison-horizon-bar-sep" />
        <div className="wealth-comparison-horizon-options" role="group" aria-label={copy.horizonEyebrow}>
          {COMPARISON_SCENARIO_HORIZON_OPTIONS.map((option) => (
            <button
              className={scenarioMonths === option.months ? "wealth-comparison-horizon-option-active" : ""}
              key={option.label}
              onClick={() => onScenarioChange(option.months)}
              type="button"
            >
              {formatHorizonOptionLabel(option, copy, locale)}
            </button>
          ))}
        </div>
      </div>

      {journeyShortcuts.length > 0 ? (
        <div className="wealth-comparison-journey-shortcuts" role="group" aria-label={copy.jumpMomentsAria}>
          {journeyShortcuts.map((shortcut) => {
            const isActive = Math.abs(shortcut.months - sliderMonths) < 6;
            const isCrossover = shortcut.id === "crossover";

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className={`wealth-comparison-journey-shortcut ${isCrossover ? "wealth-comparison-journey-shortcut-crossover" : ""} ${isActive ? "wealth-comparison-journey-shortcut-active" : ""}`}
                key={shortcut.id}
                onClick={() => handleShortcutClick(shortcut.months, shortcut.extendsScenario)}
                type="button"
              >
                {localizeShortcutLabel(shortcut.label, copy, locale)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="wealth-comparison-journey-strip">
        <div className="wealth-comparison-journey-strip-main">
          <span className="eyebrow">{copy.journeyLabel}</span>
          <p className="wealth-comparison-journey-strip-line">
            <strong>{journeyMoment.visitHeadline}</strong>
            <span aria-hidden="true" className="wealth-comparison-journey-strip-dot">
              ·
            </span>
            <span>{journeyMoment.summaryLine}</span>
          </p>
        </div>
      </div>

      <div className="wealth-comparison-journey-rail" role="group" aria-label={copy.journeyStations}>
        <div className="wealth-comparison-journey-rail-stage">
          <div className="wealth-comparison-journey-rail-labels">
            {stopLayouts.map(({ stop, offset, percent }) => {
              const isActive = stop.id === activeStopId;
              const isBeyondScenario = stop.months > scenarioMonths;
              const isTurning = stop.isTurning === true;
              const stopLabel = isTurning ? copy.crossover : stop.label;
              const displayLabel = localizeStopLabel(stopLabel, copy, locale);

              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  aria-label={copy.goToStop.replace("{label}", displayLabel)}
                  className={`wealth-comparison-journey-rail-label ${isActive ? "wealth-comparison-journey-rail-label-active" : ""} ${isTurning ? "wealth-comparison-journey-rail-label-turning" : ""} ${isBeyondScenario ? "wealth-comparison-journey-rail-label-future" : ""}`}
                  key={stop.id}
                  onClick={() => handleStopClick(stop)}
                  style={{ "--rail-offset": offset, "--rail-pct": percent } as CSSProperties}
                  type="button"
                >
                {displayLabel}
                </button>
              );
            })}
          </div>

          <div className="wealth-comparison-journey-rail-track-row">
            <div aria-hidden="true" className="wealth-comparison-journey-rail-ticks">
              {stopLayouts.map(({ stop, offset, percent }) => {
                const isPast = viewYears + 0.05 >= stop.year;
                const isTurning = stop.isTurning === true;
                const isBeyondScenario = stop.months > scenarioMonths;
                const isAtThumb = Math.abs(stop.months - sliderMonths) < 6;

                return (
                  <span
                    className={`wealth-comparison-journey-rail-tick ${isPast ? "wealth-comparison-journey-rail-tick-past" : ""} ${isTurning ? "wealth-comparison-journey-rail-tick-turning" : ""} ${isBeyondScenario ? "wealth-comparison-journey-rail-tick-future" : ""} ${isAtThumb ? "wealth-comparison-journey-rail-tick-at-thumb" : ""}`}
                    key={stop.id}
                    style={{ "--rail-offset": offset, "--rail-pct": percent } as CSSProperties}
                  />
                );
              })}
            </div>

            <input
              aria-label={locale === "bn" ? "এক বছর করে সময় এগিয়ে দেখুন" : "Scrub through time one year at a time"}
              aria-valuemax={UNIFIED_JOURNEY_RAIL_MONTHS}
              aria-valuemin={0}
              aria-valuenow={sliderMonths}
              aria-valuetext={formatScrubberYear(sliderMonths, copy)}
              className="wealth-comparison-journey-rail-input"
              max={100}
              min={0}
              onChange={handleSliderChange}
              onInput={handleSliderInput}
              step={0.1}
              type="range"
              value={sliderPercent}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function snapViewMonthsToYear(viewMonths: number, scenarioMonths: number) {
  const snapped = Math.round(viewMonths / 12) * 12;
  return Math.max(0, Math.min(scenarioMonths, snapped));
}

function formatScrubberYear(months: number, copy: ReturnType<typeof getWealthToolsLanguage>["comparison"]) {
  const years = months / 12;
  if (years <= 0) {
    return copy.today;
  }

  if (months >= COMPARISON_MAX_MONTHS) {
    return copy.retirement;
  }

  const wholeYears = Math.round(years);
  return copy.year.replace("{value}", String(wholeYears));
}

function formatHorizonOptionLabel(
  option: (typeof COMPARISON_SCENARIO_HORIZON_OPTIONS)[number],
  copy: ReturnType<typeof getWealthToolsLanguage>["comparison"],
  locale: AppLocale,
) {
  if (locale !== "bn") {
    return option.label;
  }

  if (option.months >= COMPARISON_MAX_MONTHS) {
    return copy.retirement;
  }

  return copy.horizonYears(option.months / 12);
}

function localizeShortcutLabel(
  label: string,
  copy: ReturnType<typeof getWealthToolsLanguage>["comparison"],
  locale: AppLocale,
) {
  if (locale !== "bn") {
    return label;
  }

  return label
    .replace("before retirement", `${copy.retirement}-এর আগে`)
    .replace("yr", "বছর")
    .replace("Crossover", copy.crossover);
}

function localizeStopLabel(
  label: string,
  copy: ReturnType<typeof getWealthToolsLanguage>["comparison"],
  locale: AppLocale,
) {
  if (locale !== "bn") {
    return label;
  }

  if (label === "Today") {
    return copy.today;
  }
  if (label === "Retirement") {
    return copy.retirement;
  }
  if (label === "Crossover") {
    return copy.crossover;
  }

  const yearMatch = label.match(/^Year\s+(\d+)$/);
  if (yearMatch) {
    return copy.year.replace("{value}", yearMatch[1]);
  }

  return label;
}

function buildRailStopLayout(stops: UnifiedJourneyStop[]): RailStopLayout[] {
  return stops.map((stop) => {
    const percent = railPositionPercent(stop.months, UNIFIED_JOURNEY_RAIL_MONTHS);
    return {
      offset: railMarkerOffset(percent),
      percent,
      stop,
    };
  });
}
