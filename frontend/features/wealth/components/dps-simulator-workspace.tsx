"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSaveSnapshotCard } from "@/features/wealth/components/wealth-save-snapshot-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  snapWealthTimelineYear,
  WealthYearsTimelineSlider,
} from "@/features/wealth/components/wealth-years-timeline-slider";
import { resolveSourceTaxRate } from "@/features/wealth/components/wealth-source-tax-control";
import { getCalculatorAccountIdentifierLabel } from "@/features/wealth/lib/calculator-snapshot";
import { WEALTH_DEFAULT_RATES } from "@/features/wealth/catalog/wealth-catalog";
import {
  appendLocalScenarioTitle,
  readLocalMoneySnapshot,
  saveLocalMoneySnapshotDraft,
} from "@/features/wealth/lib/local-money-snapshot";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";
import { saveWealthScenario } from "@/lib/api/wealth-api";

const FUTURE_PATH_YEARS = [3, 5, 10, 15, 20] as const;
const GOAL_YEARS = [10, 15, 20] as const;
const MILESTONES = [
  { label: "First 10 Lakh", value: 1_000_000 },
  { label: "First 50 Lakh", value: 5_000_000 },
  { label: "First 1 Crore", value: 10_000_000 },
  { label: "First 2 Crore", value: 20_000_000 },
] as const;

type SimulatorMode = "build" | "goal";

