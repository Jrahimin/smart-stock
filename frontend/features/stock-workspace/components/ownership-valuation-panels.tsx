"use client";

import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type OwnershipInsightsPanelProps = {
  decision: StockDecisionViewModel;
  copy: StockWorkspaceLanguage["panels"];
};

type OwnershipSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

function buildSegments(decision: StockDecisionViewModel, copy: StockWorkspaceLanguage["panels"]): OwnershipSegment[] {
  const ownership = decision.ownership;
  if (!ownership) {
    return [];
  }
  const entries = [
    { key: "sponsor", label: copy.sponsor, value: ownership.sponsor_percent ?? 0, color: "#7bb7ff" },
    { key: "institution", label: copy.institution, value: ownership.institution_percent ?? 0, color: "#9d8cff" },
    { key: "foreign", label: copy.foreign, value: ownership.foreign_percent ?? 0, color: "#4bd6a4" },
    { key: "public", label: copy.public, value: ownership.public_percent ?? 0, color: "#f0c36a" },
  ].filter((entry) => entry.value > 0);
  return entries;
}

export function OwnershipInsightsPanel({ decision, copy }: OwnershipInsightsPanelProps) {
  if (!decision.available || !decision.ownership) {
    return null;
  }

  const ownership = decision.ownership;
  const segments = buildSegments(decision, copy);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let cursor = 0;
  const gradientStops = segments
    .map((segment) => {
      const start = (cursor / total) * 100;
      cursor += segment.value;
      const end = (cursor / total) * 100;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="trader-workspace-strip ownership-strip">
      <div className="ownership-donut-wrap">
        <div
          className="ownership-donut"
          style={{ background: segments.length ? `conic-gradient(${gradientStops})` : undefined }}
          title={segments.map((segment) => `${segment.label} ${segment.value.toFixed(1)}%`).join(" · ")}
        >
          <div className="ownership-donut-center">
            <span>{copy.freeFloat}</span>
            <strong>{ownership.free_float_percent !== null ? `${ownership.free_float_percent.toFixed(1)}%` : "N/A"}</strong>
          </div>
        </div>
        <ul className="ownership-legend">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className="ownership-legend-dot" style={{ background: segment.color }} />
              {segment.label} {segment.value.toFixed(1)}%
            </li>
          ))}
        </ul>
      </div>
      <p className="ownership-interpretation">{ownership.interpretations[0] ?? copy.ownershipFallback}</p>
    </div>
  );
}
