"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/ui/metric-card";
import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSaveSnapshotCard } from "@/features/wealth/components/wealth-save-snapshot-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { resolveSourceTaxRate } from "@/features/wealth/components/wealth-source-tax-control";
import { getCalculatorAccountIdentifierLabel } from "@/features/wealth/lib/calculator-snapshot";
import { WEALTH_DEFAULT_RATES, WEALTH_TOOL_CONFIG } from "@/features/wealth/catalog/wealth-catalog";
import {
  appendLocalScenarioTitle,
  readLocalMoneySnapshot,
  saveLocalMoneySnapshotDraft,
} from "@/features/wealth/lib/local-money-snapshot";
import { useWealthTool } from "@/features/wealth/hooks/use-wealth-tool";
import type { WealthToolCalculateResponse } from "@/features/wealth/types/wealth-types";
import { buildToolResultViewModel, formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";
import { saveWealthScenario } from "@/lib/api/wealth-api";

const FDR_CONFIG = WEALTH_TOOL_CONFIG.fdr;
const FDR_TENURE_MIN = 1;
const FDR_TENURE_MAX = 15;
const FDR_TENURE_MARKS = [1, 3, 5, 10, 15] as const;

const FDR_PAYOUT_OPTIONS = [
  { value: "maturity", label: "At maturity", hint: "Compound until unlock" },
  { value: "monthly", label: "Monthly", hint: "Profit paid monthly" },
  { value: "quarterly", label: "Quarterly", hint: "Profit paid quarterly" },
  { value: "yearly", label: "Yearly", hint: "Profit paid yearly" },
] as const;

export function FdrToolWorkspace() {
  const { isAuthenticated } = useAuth();
  const initialInputs = useMemo(
    () => Object.fromEntries(FDR_CONFIG.fields.map((field) => [field.key, field.defaultValue ?? ""])),
    [],
  );

  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs);
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const [sourceTaxPreset, setSourceTaxPreset] = useState("10");
  const [customSourceTax, setCustomSourceTax] = useState("10");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const requestInputs = useMemo(() => {
    const payload: Record<string, string> = { ...inputs, source_tax_preset: sourceTaxPreset };
    if (sourceTaxPreset === "custom") {
      payload.source_tax_rate = customSourceTax;
    }
    return payload;
  }, [customSourceTax, inputs, sourceTaxPreset]);

  const assumptions = useMemo(
    () => ({
      country_code: "BD",
      inflation_rate: inflationRate ? Number(inflationRate) : undefined,
    }),
    [inflationRate],
  );

  const { result, isLoading, isError } = useWealthTool("fdr", requestInputs, assumptions);
  const viewModel = result ? buildToolResultViewModel(result) : null;
  const tenureYears = resolveTenureYears(inputs.tenure_value ?? "3", inputs.tenure_unit ?? "years");
  const tenureLabel = formatTenureLabel(tenureYears);
  const [durationYears, setDurationYears] = useState(() =>
    clampTenureYears(Math.round(tenureYears)),
  );

  useEffect(() => {
    setDurationYears(clampTenureYears(Math.round(resolveTenureYears(inputs.tenure_value ?? "3", inputs.tenure_unit ?? "years"))));
  }, [inputs.tenure_unit, inputs.tenure_value]);

  const monthlyIncome = useMemo(() => {
    if (!result) {
      return null;
    }
    const metricValue = findMetricValue(result, "monthly income equivalent");
    if (metricValue != null) {
      return Number(metricValue);
    }
    const principal = Number(inputs.principal) || 0;
    const rate = Number(inputs.annual_rate) || 0;
    const taxRate = resolveSourceTaxRate(sourceTaxPreset, customSourceTax);
    return ((principal * rate) / 1200) * (1 - taxRate / 100);
  }, [customSourceTax, inputs.annual_rate, inputs.principal, result, sourceTaxPreset]);

  const maturityValue = useMemo(() => {
    if (!result) {
      return null;
    }
    if (result.headline_label.toLowerCase().includes("maturity") || result.headline_label.toLowerCase().includes("profit")) {
      const metricValue = findMetricValue(result, "maturity value");
      if (metricValue != null && inputs.profit_distribution_type !== "maturity") {
        return Number(metricValue);
      }
    }
    return Number(result.headline_value);
  }, [inputs.profit_distribution_type, result]);

  const realValue = useMemo(() => {
    if (!result) {
      return null;
    }
    const metricValue = findMetricValue(result, "inflation-adjusted");
    return metricValue != null ? Number(metricValue) : null;
  }, [result]);

  const supportingMetrics = useMemo(() => {
    if (!viewModel) {
      return [];
    }
    return viewModel.metrics.filter((metric) => {
      const label = metric.label.toLowerCase();
      return (
        !label.includes("monthly income equivalent") &&
        !label.includes("inflation-adjusted") &&
        !label.includes("gross interest") &&
        !label.includes("source tax")
      );
    });
  }, [viewModel]);

  function handleTenureSliderChange(nextYears: number) {
    const clampedYears = clampTenureYears(nextYears);
    setDurationYears(clampedYears);
    setInputs((current) => ({
      ...current,
      tenure_value: String(clampedYears),
      tenure_unit: "years",
    }));
  }

  async function handleSaveScenario() {
    if (!result) {
      return;
    }
    appendLocalScenarioTitle(FDR_CONFIG.title);
    if (isAuthenticated) {
      await saveWealthScenario({
        scenario_type: "TOOL",
        slug: "fdr",
        title: FDR_CONFIG.title,
        input_json: requestInputs,
        output_json: result,
      });
    }
    setSaveMessage("FDR scenario saved to your local history.");
  }

  function handleSaveToSnapshot() {
    if (!result || maturityValue == null) {
      return;
    }
    const current = readLocalMoneySnapshot();
    saveLocalMoneySnapshotDraft({
      monthly_savings: current.monthly_savings,
      assets: [
        ...current.assets,
        {
          category: "DEPOSIT",
          label: "FDR deposit",
          value: Number(inputs.principal),
          metadata: {
            interest_rate: inputs.annual_rate,
            tenure_years: tenureYears,
            profit_distribution: inputs.profit_distribution_type,
            projected_maturity: maturityValue,
            source_tax_preset: sourceTaxPreset,
            ...(sourceTaxPreset === "custom" ? { source_tax_rate: customSourceTax } : {}),
            ...(accountIdentifier.trim() ? { account_identifier: accountIdentifier.trim() } : {}),
          },
        },
      ],
      liabilities: current.liabilities,
    });
    appendLocalScenarioTitle("FDR — lock money");
    setSaveMessage("FDR added to your Money Snapshot draft.");
  }

  return (
    <section className="wealth-tool-workspace wealth-fdr-workspace">
      <WealthSubNav />

      <header className="wealth-hero-card wealth-fdr-hero">
        <p className="eyebrow">FDR</p>
        <h1>{FDR_CONFIG.title}</h1>
        <p>{FDR_CONFIG.prompt}</p>
        <p className="wealth-muted-copy">Understand commitment, preserve wealth, and evaluate certainty with a calm calculator.</p>
      </header>

      <div className="wealth-tool-layout">
        <section className="wealth-panel wealth-tool-form-panel">
          <div className="wealth-form-grid">
            <label className="wealth-field">
              <span>Deposit amount</span>
              <input
                inputMode="decimal"
                onChange={(event) => setInputs((current) => ({ ...current, principal: event.target.value }))}
                value={inputs.principal ?? ""}
              />
            </label>
            <label className="wealth-field">
              <span>FDR interest rate (%)</span>
              <input
                inputMode="decimal"
                onChange={(event) => setInputs((current) => ({ ...current, annual_rate: event.target.value }))}
                value={inputs.annual_rate ?? ""}
              />
            </label>
            <label className="wealth-field wealth-tenure-field">
              <span>Duration</span>
              <div className="wealth-tenure-inputs">
                <input
                  inputMode="decimal"
                  onChange={(event) => setInputs((current) => ({ ...current, tenure_value: event.target.value }))}
                  value={inputs.tenure_value ?? ""}
                />
                <select
                  onChange={(event) => setInputs((current) => ({ ...current, tenure_unit: event.target.value }))}
                  value={inputs.tenure_unit ?? "years"}
                >
                  <option value="months">Months</option>
                  <option value="quarters">Quarters</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </label>
          </div>

          <WealthProjectionSection
            accountIdentifier={accountIdentifier}
            accountIdentifierLabel={getCalculatorAccountIdentifierLabel("fdr")}
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

          <FdrMaturityTimeline
            durationYears={durationYears}
            isLoading={isLoading}
            maturityValue={maturityValue}
            onYearsChange={handleTenureSliderChange}
          />
        </section>

        <section className="wealth-panel wealth-result-panel wealth-fdr-result-panel">
          {isLoading ? <p className="wealth-muted-copy">Updating your scenario…</p> : null}
          {isError ? <p className="wealth-error-copy">Could not calculate this scenario right now.</p> : null}
          {viewModel && result ? (
            <>
              <FdrPayoutSelector
                onChange={(value) => setInputs((current) => ({ ...current, profit_distribution_type: value }))}
                value={inputs.profit_distribution_type ?? "maturity"}
              />

              <div className="wealth-result-hero">
                <p className="eyebrow">{viewModel.headlineLabel}</p>
                <h2>{viewModel.headline}</h2>
                {viewModel.summary ? <p className="wealth-result-summary">{viewModel.summary}</p> : null}
              </div>

              {monthlyIncome != null && monthlyIncome > 0 && inputs.profit_distribution_type === "maturity" ? (
                <article className="wealth-fdr-income-card">
                  <p className="eyebrow">Monthly income equivalent</p>
                  <h3>{formatWealthCurrency(monthlyIncome)}</h3>
                  <div className="wealth-fdr-income-breakdown">
                    <span>≈ {formatWealthCurrency(monthlyIncome / 30)}/day</span>
                    <span>≈ {formatWealthCurrency((monthlyIncome * 12) / 52)}/week</span>
                  </div>
                </article>
              ) : null}

              {maturityValue != null && realValue != null && inputs.profit_distribution_type === "maturity" ? (
                <article className="wealth-fdr-inflation-card">
                  <p>
                    Your maturity value of <strong>{formatWealthCurrency(maturityValue)}</strong> may feel closer to
                    approximately <strong>{formatWealthCurrency(realValue)}</strong> in today&apos;s purchasing power.
                  </p>
                </article>
              ) : null}

              <article className="wealth-insight-card wealth-insight-neutral wealth-fdr-liquidity-card">
                <p className="eyebrow">Liquidity trade-off</p>
                <h3>Your money stays committed for approximately {tenureLabel}.</h3>
                <p>
                  FDR generally exchanges flexibility for a steadier and more predictable outcome. This is a calm trade,
                  not an alarm — simply know what you are choosing.
                </p>
              </article>

              {supportingMetrics.length > 0 ? (
                <div className="wealth-metric-grid wealth-supporting-metrics">
                  {supportingMetrics.map((metric) => (
                    <MetricCard helper={undefined} key={metric.label} label={metric.label} value={metric.value} />
                  ))}
                </div>
              ) : null}

              <WealthSaveSnapshotCard
                onSave={handleSaveToSnapshot}
                saveLabel="Save FDR"
                saveMessage={saveMessage}
                title="Track this deposit, maturity date, and projected returns in your snapshot."
              />

              <ExploreOtherPaths onSaveScenario={() => void handleSaveScenario()} />
            </>
          ) : null}
        </section>
      </div>

      <footer className="wealth-fdr-educational-footer">
        Educational projection only. Actual FDR terms, taxes, early-break penalties, and bank rules may differ.
      </footer>
    </section>
  );
}

function FdrPayoutSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="wealth-fdr-payout-selector">
      <div>
        <p className="eyebrow">Profit payout style</p>
        <h3>See how returns feel under different payout choices.</h3>
      </div>
      <div className="wealth-fdr-payout-options">
        {FDR_PAYOUT_OPTIONS.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={value === option.value ? "wealth-fdr-payout-active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function FdrMaturityTimeline({
  durationYears,
  isLoading,
  maturityValue,
  onYearsChange,
}: {
  durationYears: number;
  isLoading: boolean;
  maturityValue: number | null;
  onYearsChange: (years: number) => void;
}) {
  const wholeYears = clampTenureYears(durationYears);
  const sliderPercent = tenureSliderPercent(wholeYears);
  const storyStops = buildFdrStoryStops(wholeYears);
  const integerStops = Array.from({ length: FDR_TENURE_MAX }, (_, index) => index + 1);

  return (
    <div className="wealth-fdr-timeline-control">
      <div className="wealth-fdr-timeline-heading">
        <div>
          <p className="eyebrow">Commitment length</p>
          <h2>
            {wholeYears} year{wholeYears === 1 ? "" : "s"}
          </h2>
        </div>
        {isLoading ? (
          <span className="wealth-fdr-timeline-hint">Updating…</span>
        ) : maturityValue != null ? (
          <strong>{formatWealthCurrency(maturityValue)}</strong>
        ) : (
          <span className="wealth-fdr-timeline-hint">Maturity at unlock</span>
        )}
      </div>

      <div className="wealth-fdr-timeline-slider">
        <div className="wealth-fdr-timeline-story" aria-hidden="true">
          {storyStops.map((stop) => (
            <span
              className={[
                wholeYears >= stop.year ? "wealth-fdr-story-stop-active" : "",
                stop.year === FDR_TENURE_MIN ? "wealth-fdr-story-stop-start" : "",
                stop.year === FDR_TENURE_MAX ? "wealth-fdr-story-stop-end" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${stop.label}-${stop.year}`}
              style={{ left: `${tenureSliderPercent(stop.year)}%` }}
            >
              {stop.label}
            </span>
          ))}
        </div>
        <div className="wealth-fdr-range-shell">
          <span className="wealth-fdr-range-fill" style={{ width: `${sliderPercent}%` }} />
          {integerStops.map((tick) => (
            <span
              className={`wealth-fdr-range-tick ${FDR_TENURE_MARKS.includes(tick as (typeof FDR_TENURE_MARKS)[number]) ? "wealth-fdr-range-tick-major" : ""} ${wholeYears >= tick ? "wealth-fdr-stop-active" : ""}`}
              key={tick}
              style={{ left: `${tenureSliderPercent(tick)}%` }}
            />
          ))}
          <input
            aria-label="FDR commitment length in years"
            aria-valuetext={`${wholeYears} years`}
            max={FDR_TENURE_MAX}
            min={FDR_TENURE_MIN}
            onChange={(event) => onYearsChange(Number(event.currentTarget.value))}
            onInput={(event) => onYearsChange(Number(event.currentTarget.value))}
            step="1"
            type="range"
            value={wholeYears}
          />
        </div>
      </div>

      <div className="wealth-fdr-timeline-marks">
        {FDR_TENURE_MARKS.map((mark) => (
          <button
            className={wholeYears === mark ? "wealth-fdr-mark-active" : ""}
            key={mark}
            onClick={() => onYearsChange(mark)}
            style={{ left: `${tenureSliderPercent(mark)}%` }}
            type="button"
          >
            {mark}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExploreOtherPaths({ onSaveScenario }: { onSaveScenario: () => void }) {
  return (
    <section className="wealth-fdr-explore-paths">
      <div className="wealth-section-heading">
        <p className="eyebrow">Explore other paths</p>
        <h2>See how this fits into your bigger picture.</h2>
      </div>
      <div className="wealth-fdr-path-grid">
        <Link className="wealth-fdr-path-card" href="/wealth/tools/dps">
          <span>DPS</span>
          <p>Build wealth gradually through monthly discipline.</p>
          <strong>Compare →</strong>
        </Link>
        <Link className="wealth-fdr-path-card" href="/wealth/tools/sanchayapatra">
          <span>Sanchayapatra</span>
          <p>Government-backed certificate options.</p>
          <strong>Compare →</strong>
        </Link>
      </div>
      <button className="wealth-inline-link wealth-fdr-save-scenario" onClick={onSaveScenario} type="button">
        Save this FDR scenario
      </button>
    </section>
  );
}

function findMetricValue(result: WealthToolCalculateResponse, needle: string) {
  const metric = result.metrics.find((item) => item.label.toLowerCase().includes(needle.toLowerCase()));
  if (metric?.value == null || metric.value === "") {
    return null;
  }
  return metric.value;
}

function resolveTenureYears(value: string, unit: string) {
  const numericValue = Number(value) || 1;
  if (unit === "months") {
    return numericValue / 12;
  }
  if (unit === "quarters") {
    return numericValue / 4;
  }
  return numericValue;
}

function formatTenureLabel(years: number) {
  if (years < 1) {
    return `${Math.round(years * 12)} months`;
  }
  if (Number.isInteger(years)) {
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${years.toFixed(1)} years`;
}

function clampTenureYears(value: number) {
  return Math.max(FDR_TENURE_MIN, Math.min(FDR_TENURE_MAX, Math.round(value)));
}

function tenureSliderPercent(year: number) {
  return ((clampTenureYears(year) - FDR_TENURE_MIN) / (FDR_TENURE_MAX - FDR_TENURE_MIN)) * 100;
}

function buildFdrStoryStops(selectedYears: number) {
  const clampedYears = clampTenureYears(selectedYears);
  const stops: Array<{ year: number; label: string }> = [{ year: 1, label: "Today" }];

  if (clampedYears >= 4) {
    const midpoint = Math.ceil(clampedYears / 2);
    if (midpoint > 1 && midpoint < clampedYears) {
      stops.push({ year: midpoint, label: "Locked in" });
    }
  }

  if (clampedYears > 1) {
    stops.push({ year: clampedYears, label: "Maturity" });
  }

  return stops;
}
