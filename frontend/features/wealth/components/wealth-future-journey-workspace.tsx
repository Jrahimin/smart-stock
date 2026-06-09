"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { WEALTH_DEFAULT_RATES, WEALTH_TOOL_CONFIG } from "@/features/wealth/catalog/wealth-catalog";
import {
  buildCalculatorSnapshotDraft,
  calculatorSnapshotTitle,
} from "@/features/wealth/lib/calculator-snapshot";
import { appendLocalScenarioTitle, readLocalMoneySnapshot, saveLocalMoneySnapshotDraft } from "@/features/wealth/lib/local-money-snapshot";
import { formatWealthCurrency, formatWealthNumber } from "@/features/wealth/view-models/wealth-view-model";
import { useWealthTool } from "@/features/wealth/hooks/use-wealth-tool";
import type { WealthToolCalculateResponse, WealthToolSlug } from "@/features/wealth/types/wealth-types";

type FutureJourneyToolSlug = Extract<WealthToolSlug, "compound-growth" | "savings-goal">;

type WealthFutureJourneyWorkspaceProps = {
  toolSlug: FutureJourneyToolSlug;
};

const JOURNEY_EYEBROW: Record<FutureJourneyToolSlug, string> = {
  "compound-growth": "Invest",
  "savings-goal": "Savings goal",
};

const JOURNEY_FIELD_LABELS: Record<FutureJourneyToolSlug, Record<string, string>> = {
  "compound-growth": {
    principal: "Starting with",
    monthly_contribution: "Monthly saving",
    annual_rate: "Expected return (%)",
    tenure_value: "Time horizon",
  },
  "savings-goal": {
    target_amount: "Goal",
    current_amount: "Saved",
    monthly_contribution: "Monthly saving",
    annual_rate: "Expected return (%)",
    tenure_value: "Time horizon",
  },
};

