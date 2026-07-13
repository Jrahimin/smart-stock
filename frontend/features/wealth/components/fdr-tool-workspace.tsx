"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/ui/metric-card";
import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSaveSnapshotCard } from "@/features/wealth/components/wealth-save-snapshot-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  snapWealthTimelineYear,
  WealthYearsTimelineSlider,
} from "@/features/wealth/components/wealth-years-timeline-slider";
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
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

const FDR_CONFIG = WEALTH_TOOL_CONFIG.fdr;

const FDR_PAYOUT_OPTIONS = [
  { value: "monthly", label: "Monthly", hint: "Profit paid monthly" },
  { value: "quarterly", label: "Quarterly", hint: "Profit paid quarterly" },
  { value: "yearly", label: "Yearly", hint: "Profit paid yearly" },
  { value: "maturity", label: "At maturity", hint: "Compound until unlock" },
] as const;

export function FdrToolWorkspace({ locale }: { locale: AppLocale }) {
  const copy = getWealthToolsLanguage(locale);
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
  const tenureYears = resolveTenureYears(inputs.tenure_value ?? "3", inputs.tenure_unit ?? "years");
  const tenureLabel = formatTenureLabel(tenureYears, copy.common.years);
  const viewModel = result ? buildToolResultViewModel(result) : null;
  const displayViewModel = localizeFdrViewModel(
    viewModel,
    locale,
    result,
    inputs,
    sourceTaxPreset,
    customSourceTax,
    tenureLabel,
  );
  const [durationYears, setDurationYears] = useState(() =>
    snapWealthTimelineYear(Math.round(tenureYears)),
  );

  useEffect(() => {
    setDurationYears(
      snapWealthTimelineYear(Math.round(resolveTenureYears(inputs.tenure_value ?? "3", inputs.tenure_unit ?? "years"))),
    );
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
    if (!displayViewModel) {
      return [];
    }
    return displayViewModel.metrics.filter((metric) => {
      const label = metric.label.toLowerCase();
      return (
        !label.includes("monthly income equivalent") &&
        !label.includes("inflation-adjusted") &&
        !label.includes("gross interest") &&
        !label.includes("source tax")
      );
    });
  }, [displayViewModel]);

  function handleTenureSliderChange(nextYears: number) {
    const clampedYears = snapWealthTimelineYear(nextYears);
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
    setSaveMessage(copy.fdr.saveScenarioDone);
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
    setSaveMessage(copy.fdr.saveSnapshotDone);
  }

  return (
    <section className="wealth-tool-workspace wealth-fdr-workspace">
      <WealthSubNav locale={locale} />

      <header className="wealth-hero-card wealth-fdr-hero">
        <p className="eyebrow">FDR</p>
        <h1>{copy.fdr.title}</h1>
        <p>{copy.fdr.prompt}</p>
        <p className="wealth-muted-copy">{copy.fdr.helper}</p>
      </header>

      <div className="wealth-tool-layout">
        <section className="wealth-panel wealth-tool-form-panel">
          <div className="wealth-form-grid">
            <label className="wealth-field">
              <span>{copy.fdr.deposit}</span>
              <input
                inputMode="decimal"
                onChange={(event) => setInputs((current) => ({ ...current, principal: event.target.value }))}
                value={inputs.principal ?? ""}
              />
            </label>
            <label className="wealth-field">
              <span>{copy.fdr.rate}</span>
              <input
                inputMode="decimal"
                onChange={(event) => setInputs((current) => ({ ...current, annual_rate: event.target.value }))}
                value={inputs.annual_rate ?? ""}
              />
            </label>
            <label className="wealth-field wealth-tenure-field">
              <span>{copy.fdr.duration}</span>
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
                  <option value="months">{copy.fdr.months}</option>
                  <option value="quarters">{copy.fdr.quarters}</option>
                  <option value="years">{copy.fdr.years}</option>
                </select>
              </div>
            </label>
          </div>

          <WealthYearsTimelineSlider
            ariaLabel={copy.fdr.commitment}
            eyebrow={copy.fdr.commitment}
            onYearsChange={handleTenureSliderChange}
            valueLabel={
              isLoading ? (
                <span className="wealth-muted-copy">{copy.common.updating}</span>
              ) : maturityValue != null ? (
                formatWealthCurrency(maturityValue)
              ) : (
                <span className="wealth-muted-copy">{copy.fdr.maturity}</span>
              )
            }
            years={durationYears}
          />

          <WealthProjectionSection
            accountIdentifier={accountIdentifier}
            accountIdentifierLabel={getCalculatorAccountIdentifierLabel("fdr", locale)}
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
            title={copy.common.detailsTitle}
            locale={locale}
          />
        </section>

        <section className="wealth-panel wealth-result-panel wealth-fdr-result-panel">
          {isLoading ? <p className="wealth-muted-copy">{copy.common.updating}</p> : null}
          {isError ? <p className="wealth-error-copy">{copy.common.calculationError}</p> : null}
          {displayViewModel && result ? (
            <>
              <FdrPayoutSelector
                copy={copy.fdr}
                onChange={(value) => setInputs((current) => ({ ...current, profit_distribution_type: value }))}
                value={inputs.profit_distribution_type ?? "maturity"}
              />

              <div className="wealth-result-hero">
                <p className="eyebrow">{displayViewModel.headlineLabel}</p>
                <h2>{displayViewModel.headline}</h2>
                {displayViewModel.summary ? <p className="wealth-result-summary">{displayViewModel.summary}</p> : null}
              </div>

              {monthlyIncome != null && monthlyIncome > 0 && inputs.profit_distribution_type === "maturity" ? (
                <article className="wealth-fdr-income-card">
                  <p className="eyebrow">{copy.fdr.monthlyIncome}</p>
                  <h3>{formatWealthCurrency(monthlyIncome)}</h3>
                  <div className="wealth-fdr-income-breakdown">
                    <span>≈ {formatWealthCurrency(monthlyIncome / 30)} {copy.fdr.perDay}</span>
                    <span>≈ {formatWealthCurrency((monthlyIncome * 12) / 52)} {copy.fdr.perWeek}</span>
                  </div>
                </article>
              ) : null}

              {maturityValue != null && realValue != null && inputs.profit_distribution_type === "maturity" ? (
                <article className="wealth-fdr-inflation-card">
                  <p>
                    {copy.fdr.buyingPower.replace("{real}", formatWealthCurrency(realValue))}
                  </p>
                </article>
              ) : null}

              <article className="wealth-insight-card wealth-insight-neutral wealth-fdr-liquidity-card">
                <p className="eyebrow">{copy.fdr.liquidity}</p>
                <h3>{copy.fdr.liquidityTitle.replace("{tenure}", tenureLabel)}</h3>
                <p>{copy.fdr.liquidityBody}</p>
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
                saveLabel={copy.fdr.save}
                saveMessage={saveMessage}
                title={copy.fdr.snapshotTitle}
                locale={locale}
              />

              <ExploreOtherPaths copy={copy.fdr} onSaveScenario={() => void handleSaveScenario()} />
            </>
          ) : null}
        </section>
      </div>

      <footer className="wealth-fdr-educational-footer">
        {copy.fdr.disclaimer}
      </footer>
    </section>
  );
}