export function DpsSimulatorWorkspace() {
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<SimulatorMode>("build");
  const [monthlySaving, setMonthlySaving] = useState("25000");
  const [targetAmount, setTargetAmount] = useState("10000000");
  const [annualRate, setAnnualRate] = useState("10");
  const [years, setYears] = useState("10");
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const [sourceTaxPreset, setSourceTaxPreset] = useState("10");
  const [customSourceTax, setCustomSourceTax] = useState("10");
  const [startDelayYears, setStartDelayYears] = useState("3");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const simulation = useMemo(() => {
    const selectedYears = snapWealthTimelineYear(toNumber(years));
    const rate = clampNumber(toNumber(annualRate), 0, 30);
    const inflation = clampNumber(toNumber(inflationRate), 0, 30);
    const sourceTaxRate = resolveSourceTaxRate(sourceTaxPreset, customSourceTax);
    const goal = Math.max(toNumber(targetAmount), 1);
    const requiredMonthlySaving = requiredMonthlyPaymentNet(goal, rate, selectedYears, sourceTaxRate);
    const activeMonthlySaving =
      mode === "goal" ? requiredMonthlySaving : Math.max(toNumber(monthlySaving), 0);
    const wealth = applyNetWealth(activeMonthlySaving, rate, selectedYears, sourceTaxRate);
    const futureValue = mode === "goal" ? goal : wealth.netFuture;
    const totalDeposited = activeMonthlySaving * 12 * selectedYears;
    const investmentGrowth = wealth.netGrowth;
    const sourceTaxDeduction = wealth.taxDeduction;
    const realValue = futureValue / (1 + inflation / 100) ** selectedYears;
    const delayYears = clampNumber(toNumber(startDelayYears), 0, 10);
    const laterSavingYears = Math.max(selectedYears - delayYears, 0);
    const laterFutureValue = applyNetWealth(activeMonthlySaving, rate, laterSavingYears, sourceTaxRate).netFuture;
    const costOfWaiting = Math.max(futureValue - laterFutureValue, 0);

    return {
      activeMonthlySaving,
      costOfWaiting,
      delayYears,
      futureValue,
      goal,
      inflation,
      investmentGrowth,
      laterFutureValue,
      rate,
      realValue,
      selectedYears,
      sourceTaxDeduction,
      sourceTaxRate,
      totalDeposited,
    };
  }, [
    annualRate,
    customSourceTax,
    inflationRate,
    mode,
    monthlySaving,
    sourceTaxPreset,
    startDelayYears,
    targetAmount,
    years,
  ]);

  const futurePath = useMemo(
    () =>
      FUTURE_PATH_YEARS.map((pathYear) => ({
        year: pathYear,
        value: applyNetWealth(
          simulation.activeMonthlySaving,
          simulation.rate,
          pathYear,
          simulation.sourceTaxRate,
        ).netFuture,
      })),
    [simulation.activeMonthlySaving, simulation.rate, simulation.sourceTaxRate],
  );

  const milestones = useMemo(
    () =>
      MILESTONES.map((milestone) => ({
        ...milestone,
        arrival: estimateMilestoneArrival(
          simulation.activeMonthlySaving,
          simulation.rate,
          milestone.value,
          simulation.sourceTaxRate,
        ),
      })),
    [simulation.activeMonthlySaving, simulation.rate, simulation.sourceTaxRate],
  );

  const chartPaths = useMemo(
    () =>
      buildGrowthChartPaths(
        simulation.activeMonthlySaving,
        simulation.rate,
        simulation.selectedYears,
        simulation.sourceTaxRate,
      ),
    [simulation.activeMonthlySaving, simulation.rate, simulation.selectedYears, simulation.sourceTaxRate],
  );

  const goalOptions = useMemo(
    () =>
      GOAL_YEARS.map((goalYear) => ({
        year: goalYear,
        monthlySaving: requiredMonthlyPaymentNet(simulation.goal, simulation.rate, goalYear, simulation.sourceTaxRate),
      })),
    [simulation.goal, simulation.rate, simulation.sourceTaxRate],
  );

  const depositedShare =
    simulation.futureValue > 0 ? Math.min((simulation.totalDeposited / simulation.futureValue) * 100, 100) : 0;
  const growthShare = Math.max(100 - depositedShare, 0);

  async function handleSaveScenario() {
    const output = {
      headline_value: simulation.futureValue,
      headline_label: mode === "goal" ? "Required monthly discipline" : "Projected DPS future value",
      summary: buildSummary(mode, simulation),
      metrics: [
        { label: "Monthly saving", value: simulation.activeMonthlySaving },
        { label: "Total deposited", value: simulation.totalDeposited },
        { label: "Growth from returns", value: simulation.investmentGrowth },
        { label: "Today's purchasing power", value: simulation.realValue },
      ],
      assumptions_used: {
        annual_rate: simulation.rate,
        inflation_rate: simulation.inflation,
        years: simulation.selectedYears,
        start_delay_years: simulation.delayYears,
      },
    };

    appendLocalScenarioTitle("DPS wealth simulator");
    if (isAuthenticated) {
      await saveWealthScenario({
        scenario_type: "TOOL",
        slug: "dps",
        title: "DPS wealth simulator",
        input_json: {
          mode,
          monthly_payment: simulation.activeMonthlySaving,
          target_amount: simulation.goal,
          annual_rate: simulation.rate,
          years: simulation.selectedYears,
          inflation_rate: simulation.inflation,
          source_tax_preset: sourceTaxPreset,
          ...(sourceTaxPreset === "custom" ? { source_tax_rate: customSourceTax } : {}),
        },
        output_json: output,
      });
    }
    setSaveMessage("Scenario saved to your local Money Snapshot history.");
  }

  function handleAddToSnapshot() {
    const current = readLocalMoneySnapshot();
    saveLocalMoneySnapshotDraft({
      monthly_savings: Math.round(simulation.activeMonthlySaving),
      assets: [
        ...current.assets,
        {
          category: "DEPOSIT",
          label: "DPS",
          value: simulation.futureValue,
          metadata: {
            deposit_type: "dps",
            interest_rate: String(simulation.rate),
            projected_maturity: simulation.futureValue,
            source_tax_preset: sourceTaxPreset,
            ...(sourceTaxPreset === "custom" ? { source_tax_rate: customSourceTax } : {}),
            ...(accountIdentifier.trim() ? { account_identifier: accountIdentifier.trim() } : {}),
          },
        },
      ],
      liabilities: current.liabilities,
    });
    appendLocalScenarioTitle("DPS monthly habit");
    setSaveMessage("DPS habit and projection added to your Money Snapshot draft.");
  }

  function handleTimelineYearsChange(nextYears: number) {
    setYears(String(nextYears));
  }

  return (
    <section className="wealth-tool-workspace wealth-dps-simulator">
      <WealthSubNav />

      <header className="wealth-hero-card wealth-dps-hero">
        <div>
          <p className="eyebrow">DPS wealth simulator</p>
          <h1>Explore how a monthly habit can grow into future wealth.</h1>
          <p>
            DPS rewards discipline. Move the timeline, adjust the habit, and watch the gap between deposits and
            wealth begin to open.
          </p>
        </div>
        <div className="wealth-dps-mode-toggle" aria-label="DPS simulator mode">
          <button
            className={mode === "build" ? "wealth-dps-mode-active" : ""}
            onClick={() => setMode("build")}
            type="button"
          >
            Build Wealth
          </button>
          <button
            className={mode === "goal" ? "wealth-dps-mode-active" : ""}
            onClick={() => setMode("goal")}
            type="button"
          >
            Reach Goal
          </button>
        </div>
      </header>

      <div className="wealth-dps-stage">
        <section className="wealth-panel wealth-dps-control-panel">
          <div className="wealth-dps-primary-inputs">
            {mode === "build" ? (
              <label className="wealth-field wealth-dps-large-field">
                <span>Monthly saving</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setMonthlySaving(event.target.value)}
                  value={monthlySaving}
                />
              </label>
            ) : (
              <label className="wealth-field wealth-dps-large-field">
                <span>Target amount</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setTargetAmount(event.target.value)}
                  value={targetAmount}
                />
              </label>
            )}
            <label className="wealth-field">
              <span>DPS interest rate (%)</span>
              <input inputMode="decimal" onChange={(event) => setAnnualRate(event.target.value)} value={annualRate} />
            </label>
          </div>

          <WealthYearsTimelineSlider
            ariaLabel="DPS timeline in years"
            eyebrow="Timeline"
            onYearsChange={handleTimelineYearsChange}
            valueLabel={formatWealthCurrency(simulation.futureValue)}
            years={simulation.selectedYears}
          />

          <WealthProjectionSection
            accountIdentifier={accountIdentifier}
            accountIdentifierLabel={getCalculatorAccountIdentifierLabel("dps")}
            compactTop
            customSourceTax={customSourceTax}
            inflationRate={inflationRate}
            onAccountIdentifierChange={setAccountIdentifier}
            onCustomSourceTaxChange={setCustomSourceTax}
            onInflationRateChange={setInflationRate}
            onSourceTaxPresetChange={setSourceTaxPreset}
            showInflation
            showSourceTax
            sourceTaxPreset={sourceTaxPreset}
            title="Improve projection"
          />

          <GrowthVisualization
            activePoint={chartPaths.activePoint}
            clipWidth={chartPaths.clipWidth}
            depositedPath={chartPaths.depositedPath}
            milestonePoints={chartPaths.milestonePoints}
            wealthPath={chartPaths.wealthPath}
            totalDeposited={simulation.totalDeposited}
            futureValue={simulation.futureValue}
          />

          <MoneyFlowVisualization totalDeposited={simulation.totalDeposited} years={simulation.selectedYears} />
        </section>

        <section className="wealth-panel wealth-dps-result-panel">
          <div className="wealth-result-hero">
            <p className="eyebrow">{mode === "goal" ? "Monthly discipline needed" : "Projected future value"}</p>
            <h2>
              {mode === "goal"
                ? `${formatWealthCurrency(simulation.activeMonthlySaving)} / month`
                : formatWealthCurrency(simulation.futureValue)}
            </h2>
            <p className="wealth-result-summary">{buildSummary(mode, simulation)}</p>
          </div>

          {mode === "goal" ? (
            <div className="wealth-dps-goal-options">
              {goalOptions.map((option) => (
                <article key={option.year}>
                  <span>{option.year} years</span>
                  <strong>{formatWealthCurrency(option.monthlySaving)}</strong>
                  <small>per month</small>
                </article>
              ))}
            </div>
          ) : null}

          <div className="wealth-dps-ratio-card">
            <div className="wealth-dps-ratio-heading">
              <div>
                <p className="eyebrow">Contribution vs growth</p>
                <h3>Your deposits start it. Time does the quiet work.</h3>
              </div>
              <span>{Math.round(growthShare)}% growth</span>
            </div>
            <div className="wealth-dps-ratio-bar" aria-label="Deposits and investment growth ratio">
              <span className="wealth-dps-ratio-deposits" style={{ width: `${depositedShare}%` }} />
              <span className="wealth-dps-ratio-growth" style={{ width: `${growthShare}%` }} />
            </div>
            <div className="wealth-dps-ratio-values">
              <article className="wealth-dps-ratio-stat">
                <span className="wealth-dps-ratio-stat-label">Deposited</span>
                <strong className="wealth-dps-ratio-stat-value">{formatWealthCurrency(simulation.totalDeposited)}</strong>
              </article>
              <article className="wealth-dps-ratio-stat wealth-dps-ratio-stat-growth">
                <span className="wealth-dps-ratio-stat-label">Returns</span>
                <strong className="wealth-dps-ratio-stat-value">{formatWealthCurrency(simulation.investmentGrowth)}</strong>
              </article>
            </div>
          </div>

          <div className="wealth-dps-inflation-card">
            <span>Future value</span>
            <strong>{formatWealthCurrency(simulation.futureValue)}</strong>
            <p>May feel like approximately {formatWealthCurrency(simulation.realValue)} in today&apos;s purchasing power.</p>
          </div>

          <InsightPanel
            growthShare={growthShare}
            investmentGrowth={simulation.investmentGrowth}
            monthlySaving={simulation.activeMonthlySaving}
            years={simulation.selectedYears}
          />

          <WealthSaveSnapshotCard
            onSave={handleAddToSnapshot}
            saveLabel="Save to Snapshot"
            saveMessage={saveMessage}
            title="Track this monthly habit and projected DPS wealth in your snapshot."
          />
        </section>
      </div>

      <section className="wealth-panel wealth-dps-future-path">
        <div className="wealth-section-heading">
          <p className="eyebrow">Your future path</p>
          <h2>If you continue this habit...</h2>
          <p>Each milestone uses the same monthly saving and rate, so the path remains easy to compare.</p>
        </div>
        <div className="wealth-dps-path-grid">
          {futurePath.map((point, index) => (
            <article
              className={`wealth-dps-path-card wealth-dps-path-card-${index + 1} ${
                Math.round(simulation.selectedYears) === point.year ? "wealth-dps-path-active" : ""
              }`}
              key={point.year}
            >
              <span>{point.year} Years</span>
              <strong>{formatWealthCurrency(point.value)}</strong>
              <div style={{ height: `${52 + index * 16}px` }} />
            </article>
          ))}
        </div>
      </section>

      <div className="wealth-dps-lower-grid">
        <section className="wealth-panel wealth-dps-milestones">
          <div className="wealth-section-heading">
            <p className="eyebrow">At your current pace</p>
            <h2>Milestone engine</h2>
            <p>Dates are approximate and assume the same monthly habit continues.</p>
          </div>
          <div className="wealth-dps-milestone-list">
            {milestones.map((milestone) => (
              <article key={milestone.label}>
                <span>{milestone.label}</span>
                <strong>{milestone.arrival ?? "Beyond 50 years"}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="wealth-panel wealth-dps-waiting-card">
          <div className="wealth-section-heading">
            <p className="eyebrow">The Cost of Waiting</p>
            <h2>Starting later quietly changes the ending.</h2>
          </div>
          <label className="wealth-field">
            <span>Delay start by {simulation.delayYears} years</span>
            <input
              max="10"
              min="0"
              onChange={(event) => setStartDelayYears(event.target.value)}
              step="1"
              type="range"
              value={simulation.delayYears}
            />
          </label>
          <div className="wealth-dps-waiting-comparison">
            <article>
              <span>Start today</span>
              <strong>{formatWealthCurrency(simulation.futureValue)}</strong>
            </article>
            <article>
              <span>Start later</span>
              <strong>{formatWealthCurrency(simulation.laterFutureValue)}</strong>
            </article>
          </div>
          <p className="wealth-dps-cost-line">
            Starting today could create approximately <strong>+{formatWealthCurrency(simulation.costOfWaiting)}</strong>{" "}
            more future wealth.
          </p>
        </section>
      </div>

      <section className="wealth-next-steps wealth-dps-next-steps">
        <div className="wealth-section-heading">
          <p className="eyebrow">Keep exploring</p>
          <h2>The result is the beginning of the journey.</h2>
          <p className="wealth-muted-copy">Change the timeline, compare options, or carry this habit into your snapshot.</p>
        </div>
        <div className="wealth-chip-row">
          <Link className="wealth-chip" href="/wealth/compare/dps-vs-fdr">
            Compare with FDR
          </Link>
          <Link className="wealth-chip" href="/wealth/tools/compound-growth">
            Compare with Investing
          </Link>
          <button className="wealth-chip wealth-chip-button" onClick={() => void handleSaveScenario()} type="button">
            Save Scenario
          </button>
          <button
            className="wealth-chip wealth-chip-button"
            onClick={() => setMode(mode === "build" ? "goal" : "build")}
            type="button"
          >
            Try {mode === "build" ? "Goal Mode" : "Build Wealth"}
          </button>
          <button className="wealth-chip wealth-chip-button" onClick={() => setYears("20")} type="button">
            See 20-Year Projection
          </button>
        </div>
      </section>

      <footer className="wealth-dps-educational-footer">
        Educational projection only. Actual DPS terms, taxes, fees, and bank rules may differ.
      </footer>
    </section>
  );
}

function GrowthVisualization({
  activePoint,
  clipWidth,
  depositedPath,
  milestonePoints,
  wealthPath,
  totalDeposited,
  futureValue,
}: {
  activePoint: { x: number; y: number };
  clipWidth: number;
  depositedPath: string;
  milestonePoints: Array<{ label: string; x: number; y: number }>;
  wealthPath: string;
  totalDeposited: number;
  futureValue: number;
}) {
  return (
    <div className="wealth-dps-growth-card">
      <div className="wealth-dps-card-heading">
        <div>
          <p className="eyebrow">Visual wealth growth</p>
          <h3>Watch compound growth separate from deposits.</h3>
        </div>
        <div className="wealth-dps-chart-legend">
          <span className="wealth-dps-legend-deposited">Total Deposited</span>
          <span className="wealth-dps-legend-wealth">Total Wealth</span>
        </div>
      </div>
      <svg aria-hidden="true" className="wealth-dps-growth-chart" preserveAspectRatio="none" viewBox="0 0 320 180">
        <defs>
          <clipPath id="wealth-dps-active-chart-clip">
            <rect height="180" width={clipWidth} x="0" y="0" />
          </clipPath>
        </defs>
        <path className="wealth-dps-chart-grid" d="M0 145 H320 M0 105 H320 M0 65 H320 M0 25 H320" />
        <path className="wealth-dps-deposited-line wealth-dps-chart-future-line" d={depositedPath} />
        <path className="wealth-dps-wealth-line wealth-dps-chart-future-line" d={wealthPath} />
        <g clipPath="url(#wealth-dps-active-chart-clip)">
          <path className="wealth-dps-deposited-line" d={depositedPath} />
          <path className="wealth-dps-wealth-line" d={wealthPath} />
        </g>
        {milestonePoints.map((point) => (
          <g className="wealth-dps-chart-milestone" key={point.label}>
            <circle cx={point.x} cy={point.y} r="4" />
          </g>
        ))}
        <circle className="wealth-dps-wealth-glow-point" cx={activePoint.x} cy={activePoint.y} r="7" />
        <circle className="wealth-dps-wealth-point" cx={activePoint.x} cy={activePoint.y} r="4" />
      </svg>
      <div className="wealth-dps-chart-values">
        <span>Deposited {formatWealthCurrency(totalDeposited)}</span>
        <span>Wealth {formatWealthCurrency(futureValue)}</span>
      </div>
    </div>
  );
}

function MoneyFlowVisualization({ totalDeposited, years }: { totalDeposited: number; years: number }) {
  return (
    <div className="wealth-dps-flow-card">
      <div>
        <p className="eyebrow">Money flow</p>
        <h3>Monthly deposits flowing into a growing asset pool.</h3>
      </div>
      <div className="wealth-dps-flow-scene" aria-hidden="true">
        <div className="wealth-dps-flow-source">
          <span>Monthly habit</span>
        </div>
        <div className="wealth-dps-flow-stream">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className="wealth-dps-asset-pool">
          <span style={{ height: `${Math.min(34 + years * 3, 92)}%` }} />
          <strong>Wealth pool</strong>
        </div>
      </div>
      <p>{formatWealthCurrency(totalDeposited)} of habit has entered the pool so far.</p>
    </div>
  );
}

function InsightPanel({
  growthShare,
  investmentGrowth,
  monthlySaving,
  years,
}: {
  growthShare: number;
  investmentGrowth: number;
  monthlySaving: number;
  years: number;
}) {
  const insight =
    years <= 3
      ? {
          title: "Your habit matters more than your returns.",
          body: `${formatWealthCurrency(monthlySaving)} saved every month is the main engine in these first years.`,
        }
      : years <= 10
        ? {
            title: "Your earlier deposits are beginning to compound.",
            body: `${formatWealthCurrency(investmentGrowth)} of the projection now comes from accumulated returns.`,
          }
        : years <= 15
          ? {
              title: "Time is now contributing almost as much as you are.",
              body: `Returns represent about ${Math.round(growthShare)}% of the projected wealth at this horizon.`,
            }
          : {
              title: "A large part of your future wealth now comes from accumulated returns.",
              body: `${formatWealthCurrency(investmentGrowth)} is projected growth created by consistency and time.`,
            };

  return (
    <article className="wealth-insight-card wealth-insight-positive wealth-dps-aware-insight">
      <p className="eyebrow">Dynamic insight</p>
      <h3>{insight.title}</h3>
      <p>{insight.body}</p>
    </article>
  );
}

function buildSummary(
  mode: SimulatorMode,
  simulation: {
    activeMonthlySaving: number;
    futureValue: number;
    realValue: number;
    selectedYears: number;
    totalDeposited: number;
  },
) {
  if (mode === "goal") {
    return `To aim for ${formatWealthCurrency(simulation.futureValue)} in ${simulation.selectedYears} years, you may need about ${formatWealthCurrency(simulation.activeMonthlySaving)} per month.`;
  }
  return `Saving ${formatWealthCurrency(simulation.activeMonthlySaving)} every month could become ${formatWealthCurrency(simulation.futureValue)} in ${simulation.selectedYears} years, from ${formatWealthCurrency(simulation.totalDeposited)} of your own deposits.`;
}

function applyNetWealth(monthlySaving: number, annualRate: number, years: number, sourceTaxRate: number) {
  const grossFuture = futureValueAnnuity(monthlySaving, annualRate, years);
  const deposited = monthlySaving * 12 * years;
  const grossGrowth = Math.max(grossFuture - deposited, 0);
  const taxDeduction = grossGrowth * (sourceTaxRate / 100);
  const netGrowth = grossGrowth - taxDeduction;
  return {
    grossFuture,
    netFuture: deposited + netGrowth,
    grossGrowth,
    netGrowth,
    taxDeduction,
  };
}

function requiredMonthlyPaymentNet(
  targetAmount: number,
  annualRate: number,
  years: number,
  sourceTaxRate: number,
) {
  let low = 0;
  let high = Math.max(targetAmount / Math.max(years * 12, 1), 1);
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const mid = (low + high) / 2;
    const netFuture = applyNetWealth(mid, annualRate, years, sourceTaxRate).netFuture;
    if (netFuture < targetAmount) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

function buildGrowthChartPaths(
  monthlySaving: number,
  annualRate: number,
  years: number,
  sourceTaxRate: number,
) {
  const width = 320;
  const height = 160;
  const topPadding = 12;
  const maxYears = 20;
  const samples = maxYears * 4;
  const points = Array.from({ length: samples + 1 }).map((_, index) => {
    const pointYears = (maxYears * index) / samples;
    return {
      deposited: monthlySaving * 12 * pointYears,
      wealth: applyNetWealth(monthlySaving, annualRate, pointYears, sourceTaxRate).netFuture,
      x: (width * index) / samples,
    };
  });
  const maxValue = Math.max(...points.map((point) => point.wealth), 1);
  const activeX = (width * years) / maxYears;
  const activeValue = applyNetWealth(monthlySaving, annualRate, years, sourceTaxRate).netFuture;
  const activePoint = {
    x: activeX,
    y: valueToY(activeValue, maxValue, height, topPadding),
  };
  const milestonePoints = MILESTONES.flatMap((milestone) => {
    const arrivalYears = estimateMilestoneArrivalYears(
      monthlySaving,
      annualRate,
      milestone.value,
      maxYears,
      sourceTaxRate,
    );
    if (arrivalYears === null || arrivalYears > years) {
      return [];
    }
    return [{
      label: milestone.label,
      x: (width * arrivalYears) / maxYears,
      y: valueToY(milestone.value, maxValue, height, topPadding),
    }];
  });

  return {
    activePoint,
    clipWidth: activeX,
    depositedPath: pointsToPath(points.map((point) => ({ x: point.x, y: valueToY(point.deposited, maxValue, height, topPadding) }))),
    milestonePoints,
    wealthPath: pointsToPath(points.map((point) => ({ x: point.x, y: valueToY(point.wealth, maxValue, height, topPadding) }))),
  };
}

function futureValueAnnuity(monthlyPayment: number, annualRate: number, years: number) {
  const periods = Math.floor(Math.max(years, 0) * 12);
  const periodicRate = annualRate / 100 / 12;
  if (periods <= 0 || monthlyPayment <= 0) {
    return 0;
  }
  if (periodicRate === 0) {
    return monthlyPayment * periods;
  }
  return monthlyPayment * (((1 + periodicRate) ** periods - 1) / periodicRate);
}

function requiredMonthlyPayment(targetAmount: number, annualRate: number, years: number) {
  const periods = Math.floor(Math.max(years, 0) * 12);
  const periodicRate = annualRate / 100 / 12;
  if (periods <= 0) {
    return targetAmount;
  }
  if (periodicRate === 0) {
    return targetAmount / periods;
  }
  return targetAmount / (((1 + periodicRate) ** periods - 1) / periodicRate);
}

function estimateMilestoneArrival(
  monthlySaving: number,
  annualRate: number,
  milestoneValue: number,
  sourceTaxRate: number,
) {
  const arrivalYears = estimateMilestoneArrivalYears(
    monthlySaving,
    annualRate,
    milestoneValue,
    50,
    sourceTaxRate,
  );
  if (arrivalYears === null) {
    return null;
  }

  const date = new Date();
  date.setMonth(date.getMonth() + Math.ceil(arrivalYears * 12));
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

function estimateMilestoneArrivalYears(
  monthlySaving: number,
  annualRate: number,
  milestoneValue: number,
  maxYears: number,
  sourceTaxRate: number,
) {
  if (monthlySaving <= 0) {
    return null;
  }
  for (let month = 1; month <= maxYears * 12; month += 1) {
    const value = applyNetWealth(monthlySaving, annualRate, month / 12, sourceTaxRate).netFuture;
    if (value >= milestoneValue) {
      return month / 12;
    }
  }
  return null;
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function valueToY(value: number, maxValue: number, height: number, topPadding: number) {
  return topPadding + height - (value / maxValue) * height;
}

function toNumber(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
