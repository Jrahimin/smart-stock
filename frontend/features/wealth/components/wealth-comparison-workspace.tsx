"use client";

import { useMemo, useState } from "react";

import { MetricCard } from "@/components/ui/metric-card";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { WealthNextSteps } from "@/features/wealth/components/wealth-next-steps";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  WEALTH_COMPARISON_CARDS,
  WEALTH_COMPARISON_DEFAULTS,
  WEALTH_COMPARISON_STORIES,
} from "@/features/wealth/catalog/wealth-catalog";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";
import { formatBangladeshCurrencyText } from "@/features/wealth/lib/wealth-formatters";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useWealthComparison } from "@/features/wealth/hooks/use-wealth-comparison";

type WealthComparisonWorkspaceProps = {
  comparisonSlug: WealthComparisonSlug;
};

export function WealthComparisonWorkspace({ comparisonSlug }: WealthComparisonWorkspaceProps) {
  const card = WEALTH_COMPARISON_CARDS.find((item) => item.slug === comparisonSlug);
  const defaults = WEALTH_COMPARISON_DEFAULTS[comparisonSlug];
  const story = WEALTH_COMPARISON_STORIES[comparisonSlug];
  const [leftInputs, setLeftInputs] = useState(defaults.left);
  const [rightInputs, setRightInputs] = useState(defaults.right);

  const mergedLeft = useMemo(
    () => Object.fromEntries(Object.entries(leftInputs).map(([key, value]) => [key, Number(value)])),
    [leftInputs],
  );
  const mergedRight = useMemo(
    () => Object.fromEntries(Object.entries(rightInputs).map(([key, value]) => [key, Number(value)])),
    [rightInputs],
  );

  const { result, isLoading, isError } = useWealthComparison(comparisonSlug, mergedLeft, mergedRight);
  const differenceValue = Number(result?.difference_value ?? 0);
  const differenceLabel =
    differenceValue >= 0 ? "Extra value under current assumptions" : "Value gap under current assumptions";
  const favoredPath = result ? (differenceValue >= 0 ? result.left.label : result.right.label) : null;

  return (
    <section className="wealth-tool-workspace">
      <WealthSubNav />

      <header className="wealth-hero-card">
        <p className="eyebrow">Compare choices</p>
        <h1>{card?.title ?? "Comparison"}</h1>
        <p>{card?.description}</p>
      </header>

      <div className="wealth-comparison-layout">
        <section className="wealth-panel">
          <div className="wealth-story-panel-heading">
            <p className="eyebrow">Story one</p>
            <h2>{story.leftTitle}</h2>
            <p>{story.leftSubtitle}</p>
          </div>
          <div className="wealth-form-grid">
            {Object.entries(leftInputs).map(([key, value]) => (
              <label className="wealth-field" key={`left-${key}`}>
                <span>{story.fieldLabels[key] ?? key.replaceAll("_", " ")}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setLeftInputs((current) => ({ ...current, [key]: event.target.value }))}
                  value={value}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="wealth-panel">
          <div className="wealth-story-panel-heading">
            <p className="eyebrow">Story two</p>
            <h2>{story.rightTitle}</h2>
            <p>{story.rightSubtitle}</p>
          </div>
          <div className="wealth-form-grid">
            {Object.entries(rightInputs).map(([key, value]) => (
              <label className="wealth-field" key={`right-${key}`}>
                <span>{story.fieldLabels[key] ?? key.replaceAll("_", " ")}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setRightInputs((current) => ({ ...current, [key]: event.target.value }))}
                  value={value}
                />
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className="wealth-panel wealth-result-panel">
        {isLoading ? <p className="wealth-muted-copy">Comparing scenarios…</p> : null}
        {isError ? <p className="wealth-error-copy">Could not evaluate this comparison right now.</p> : null}
        {result ? (
          <>
            <div className="wealth-result-hero">
              <p className="eyebrow">Trade-off summary</p>
              <h2>{result.title}</h2>
              <p>{formatBangladeshCurrencyText(result.summary)}</p>
            </div>
            <div className="wealth-comparison-results">
              {[result.left, result.right].map((option) => (
                <article className="wealth-comparison-option" key={option.key}>
                  <p className="eyebrow">{option.label}</p>
                  <h3>{formatWealthCurrency(option.final_value)}</h3>
                  {option.real_value != null ? (
                    <p>Inflation-adjusted: {formatWealthCurrency(option.real_value)}</p>
                  ) : null}
                  <ul className="wealth-story-note-list">
                    <li>
                      <span className="wealth-note-icon wealth-note-icon-flex" aria-hidden="true" />
                      {option.liquidity_note}
                    </li>
                    <li>
                      <span className="wealth-note-icon wealth-note-icon-habit" aria-hidden="true" />
                      {option.behavior_note}
                    </li>
                    <li>
                      <span className="wealth-note-icon wealth-note-icon-stable" aria-hidden="true" />
                      {option.risk_note}
                    </li>
                  </ul>
                </article>
              ))}
            </div>
            <div className="wealth-metric-grid">
              <MetricCard
                helper={favoredPath ? `Currently favors ${favoredPath}` : undefined}
                label={differenceLabel}
                tone="info"
                value={formatWealthCurrency(Math.abs(differenceValue))}
              />
              {result.difference_percent != null ? (
                <MetricCard label="Relative difference" tone="neutral" value={`${Math.abs(Number(result.difference_percent))}%`} />
              ) : null}
            </div>
            <div className="wealth-insight-grid">
              {result.insights.map((insight) => (
                <WealthInsightCard insight={insight} key={insight.id} />
              ))}
            </div>
            <p className="wealth-disclaimer">{result.disclaimer}</p>
            <WealthNextSteps steps={result.next_steps} />
          </>
        ) : null}
      </section>
    </section>
  );
}