function FdrPayoutSelector({ value, onChange, copy }: { value: string; onChange: (value: string) => void; copy: Record<string, string> }) {
  return (
    <div className="wealth-fdr-payout-selector">
      <div>
        <p className="eyebrow">{copy.payout}</p>
        <h3>{copy.payoutTitle}</h3>
      </div>
      <div className="wealth-fdr-payout-options">
        {FDR_PAYOUT_OPTIONS.map((option) => {
          const localized = {
            monthly: { label: copy.payoutMonthly, hint: copy.payoutMonthlyHint },
            quarterly: { label: copy.payoutQuarterly, hint: copy.payoutQuarterlyHint },
            yearly: { label: copy.payoutYearly, hint: copy.payoutYearlyHint },
            maturity: { label: copy.payoutMaturity, hint: copy.payoutMaturityHint },
          }[option.value];
          return (
          <button
            aria-pressed={value === option.value}
            className={value === option.value ? "wealth-fdr-payout-active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <strong>{localized.label}</strong>
            <small>{localized.hint}</small>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function ExploreOtherPaths({ copy, onSaveScenario }: { copy: Record<string, string>; onSaveScenario: () => void }) {
  return (
    <section className="wealth-fdr-explore-paths">
      <div className="wealth-section-heading">
        <p className="eyebrow">{copy.otherPaths}</p>
        <h2>{copy.otherPathsTitle}</h2>
      </div>
      <div className="wealth-fdr-path-grid">
        <Link className="wealth-fdr-path-card" href="/wealth/tools/dps">
          <span>DPS</span>
          <p>{copy.dpsPath}</p>
          <strong>{copy.compare} →</strong>
        </Link>
        <Link className="wealth-fdr-path-card" href="/wealth/tools/sanchayapatra">
          <span>Sanchayapatra</span>
          <p>{copy.sanchayapatraPath}</p>
          <strong>{copy.compare} →</strong>
        </Link>
      </div>
      <button className="wealth-inline-link wealth-fdr-save-scenario" onClick={onSaveScenario} type="button">
        {copy.saveScenario}
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

function formatTenureLabel(years: number, formatYears: (value: number) => string) {
  if (years < 1) {
    return `${Math.round(years * 12)} months`;
  }
  return formatYears(Number.isInteger(years) ? years : Number(years.toFixed(1)));
}

const FDR_METRIC_LABELS: Record<string, string> = {
  Principal: "metricPrincipal",
  "Gross interest earned": "metricGrossInterest",
  "Source tax deduction": "metricSourceTaxDeduction",
  "Net interest earned": "metricNetInterest",
  "Inflation-adjusted value": "metricInflationAdjusted",
  "Monthly income equivalent": "metricMonthlyIncome",
  "Maturity value": "metricMaturityValue",
  "Monthly profit": "profitMonthly",
  "Quarterly profit": "profitQuarterly",
  "Yearly profit": "profitYearly",
  "Net maturity value": "netMaturityValue",
};

function localizeFdrViewModel(
  viewModel: ReturnType<typeof buildToolResultViewModel> | null,
  locale: AppLocale,
  result: WealthToolCalculateResponse | null,
  inputs: Record<string, string>,
  sourceTaxPreset: string,
  customSourceTax: string,
  tenureLabel: string,
) {
  if (!viewModel || locale !== "bn" || !result) {
    return viewModel;
  }

  const copy = getWealthToolsLanguage(locale).fdr;
  const taxRate = String(resolveSourceTaxRate(sourceTaxPreset, customSourceTax));
  const principal = formatWealthCurrency(inputs.principal ?? "0");
  const payoutMode = inputs.profit_distribution_type ?? "maturity";
  const isMaturityPayout = payoutMode === "maturity";

  const headlineLabel = isMaturityPayout
    ? copy.netMaturityValue
    : copy[FDR_METRIC_LABELS[result.headline_label] ?? ""] ?? result.headline_label;

  const summary = isMaturityPayout
    ? copy.summaryMaturity
        .replace("{tax}", taxRate)
        .replace("{principal}", principal)
        .replace("{maturity}", viewModel.headline)
        .replace("{tenure}", tenureLabel)
    : copy.summaryPayout
        .replace("{tax}", taxRate)
        .replace("{principal}", principal)
        .replace("{payout}", viewModel.headline)
        .replace(
          "{frequency}",
          payoutMode === "monthly"
            ? copy.payoutMonthly.toLowerCase()
            : payoutMode === "quarterly"
              ? copy.payoutQuarterly.toLowerCase()
              : copy.payoutYearly.toLowerCase(),
        );

  return {
    ...viewModel,
    headlineLabel,
    summary,
    metrics: viewModel.metrics.map((metric) => ({
      ...metric,
      label: copy[FDR_METRIC_LABELS[metric.label] ?? ""] ?? metric.label,
    })),
  };
}