export function WealthFutureJourneyWorkspace({ toolSlug }: WealthFutureJourneyWorkspaceProps) {
  const config = WEALTH_TOOL_CONFIG[toolSlug];
  const fieldLabels = JOURNEY_FIELD_LABELS[toolSlug];
  const initialInputs = useMemo(() => {
    return Object.fromEntries(config.fields.map((field) => [field.key, field.defaultValue ?? ""]));
  }, [config.fields]);

  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs);
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const assumptions = useMemo(
    () => ({
      country_code: "BD",
      inflation_rate: inflationRate ? Number(inflationRate) : undefined,
    }),
    [inflationRate],
  );

  const { result, isLoading, isError } = useWealthTool(toolSlug, inputs, assumptions);
  const years = resolveYears(inputs);
  const futureAmount = result ? formatWealthCurrency(result.headline_value) : "BDT 0";
  const story = result ? buildJourneyStory(toolSlug, inputs, result, years) : null;

  useEffect(() => {
    setInputs(initialInputs);
  }, [initialInputs, toolSlug]);

  function updateInput(key: string, value: string) {
    setInputs((current) => ({ ...current, [key]: value }));
    setSaveMessage(null);
  }

  function handleSaveToSnapshot() {
    if (!result) {
      return;
    }
    const draft = buildCalculatorSnapshotDraft({
      toolSlug,
      inputs,
      result,
    });
    const current = readLocalMoneySnapshot();
    saveLocalMoneySnapshotDraft({
      monthly_savings: draft.monthly_savings ?? current.monthly_savings,
      assets: [...current.assets, ...draft.assets],
      liabilities: [...current.liabilities, ...draft.liabilities],
    });
    appendLocalScenarioTitle(calculatorSnapshotTitle(toolSlug));
    setSaveMessage("Saved to Money Snapshot.");
  }

  function increaseMonthlySavings() {
    const current = toNumber(inputs.monthly_contribution);
    const nextValue = current > 0 ? Math.round(current * 1.15) : 5000;
    updateInput("monthly_contribution", String(nextValue));
  }

  function investLonger() {
    const currentYears = Math.max(1, Math.round(years));
    updateInput("tenure_value", String(currentYears + 1));
    updateInput("tenure_unit", "years");
  }

  return (
    <section className="wealth-tool-workspace wealth-future-journey-workspace">
      <WealthSubNav />

      <header className="wealth-hero-card">
        <p className="eyebrow">{JOURNEY_EYEBROW[toolSlug]}</p>
        <h1>{config.title}</h1>
        <p>{config.prompt}</p>
      </header>

      <div className="wealth-tool-layout">
        <section className="wealth-panel wealth-tool-form-panel">
          <div className="wealth-form-grid">
            {config.fields
              .filter((field) => field.group !== "tenure")
              .map((field) => (
                <JourneyInputField
                  key={field.key}
                  label={fieldLabels[field.key] ?? field.label}
                  onChange={(value) => updateInput(field.key, value)}
                  value={inputs[field.key] ?? ""}
                />
              ))}
            <JourneyTenureField
              inputs={inputs}
              label={fieldLabels.tenure_value ?? "Time horizon"}
              onChange={updateInput}
            />
          </div>

          <WealthProjectionSection
            inflationRate={inflationRate}
            onInflationRateChange={setInflationRate}
            showHeading={false}
            showInflation
          />
        </section>

        <section className="wealth-panel wealth-result-panel">
          {isLoading ? <p className="wealth-muted-copy">Updating…</p> : null}
          {isError ? <p className="wealth-error-copy">Could not load this scenario.</p> : null}
          {story ? (
            <>
              <ResultHero futureAmount={futureAmount} story={story} toolSlug={toolSlug} years={years} />
              <JourneyTimeline story={story} />
              {toolSlug === "compound-growth" ? (
                <InvestmentGrowthVisual story={story} />
              ) : (
                <SavingsGoalProgress story={story} />
              )}
              <DynamicInsight story={story} toolSlug={toolSlug} />
              <JourneyMilestones story={story} toolSlug={toolSlug} />
              <section className="wealth-future-explore">
                <p className="eyebrow">Explore next</p>
                <div className="wealth-chip-row">
                  <button className="wealth-chip wealth-chip-button" onClick={handleSaveToSnapshot} type="button">
                    Save to Money Snapshot
                  </button>
                  <Link className="wealth-chip" href="/wealth/tools/dps">
                    Compare with DPS
                  </Link>
                  <Link className="wealth-chip" href="/wealth/compare/fdr-vs-stocks">
                    Compare with FDR
                  </Link>
                  <button className="wealth-chip wealth-chip-button" onClick={increaseMonthlySavings} type="button">
                    Increase monthly saving
                  </button>
                  <button className="wealth-chip wealth-chip-button" onClick={investLonger} type="button">
                    Invest longer
                  </button>
                  <Link className="wealth-chip" href="/wealth/tools/savings-goal">
                    Set another goal
                  </Link>
                </div>
                {saveMessage ? <p className="wealth-local-note">{saveMessage}</p> : null}
              </section>
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function JourneyInputField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="wealth-field wealth-journey-field">
      <span>{label}</span>
      <input inputMode="decimal" onChange={(event) => onChange(event.target.value)} type="text" value={value} />
    </label>
  );
}

function JourneyTenureField({
  inputs,
  label,
  onChange,
}: {
  inputs: Record<string, string>;
  label: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <label className="wealth-field wealth-tenure-field wealth-journey-field">
      <span>{label}</span>
      <div className="wealth-tenure-inputs">
        <input inputMode="decimal" onChange={(event) => onChange("tenure_value", event.target.value)} value={inputs.tenure_value ?? ""} />
        <select onChange={(event) => onChange("tenure_unit", event.target.value)} value={inputs.tenure_unit ?? "years"}>
          <option value="months">Months</option>
          <option value="quarters">Quarters</option>
          <option value="years">Years</option>
        </select>
      </div>
    </label>
  );
}

type JourneyStory = {
  currentAmount: number;
  monthlyContribution: number;
  targetAmount: number;
  totalContributions: number;
  totalMonthlyContributions: number;
  projectedValue: number;
  investmentGrowth: number;
  years: number;
  currentProgressPercent: number;
  projectedProgressPercent: number;
  contributionSharePercent: number;
  growthSharePercent: number;
};

function buildJourneyStory(
  toolSlug: FutureJourneyToolSlug,
  inputs: Record<string, string>,
  result: WealthToolCalculateResponse,
  years: number,
): JourneyStory {
  const currentAmount = toNumber(toolSlug === "compound-growth" ? inputs.principal : inputs.current_amount);
  const monthlyContribution = toNumber(inputs.monthly_contribution);
  const totalMonthlyContributions = monthlyContribution * years * 12;
  const projectedValue = toNumber(result.headline_value);
  const targetAmount = toNumber(inputs.target_amount);
  const totalContributions = currentAmount + totalMonthlyContributions;
  const investmentGrowth = Math.max(0, projectedValue - totalContributions);
  const currentProgressPercent = targetAmount > 0 ? clamp((currentAmount / targetAmount) * 100, 0, 100) : 0;
  const projectedProgressPercent = targetAmount > 0 ? clamp((projectedValue / targetAmount) * 100, 0, 100) : 0;
  const contributionSharePercent = projectedValue > 0 ? clamp((totalContributions / projectedValue) * 100, 0, 100) : 0;
  const growthSharePercent = projectedValue > 0 ? clamp((investmentGrowth / projectedValue) * 100, 0, 100) : 0;

  return {
    currentAmount,
    monthlyContribution,
    targetAmount,
    totalContributions,
    totalMonthlyContributions,
    projectedValue,
    investmentGrowth,
    years,
    currentProgressPercent,
    projectedProgressPercent,
    contributionSharePercent,
    growthSharePercent,
  };
}

function ResultHero({
  futureAmount,
  story,
  toolSlug,
  years,
}: {
  futureAmount: string;
  story: JourneyStory;
  toolSlug: FutureJourneyToolSlug;
  years: number;
}) {
  const tenureLabel = formatTenureLabel(years);

  if (toolSlug === "savings-goal") {
    return (
      <div className="wealth-result-hero wealth-journey-result-hero">
        <p className="eyebrow">Projected at this pace</p>
        <div className="wealth-journey-hero-row">
          <div className="wealth-goal-hero-ring" style={{ "--progress": `${story.projectedProgressPercent}%` } as CSSProperties}>
            <strong>{formatWealthNumber(story.projectedProgressPercent)}%</strong>
          </div>
          <h2>{futureAmount}</h2>
        </div>
        <p className="wealth-journey-meta">
          {formatWealthCurrency(story.currentAmount)} → {formatWealthCurrency(story.targetAmount)}
        </p>
      </div>
    );
  }

  return (
    <div className="wealth-result-hero wealth-journey-result-hero">
      <p className="eyebrow">Projected value</p>
      <h2>{futureAmount}</h2>
      <p className="wealth-journey-meta">{tenureLabel}</p>
    </div>
  );
}

function JourneyTimeline({ story }: { story: JourneyStory }) {
  const maxValue = Math.max(story.currentAmount, story.totalMonthlyContributions, story.projectedValue, 1);
  const contributionWidth = clamp((story.totalMonthlyContributions / maxValue) * 100, 8, 100);
  const futureWidth = clamp((story.projectedValue / maxValue) * 100, 12, 100);

  return (
    <div className="wealth-journey-timeline" aria-label="Journey from today to future">
      <div className="wealth-journey-timeline-track">
        <span className="wealth-journey-timeline-fill wealth-journey-timeline-fill-today" style={{ width: `${clamp((story.currentAmount / maxValue) * 100, 6, 100)}%` }} />
        <span className="wealth-journey-timeline-fill wealth-journey-timeline-fill-contrib" style={{ width: `${contributionWidth}%` }} />
        <span className="wealth-journey-timeline-fill wealth-journey-timeline-fill-future" style={{ width: `${futureWidth}%` }} />
      </div>
      <div className="wealth-result-outcome-strip">
        <div className="wealth-result-outcome-point">
          <span>Today</span>
          <strong>{formatWealthCurrency(story.currentAmount)}</strong>
        </div>
        <div className="wealth-result-outcome-point">
          <span>Along the way</span>
          <strong>{formatWealthCurrency(story.totalMonthlyContributions)}</strong>
        </div>
        <div className="wealth-result-outcome-point wealth-result-outcome-point-highlight">
          <span>Future</span>
          <strong>{formatWealthCurrency(story.projectedValue)}</strong>
        </div>
      </div>
    </div>
  );
}

function InvestmentGrowthVisual({ story }: { story: JourneyStory }) {
  return (
    <section className="wealth-journey-visual">
      <div className="wealth-growth-split" aria-label="Contributions versus investment growth">
        <span style={{ flexBasis: `${story.contributionSharePercent}%` }}>
          {formatWealthNumber(story.contributionSharePercent)}%
        </span>
        <span style={{ flexBasis: `${Math.max(8, story.growthSharePercent)}%` }}>
          {formatWealthNumber(story.growthSharePercent)}%
        </span>
      </div>
      <div className="wealth-growth-legend wealth-growth-legend-compact">
        <p>
          <strong>{formatWealthCurrency(story.totalContributions)}</strong>
          <span>Contributions</span>
        </p>
        <p>
          <strong>{formatWealthCurrency(story.investmentGrowth)}</strong>
          <span>Growth</span>
        </p>
      </div>
    </section>
  );
}

function SavingsGoalProgress({ story }: { story: JourneyStory }) {
  return (
    <section className="wealth-journey-visual wealth-goal-progress-visual">
      <div className="wealth-goal-dual-track" aria-label="Progress toward goal">
        <span className="wealth-goal-dual-current" style={{ width: `${story.currentProgressPercent}%` }} />
        <span className="wealth-goal-dual-projected" style={{ width: `${story.projectedProgressPercent}%` }} />
      </div>
      <div className="wealth-goal-progress-labels">
        <span>{formatWealthNumber(story.currentProgressPercent)}% now</span>
        <span>{formatWealthNumber(story.projectedProgressPercent)}% projected</span>
      </div>
    </section>
  );
}

function DynamicInsight({ story, toolSlug }: { story: JourneyStory; toolSlug: FutureJourneyToolSlug }) {
  const insight = toolSlug === "compound-growth" ? investmentInsight(story) : savingsGoalInsight(story);
  return <p className="wealth-future-insight-line">{insight}</p>;
}

function JourneyMilestones({ story, toolSlug }: { story: JourneyStory; toolSlug: FutureJourneyToolSlug }) {
  const milestones =
    toolSlug === "compound-growth"
      ? [
          { label: "10L", reached: story.projectedValue >= 1_000_000 },
          { label: "2×", reached: story.projectedValue >= story.currentAmount * 2 && story.currentAmount > 0 },
          { label: "Future", reached: true },
        ]
      : [
          { label: "5L", reached: story.projectedValue >= 500_000 },
          { label: "50%", reached: story.projectedProgressPercent >= 50 },
          { label: "Goal", reached: story.projectedProgressPercent >= 100 },
        ];

  const reachedCount = milestones.filter((milestone) => milestone.reached).length;

  return (
    <div className="wealth-journey-milestones" aria-label="Milestones">
      <div className="wealth-milestone-rail">
        <span className="wealth-milestone-rail-fill" style={{ width: `${(reachedCount / milestones.length) * 100}%` }} />
      </div>
      <div className="wealth-milestone-steps">
        {milestones.map((milestone) => (
          <div className={milestone.reached ? "wealth-milestone-step wealth-milestone-step-reached" : "wealth-milestone-step"} key={milestone.label}>
            <span aria-hidden="true" />
            <p>{milestone.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function investmentInsight(story: JourneyStory) {
  if (story.growthSharePercent >= 50) {
    return "Time is doing more work than new money.";
  }
  if (story.growthSharePercent >= 25) {
    return "Growth is starting to matter.";
  }
  return "Consistency still drives most of the outcome.";
}

function savingsGoalInsight(story: JourneyStory) {
  if (story.projectedProgressPercent >= 90) {
    return "Final stretch.";
  }
  if (story.projectedProgressPercent >= 50) {
    return "Momentum is building.";
  }
  return "Every month closes the gap.";
}

function formatTenureLabel(years: number) {
  if (years < 1) {
    return `${formatWealthNumber(Math.round(years * 12))} months`;
  }
  return `${formatWealthNumber(years)} years`;
}

function resolveYears(inputs: Record<string, string>) {
  const value = toNumber(inputs.tenure_value) || 1;
  switch (inputs.tenure_unit) {
    case "months":
      return value / 12;
    case "quarters":
      return value / 4;
    default:
      return value;
  }
}

function toNumber(value: string | number | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
