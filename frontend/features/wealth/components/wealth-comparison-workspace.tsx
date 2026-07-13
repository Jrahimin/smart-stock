"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useDebouncedValue } from "@/features/wealth/hooks/use-debounced-value";

import { WealthComparisonChart } from "@/features/wealth/components/wealth-comparison-chart";
import { WealthComparisonHero } from "@/features/wealth/components/wealth-comparison-hero";
import { WealthComparisonScenarioInputs } from "@/features/wealth/components/wealth-comparison-scenario-inputs";
import { WealthComparisonTimeControl } from "@/features/wealth/components/wealth-comparison-time-control";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  WEALTH_COMPARISON_CARDS,
  WEALTH_COMPARISON_DEFAULTS,
  WEALTH_COMPARISON_STORIES,
  WEALTH_DEFAULT_RATES,
} from "@/features/wealth/catalog/wealth-catalog";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import {
  applyComparisonScenarioChip,
  buildComparisonPresentation,
  buildScenarioContributionSummary,
  buildScenarioViewProjection,
  COMPARISON_MAX_MONTHS,
  COMPARISON_SCENARIO_CHIPS,
  parseHorizonMonths,
  syncHorizonToInputs,
} from "@/features/wealth/view-models/wealth-comparison-view-model";
import { useWealthComparison } from "@/features/wealth/hooks/use-wealth-comparison";
import { getWealthToolsLanguage, type ComparisonScenarioChipId } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthComparisonWorkspaceProps = {
  comparisonSlug: WealthComparisonSlug;
  locale: AppLocale;
};

const HERO_COPY: Partial<Record<WealthComparisonSlug, { title: string; subtitle: string }>> = {
  "dps-vs-fdr": {
    title: "Two paths. Different futures.",
    subtitle:
      "One path rewards consistency. One path rewards certainty. Step forward in time and watch where each decision leads.",
  },
};

