"use client";

import { useId } from "react";

import type {
  ComparisonChartModel,
  ComparisonHorizonSnapshot,
} from "@/features/wealth/view-models/wealth-comparison-view-model";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthComparisonChartProps = {
  activeStopId: string;
  chart: ComparisonChartModel;
  horizonSnapshot: ComparisonHorizonSnapshot;
  leftLabel: string;
  rightLabel: string;
  locale: AppLocale;
};

export function WealthComparisonChart({
  activeStopId,
  chart,
  horizonSnapshot,
  leftLabel,
  rightLabel,
  locale,
}: WealthComparisonChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const leftFillId = `${gradientId}-left-fill`;
  const rightFillId = `${gradientId}-right-fill`;
  const endPoint = chart.points.at(-1);
  const baselineY = chart.height - chart.padding;
  const horizonPoint = resolveHorizonPoint(chart, horizonSnapshot.horizonYears);
  const turningAnnotation = chart.annotations.find((item) => item.id === "turning-point");
  const showTurningCallout =
    chart.turningPointYear != null &&
    (activeStopId === "turning-point" ||
      horizonSnapshot.hasPassedTurningPoint ||
      Math.abs(horizonSnapshot.horizonYears - chart.turningPointYear) < 1.2);

  return (
    <section aria-label={locale === "bn" ? "ভবিষ্যতের দুই পথের chart" : "Future paths comparison chart"} className="wealth-comparison-chart-stage">
      <div className="wealth-comparison-chart-head">
        <h2>{locale === "bn" ? "দুই পথের হিসাব আলাদা হচ্ছে" : "Two futures diverging"}</h2>
        <div className="wealth-comparison-chart-legend-inline">
          <span className="wealth-comparison-legend-left">{leftLabel}</span>
          <span className="wealth-comparison-legend-right">{rightLabel}</span>
        </div>
      </div>

      <div className="wealth-comparison-chart-canvas">
        <div aria-hidden="true" className="wealth-comparison-chart-atmosphere" />

        <svg
          aria-hidden="false"
          className="wealth-comparison-chart-svg"
          role="img"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
        >
          <title>
            Comparison of {leftLabel} and {rightLabel} at year {horizonSnapshot.horizonYears}
          </title>
          <defs>
            <linearGradient id={leftFillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.32 }} />
              <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={rightFillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--positive)", stopOpacity: 0.26 }} />
              <stop offset="100%" style={{ stopColor: "var(--positive)", stopOpacity: 0 }} />
            </linearGradient>
            {turningAnnotation ? (
              <radialGradient cx="50%" cy="50%" id={`${gradientId}-turning-glow`} r="50%">
                <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.55 }} />
                <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
              </radialGradient>
            ) : null}
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = chart.height - chart.padding - ratio * (chart.height - chart.padding * 2);
            return (
              <line
                className="wealth-comparison-chart-gridline"
                key={ratio}
                x1={chart.padding}
                x2={chart.width - chart.padding}
                y1={y}
                y2={y}
              />
            );
          })}

          {endPoint ? (
            <>
              <path
                className="wealth-comparison-chart-area-right"
                d={`${chart.rightPath} L ${endPoint.x} ${baselineY} L ${chart.padding} ${baselineY} Z`}
                fill={`url(#${rightFillId})`}
              />
              <path
                className="wealth-comparison-chart-area-left"
                d={`${chart.leftPath} L ${endPoint.x} ${baselineY} L ${chart.padding} ${baselineY} Z`}
                fill={`url(#${leftFillId})`}
              />
            </>
          ) : null}

          <path className="wealth-comparison-chart-line-right" d={chart.rightPath} fill="none" stroke="var(--positive)" />
          <path className="wealth-comparison-chart-line-left" d={chart.leftPath} fill="none" stroke="var(--primary)" />

          {horizonPoint ? (
            <g className="wealth-comparison-chart-horizon-cursor">
              <line
                x1={horizonPoint.x}
                x2={horizonPoint.x}
                y1={chart.padding - 8}
                y2={baselineY}
              />
              <circle className="wealth-comparison-chart-horizon-dot-left" cx={horizonPoint.x} cy={horizonPoint.yLeft} r={5} />
              <circle className="wealth-comparison-chart-horizon-dot-right" cx={horizonPoint.x} cy={horizonPoint.yRight} r={5} />
            </g>
          ) : null}

          {showTurningCallout && turningAnnotation ? (
            <g className="wealth-comparison-chart-marker wealth-comparison-chart-marker-turning" key={turningAnnotation.id}>
              <circle
                className="wealth-comparison-chart-turning-glow"
                cx={turningAnnotation.x}
                cy={turningAnnotation.y + 10}
                fill={`url(#${gradientId}-turning-glow)`}
                r={18}
              />
              <circle cx={turningAnnotation.x} cy={turningAnnotation.y + 10} r={7} />
            </g>
          ) : null}

          {chart.points
            .filter((_, index) => index % 4 === 0 || index === chart.points.length - 1)
            .map((point) => (
              <text className="wealth-comparison-chart-axis" key={point.year} textAnchor="middle" x={point.x} y={chart.height - 12}>
            {point.year === 0 ? (locale === "bn" ? "আজ" : "Today") : `Y${Math.round(point.year)}`}
              </text>
            ))}
        </svg>

        {showTurningCallout && chart.turningPointYear != null ? (
          <div className="wealth-comparison-chart-callout wealth-comparison-chart-callout-turning">
            <span>⚡ {locale === "bn" ? "Crossover point" : "Crossover point"}</span>
            <strong>
              {leftLabel} catches up around {formatTurningPoint(chart.turningPointYear)}
            </strong>
            <em>{locale === "bn" ? "মাসে মাসে রাখা শেষে এগিয়ে যায়" : "Monthly discipline finally wins"}</em>
          </div>
        ) : null}
      </div>

      <div className="wealth-comparison-chart-live-foot">
        <div className="wealth-comparison-chart-foot">
          <span>{leftLabel}</span>
          <strong>{formatWealthCurrency(horizonSnapshot.leftValue)}</strong>
          <span>{rightLabel}</span>
          <strong>{formatWealthCurrency(horizonSnapshot.rightValue)}</strong>
        </div>
      </div>
    </section>
  );
}

function resolveHorizonPoint(chart: ComparisonChartModel, horizonYears: number) {
  if (chart.points.length === 0) {
    return null;
  }

  return chart.points.reduce((closest, point) =>
    Math.abs(point.year - horizonYears) < Math.abs(closest.year - horizonYears) ? point : closest,
  );
}

function formatTurningPoint(year: number) {
  const wholeYears = Math.floor(year);
  const months = Math.round((year - wholeYears) * 12);
  if (wholeYears <= 0) {
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (months <= 0) {
    return `${wholeYears} year${wholeYears === 1 ? "" : "s"}`;
  }
  return `${wholeYears} year${wholeYears === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`;
}