export function WealthComparisonWorkspace({ comparisonSlug, locale }: WealthComparisonWorkspaceProps) {
  const toolsCopy = getWealthToolsLanguage(locale);
  const copy = toolsCopy.comparison;
  const card = WEALTH_COMPARISON_CARDS.find((item) => item.slug === comparisonSlug);
  const hero = comparisonSlug === "dps-vs-fdr" ? { title: copy.title, subtitle: copy.subtitle } : HERO_COPY[comparisonSlug];
  const defaults = WEALTH_COMPARISON_DEFAULTS[comparisonSlug];
  const story = WEALTH_COMPARISON_STORIES[comparisonSlug];
  const [leftInputs, setLeftInputs] = useState(defaults.left);
  const [rightInputs, setRightInputs] = useState(defaults.right);
  const [assumptions, setAssumptions] = useState<Record<string, unknown>>({
    country_code: "BD",
    inflation_rate: Number(WEALTH_DEFAULT_RATES.inflation),
  });
  const initialScenarioMonths = parseHorizonMonths(defaults.left, defaults.right);
  const [scenarioMonths, setScenarioMonths] = useState(initialScenarioMonths);
  const [viewMonths, setViewMonths] = useState(initialScenarioMonths);

  const debouncedLeftInputs = useDebouncedValue(leftInputs, 500);
  const debouncedRightInputs = useDebouncedValue(rightInputs, 500);

  const syncedInputs = useMemo(
    () => syncHorizonToInputs(debouncedLeftInputs, debouncedRightInputs, scenarioMonths),
    [scenarioMonths, debouncedLeftInputs, debouncedRightInputs],
  );

  const mergedLeft = useMemo(
    () => Object.fromEntries(Object.entries(syncedInputs.left).map(([key, value]) => [key, Number(value)])),
    [syncedInputs.left],
  );
  const mergedRight = useMemo(
    () => Object.fromEntries(Object.entries(syncedInputs.right).map(([key, value]) => [key, Number(value)])),
    [syncedInputs.right],
  );

  const { result, isLoading, isFetching, isError } = useWealthComparison(comparisonSlug, mergedLeft, mergedRight, assumptions);
  const isInitialLoading = isLoading && !result;
  const isUpdating = isFetching && Boolean(result);

  const presentation = useMemo(
    () =>
      result
        ? buildComparisonPresentation(comparisonSlug, result, mergedLeft, mergedRight, assumptions, scenarioMonths, viewMonths)
        : null,
    [assumptions, comparisonSlug, mergedLeft, mergedRight, result, scenarioMonths, viewMonths],
  );
  const localizedJourneyMoment = presentation && locale === "bn" ? {
    ...presentation.journeyMoment,
    visitHeadline: presentation.journeyMoment.visitHeadline.replace("Looking ahead", "সামনে তাকালে").replace("The future flips", "ভবিষ্যতের পথ বদলায়"),
    summaryLine: presentation.journeyMoment.summaryLine.replace("At Year", "Year").replace("is ahead by", "এগিয়ে আছে, পার্থক্য")
      .replace("DPS overtakes FDR after about", "প্রায়").replace("Monthly saving", "মাসিক saving"),
  } : presentation?.journeyMoment;

  const updateScenario = (months: number) => {
    const nextMonths = Math.max(0, Math.min(COMPARISON_MAX_MONTHS, months));
    setScenarioMonths(nextMonths);
    setViewMonths(nextMonths);
    const synced = syncHorizonToInputs(leftInputs, rightInputs, nextMonths);
    setLeftInputs(synced.left);
    setRightInputs(synced.right);
  };

  const updateView = (months: number) => {
    setViewMonths(Math.max(0, Math.min(scenarioMonths, months)));
  };

  const applyScenarioChip = (chipId: string) => {
    const next = applyComparisonScenarioChip({ assumptions, horizonMonths: scenarioMonths, leftInputs, rightInputs }, chipId);
    setAssumptions(next.assumptions);
    const nextMonths = Math.max(0, Math.min(COMPARISON_MAX_MONTHS, next.horizonMonths));
    setScenarioMonths(nextMonths);
    setViewMonths(nextMonths);
    const synced = syncHorizonToInputs(next.leftInputs, next.rightInputs, nextMonths);
    setLeftInputs(synced.left);
    setRightInputs(synced.right);
  };

  const contributionSummary = useMemo(
    () => buildScenarioContributionSummary(comparisonSlug, leftInputs, rightInputs, scenarioMonths),
    [comparisonSlug, leftInputs, rightInputs, scenarioMonths],
  );

  const viewProjection = useMemo(
    () =>
      result
        ? buildScenarioViewProjection(comparisonSlug, mergedLeft, mergedRight, viewMonths)
        : null,
    [comparisonSlug, mergedLeft, mergedRight, result, viewMonths],
  );

  return (
    <section className="wealth-tool-workspace wealth-comparison-page">
      <WealthSubNav locale={locale} />

      {isInitialLoading ? <p className="wealth-muted-copy">{copy.loading}</p> : null}
      {isError ? <p className="wealth-error-copy">{copy.error}</p> : null}

      {result && presentation ? (
        <>
          <WealthComparisonHero
            beats={presentation.narrativeBeats}
            subtitle={hero?.subtitle ?? card?.description ?? ""}
            title={hero?.title ?? card?.title ?? "Comparison"}
            copy={copy}
            locale={locale}
          />

          <WealthComparisonScenarioInputs
            contributionSummary={contributionSummary}
            fieldLabels={story.fieldLabels}
            leftInputs={leftInputs}
            onLeftChange={setLeftInputs}
            onRightChange={setRightInputs}
            rightInputs={rightInputs}
            viewProjection={viewProjection}
            locale={locale}
          />

          <div className={`wealth-comparison-journey-shell ${isUpdating ? "wealth-comparison-journey-shell-updating" : ""}`}>
            {isUpdating ? <p className="wealth-comparison-updating-hint">{copy.updating}</p> : null}

            {defaults.left.years != null || defaults.right.years != null ? (
              <WealthComparisonTimeControl
                activeStopId={presentation.horizonSnapshot.activeStopId}
                journeyMoment={localizedJourneyMoment ?? presentation.journeyMoment}
                onScenarioChange={updateScenario}
                onViewChange={updateView}
                scenarioMonths={scenarioMonths}
                turningPointYear={presentation.turningPointYear}
                unifiedStops={presentation.unifiedJourneyStops}
                viewMonths={viewMonths}
                locale={locale}
              />
            ) : null}

            <WealthComparisonChart
              activeStopId={presentation.horizonSnapshot.activeStopId}
              chart={presentation.chart}
              horizonSnapshot={presentation.horizonSnapshot}
              leftLabel={result.left.label}
              rightLabel={result.right.label}
              locale={locale}
            />
          </div>

          <section className="wealth-comparison-reflection">
            <section className="wealth-comparison-scenario-explorer" id="comparison-scenario-chips">
              <div className="wealth-comparison-section-intro">
                <p className="eyebrow">{copy.alternate}</p>
                <h2>{copy.alternateTitle}</h2>
              </div>
              <div className="wealth-comparison-scenario-grid">
                {COMPARISON_SCENARIO_CHIPS.map((chip) => {
                  const localizedChip = copy.scenarioChips[chip.id as ComparisonScenarioChipId];
                  return (
                  <button className="wealth-comparison-scenario-card" key={chip.id} onClick={() => applyScenarioChip(chip.id)} type="button">
                    <strong>{localizedChip.label}</strong>
                    <span>{localizedChip.description}</span>
                  </button>
                  );
                })}
              </div>
            </section>

            <div className="wealth-comparison-summary-grid">
              <section className="wealth-comparison-summary-panel wealth-comparison-insights-panel" aria-label={copy.insights}>
                <header className="wealth-comparison-summary-panel-head">
                  <p className="eyebrow">{copy.insights}</p>
                  <h2>{copy.insightsTitle}</h2>
                </header>
                <ul className="wealth-comparison-insight-list">
                  {presentation.contextualInsights.map((insight, index) => {
                    const localizedInsight = locale === "bn" ? localizeComparisonInsight(insight, index) : insight;
                    return (
                    <li
                      className={`wealth-comparison-insight-card ${index === 0 ? "wealth-comparison-insight-card-primary" : ""}`}
                      key={insight.id}
                    >
                      <strong>{localizedInsight.title}</strong>
                      <p>{localizedInsight.body}</p>
                    </li>
                    );
                  })}
                </ul>
              </section>

              <section className="wealth-comparison-summary-panel wealth-comparison-outcomes-panel" aria-label={copy.power}>
                <header className="wealth-comparison-summary-panel-head">
                  <p className="eyebrow">{copy.power}</p>
                  <h2>{copy.powerTitle}</h2>
                </header>
                <div className="wealth-comparison-outcomes-row">
                  <article
                    className={`wealth-comparison-outcome-card wealth-comparison-outcome-card-dps ${presentation.horizonSnapshot.favoredKey === "left" ? "wealth-comparison-outcome-card-leading" : ""}`}
                  >
                    <div className="wealth-comparison-outcome-card-head">
                      <span>{result.left.label}</span>
                      {presentation.horizonSnapshot.favoredKey === "left" ? (
                        <span className="wealth-comparison-outcome-badge">{copy.ahead}</span>
                      ) : null}
                    </div>
                    <strong className="wealth-comparison-animated-value">
                      {formatWealthCurrency(presentation.purchasingPower.left.finalValue)}
                    </strong>
                    <dl className="wealth-comparison-outcome-metrics">
                      <div>
                        <dt>{copy.realPower}</dt>
                        <dd>{formatWealthCurrency(presentation.purchasingPower.left.realValue)}</dd>
                      </div>
                      <div className="wealth-comparison-outcome-metrics-warn">
                        <dt>{copy.inflationTakes}</dt>
                        <dd>{formatWealthCurrency(presentation.purchasingPower.left.inflationImpact)}</dd>
                      </div>
                    </dl>
                  </article>
                  <article
                    className={`wealth-comparison-outcome-card wealth-comparison-outcome-card-fdr ${presentation.horizonSnapshot.favoredKey === "right" ? "wealth-comparison-outcome-card-leading" : ""}`}
                  >
                    <div className="wealth-comparison-outcome-card-head">
                      <span>{result.right.label}</span>
                      {presentation.horizonSnapshot.favoredKey === "right" ? (
                        <span className="wealth-comparison-outcome-badge">{copy.ahead}</span>
                      ) : null}
                    </div>
                    <strong className="wealth-comparison-animated-value">
                      {formatWealthCurrency(presentation.purchasingPower.right.finalValue)}
                    </strong>
                    <dl className="wealth-comparison-outcome-metrics">
                      <div>
                        <dt>{copy.realPower}</dt>
                        <dd>{formatWealthCurrency(presentation.purchasingPower.right.realValue)}</dd>
                      </div>
                      <div className="wealth-comparison-outcome-metrics-warn">
                        <dt>{copy.inflationTakes}</dt>
                        <dd>{formatWealthCurrency(presentation.purchasingPower.right.inflationImpact)}</dd>
                      </div>
                    </dl>
                  </article>
                </div>
              </section>
            </div>
          </section>

          <p className="wealth-disclaimer">{result.disclaimer}</p>

          <section className="wealth-comparison-story-end">
            <p className="eyebrow">{copy.continue}</p>
            <div className="wealth-chip-row">
              <Link className="wealth-chip" href="/wealth/snapshot">
                {copy.save}
              </Link>
              <button
                className="wealth-chip wealth-chip-button"
                onClick={() => document.getElementById("comparison-scenario-chips")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                type="button"
              >
                {copy.explore}
              </button>
              <Link className="wealth-chip" href="/wealth/calendar">
                {copy.timeTravel}
              </Link>
              <Link className="wealth-chip" href="/wealth/snapshot">
                {toolsCopy.common.addToSnapshot}
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

function localizeComparisonInsight(insight: { title: string; body: string }, index: number) {
  const copy = [
    { title: "নিয়মিত saving-এর জোর", body: "মাসে মাসে রাখা টাকা সময়ের সঙ্গে কাজে লাগতে থাকে, যদিও শুরুতে lump sum এগিয়ে থাকতে পারে।" },
    { title: "শুরুতে lump sum-এর সুবিধা", body: "একসঙ্গে টাকা থাকলে FDR আগে এগোতে পারে, কারণ শুরু থেকেই পুরো amount return পায়।" },
    { title: "সময় বাড়লে ছবিটা বদলায়", body: "দীর্ঘ সময় ধরে DPS চললে নিয়মিত saving ধীরে ধীরে gap কমাতে পারে।" },
    { title: "Inflation দুটো পথেই লাগে", body: "Nominal amount বাড়লেও বাজারদর বাড়লে আজকের টাকায় আসল value কমে যেতে পারে।" },
  ][index];
  return copy ?? insight;
}
