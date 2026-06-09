"use client";

import { useMemo, useState } from "react";

import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSaveSnapshotCard } from "@/features/wealth/components/wealth-save-snapshot-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { getCalculatorAccountIdentifierLabel } from "@/features/wealth/lib/calculator-snapshot";
import { WEALTH_DEFAULT_RATES } from "@/features/wealth/catalog/wealth-catalog";
import {
  SANCHAYAPATRA_CERTIFICATE_OPTIONS,
  buildSanchayapatraMetadata,
  getSanchayapatraConfig,
} from "@/features/wealth/catalog/sanchayapatra-catalog";
import { appendLocalScenarioTitle, readLocalMoneySnapshot, saveLocalMoneySnapshotDraft } from "@/features/wealth/lib/local-money-snapshot";
import { useWealthTool } from "@/features/wealth/hooks/use-wealth-tool";
import type { WealthToolCalculateResponse } from "@/features/wealth/types/wealth-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";
import { saveWealthScenario } from "@/lib/api/wealth-api";

type PlannerMode = "income" | "wealth";

const JOURNEY_STOPS = [
  { key: "purchase", label: "Certificate Purchased" },
  { key: "first-payment", label: "First Profit Payment" },
  { key: "passive-income", label: "Years of Passive Income" },
  { key: "maturity", label: "Certificate Matures" },
] as const;

export function SanchayapatraToolWorkspace() {
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<PlannerMode>("income");
  const [certificateType, setCertificateType] = useState("family-savings");
  const [principal, setPrincipal] = useState("1000000");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [sourceTaxPreset, setSourceTaxPreset] = useState("10");
  const [customSourceTax, setCustomSourceTax] = useState("10");
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const certificateConfig = useMemo(() => getSanchayapatraConfig(certificateType), [certificateType]);

  const inputs = useMemo(() => {
    const payload: Record<string, string> = {
      certificate_type: certificateType,
      principal,
      source_tax_preset: sourceTaxPreset,
      profit_distribution_type: "configured",
    };
    if (purchaseDate) {
      payload.purchase_date = purchaseDate;
    }
    if (sourceTaxPreset === "custom") {
      payload.source_tax_rate = customSourceTax;
    }
    return payload;
  }, [certificateType, customSourceTax, principal, purchaseDate, sourceTaxPreset]);

  const assumptions = useMemo(
    () => ({
      country_code: "BD",
      inflation_rate: inflationRate ? Number(inflationRate) : undefined,
    }),
    [inflationRate],
  );

  const { result, isLoading, isError } = useWealthTool("sanchayapatra", inputs, assumptions);

  const projection = useMemo(() => {
    if (!result) {
      return null;
    }
    const assumptionsUsed = result.assumptions_used ?? {};
    const investment = Number(principal) || 0;
    const maturityValue = Number(result.headline_value) || 0;
    const earnedReturn = Math.max(maturityValue - investment, 0);
    const returnShare = maturityValue > 0 ? (earnedReturn / maturityValue) * 100 : 0;
    const capitalShare = Math.max(100 - returnShare, 0);
    const inflationAdjusted = findMetricValue(result, "inflation-adjusted");
    const rawPayout = assumptionsUsed.next_payment_amount ?? findMetricValue(result, "profit");
    const normalizedPayout = rawPayout != null ? Number(rawPayout) : null;
    const payoutLabel = resolvePayoutLabel(result);

    return {
      assumptionsUsed,
      capitalShare,
      earnedReturn,
      inflationAdjusted: inflationAdjusted != null ? Number(inflationAdjusted) : null,
      investment,
      maturityValue,
      payoutAmount: normalizedPayout != null && !Number.isNaN(normalizedPayout) ? normalizedPayout : null,
      payoutLabel,
      returnShare,
    };
  }, [principal, result]);

  function handleCertificateChange(nextType: string) {
    const config = getSanchayapatraConfig(nextType);
    setCertificateType(nextType);
    setSourceTaxPreset(config.defaultSourceTax);
    setCustomSourceTax(config.defaultSourceTax);
  }

  async function handleSaveCertificate() {
    if (!result) {
      return;
    }

    const config = getSanchayapatraConfig(certificateType);
    const current = readLocalMoneySnapshot();
    const metadata = {
      ...buildSanchayapatraMetadata(certificateType),
      ...(purchaseDate ? { purchase_date: purchaseDate } : {}),
      ...(sourceTaxPreset === "custom" ? { source_tax_rate: customSourceTax } : { source_tax_preset: sourceTaxPreset }),
      ...(accountIdentifier.trim() ? { account_identifier: accountIdentifier.trim() } : {}),
    };

    saveLocalMoneySnapshotDraft({
      monthly_savings: current.monthly_savings,
      assets: [
        ...current.assets,
        {
          category: "SANCHAYAPATRA",
          label: config.displayName,
          value: Number(principal),
          metadata,
        },
      ],
      liabilities: current.liabilities,
    });

    appendLocalScenarioTitle("Government Savings Planner");
    if (isAuthenticated) {
      await saveWealthScenario({
        scenario_type: "TOOL",
        slug: "sanchayapatra",
        title: "Government Savings Planner",
        input_json: inputs,
        output_json: result,
      });
    }

    setSaveMessage("Certificate added to your Money Snapshot draft.");
  }

  return (
    <section className="wealth-tool-workspace wealth-sp-planner">
      <WealthSubNav />

      <header className="wealth-hero-card wealth-sp-hero">
        <div>
          <p className="eyebrow">Government Savings Planner</p>
          <h1>Turn today&apos;s savings into years of predictable family income.</h1>
          <p>
            Government savings certificates help preserve capital while generating reliable cash flow for future needs.
          </p>
        </div>
        <div className="wealth-sp-mode-toggle" aria-label="Planner presentation mode">
          <button
            className={mode === "income" ? "wealth-sp-mode-active" : ""}
            onClick={() => setMode("income")}
            type="button"
          >
            Generate Income
          </button>
          <button
            className={mode === "wealth" ? "wealth-sp-mode-active" : ""}
            onClick={() => setMode("wealth")}
            type="button"
          >
            Preserve Wealth
          </button>
        </div>
      </header>

      <div className="wealth-sp-stage">
        <section className="wealth-panel wealth-sp-control-panel">
          <div className="wealth-sp-primary-inputs">
            <label className="wealth-field">
              <span>Certificate type</span>
              <select onChange={(event) => handleCertificateChange(event.target.value)} value={certificateType}>
                {SANCHAYAPATRA_CERTIFICATE_OPTIONS.map((certificate) => (
                  <option key={certificate.value} value={certificate.value}>
                    {certificate.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wealth-field wealth-sp-large-field">
              <span>Investment amount</span>
              <input inputMode="decimal" onChange={(event) => setPrincipal(event.target.value)} value={principal} />
            </label>
            <label className="wealth-field wealth-field-optional">
              <span>Purchase date</span>
              <input onChange={(event) => setPurchaseDate(event.target.value)} type="date" value={purchaseDate} />
            </label>
          </div>

          <article className="wealth-sp-rate-info" aria-label="Government rate information">
            <span>Government rate</span>
            <strong>{certificateConfig.defaultRate}%</strong>
            <small>Current official configured rate</small>
          </article>

          <WealthProjectionSection
            accountIdentifier={accountIdentifier}
            accountIdentifierLabel={getCalculatorAccountIdentifierLabel("sanchayapatra")}
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
        </section>

        <section className="wealth-panel wealth-sp-result-panel">
          {isLoading ? <p className="wealth-muted-copy">Updating your projection…</p> : null}
          {isError ? <p className="wealth-error-copy">Could not calculate this scenario right now.</p> : null}
          {result && projection ? (
            <>
              <div className="wealth-result-hero">
                <p className="eyebrow">Estimated maturity value</p>
                <h2>{formatWealthCurrency(projection.maturityValue)}</h2>
                <p className="wealth-result-summary">
                  {buildHeadlineSummary(mode, projection.investment, projection.maturityValue, certificateConfig)}
                </p>
              </div>

              {mode === "income" && projection.payoutAmount != null && projection.payoutAmount > 0 ? (
                <article className="wealth-sp-income-highlight">
                  <p className="eyebrow">Steady income potential</p>
                  <h3>{formatWealthCurrency(projection.payoutAmount)}</h3>
                  <p>Estimated {projection.payoutLabel.toLowerCase()} from government profit payouts.</p>
                </article>
              ) : null}

              <CapitalReturnCard
                capitalShare={projection.capitalShare}
                earnedReturn={projection.earnedReturn}
                investment={projection.investment}
                returnShare={projection.returnShare}
              />

              <JourneyTimeline
                assumptionsUsed={projection.assumptionsUsed}
                certificateConfig={certificateConfig}
                purchaseDate={purchaseDate}
              />

              {projection.inflationAdjusted != null ? (
                <article className="wealth-sp-purchasing-card">
                  <div className="wealth-sp-card-heading">
                    <div>
                      <p className="eyebrow">Today&apos;s buying power</p>
                      <h3>What maturity may feel like later</h3>
                    </div>
                  </div>
                  <div className="wealth-sp-purchasing-values">
                    <div>
                      <span>Nominal maturity value</span>
                      <strong>{formatWealthCurrency(projection.maturityValue)}</strong>
                    </div>
                    <div>
                      <span>Equivalent value in today&apos;s money</span>
                      <strong>{formatWealthCurrency(projection.inflationAdjusted)}</strong>
                    </div>
                  </div>
                  <p className="wealth-sp-purchasing-helper">
                    Inflation may reduce future purchasing power over time.
                  </p>
                </article>
              ) : null}

              <PlannerInsightCard
                certificateName={certificateConfig.displayName}
                durationYears={certificateConfig.durationYears}
                mode={mode}
                payoutLabel={projection.payoutLabel}
                returnShare={projection.returnShare}
              />

              <WealthSaveSnapshotCard
                onSave={() => void handleSaveCertificate()}
                saveLabel="Save Certificate"
                saveMessage={saveMessage}
                title="Track this certificate, future profit payments, and maturity automatically."
              />

              <p className="wealth-disclaimer">{result.disclaimer}</p>
            </>
          ) : null}
        </section>
      </div>

      <footer className="wealth-sp-educational-footer">
        Educational projection only. Actual certificate terms, taxes, and government rules may differ.
      </footer>
    </section>
  );
}

function CapitalReturnCard({
  investment,
  earnedReturn,
  capitalShare,
  returnShare,
}: {
  investment: number;
  earnedReturn: number;
  capitalShare: number;
  returnShare: number;
}) {
  return (
    <article className="wealth-sp-capital-card">
      <div className="wealth-sp-card-heading">
        <div>
          <p className="eyebrow">Your savings at work</p>
          <h3>Your original capital stays protected. Government returns quietly build the rest.</h3>
        </div>
        <span>{Math.round(returnShare)}% generated through returns</span>
      </div>
      <div className="wealth-sp-capital-bar" aria-label="Investment versus earned return">
        <span className="wealth-sp-capital-principal" style={{ width: `${capitalShare}%` }} />
        <span className="wealth-sp-capital-return" style={{ width: `${returnShare}%` }} />
      </div>
      <div className="wealth-sp-capital-values">
        <span>Your investment {formatWealthCurrency(investment)}</span>
        <span>Earned return {formatWealthCurrency(earnedReturn)}</span>
      </div>
    </article>
  );
}

function JourneyTimeline({
  assumptionsUsed,
  certificateConfig,
  purchaseDate,
}: {
  assumptionsUsed: Record<string, unknown>;
  certificateConfig: ReturnType<typeof getSanchayapatraConfig>;
  purchaseDate: string;
}) {
  const purchaseLabel = purchaseDate
    ? formatPreviewDate(purchaseDate)
    : formatPreviewDate(String(assumptionsUsed.purchase_date ?? new Date().toISOString().slice(0, 10)));
  const firstPaymentLabel = assumptionsUsed.next_payment_date
    ? formatPreviewDate(String(assumptionsUsed.next_payment_date))
    : certificateConfig.profitDistribution === "maturity"
      ? "At maturity"
      : "After purchase";
  const maturityLabel = assumptionsUsed.maturity_date
    ? formatPreviewDate(String(assumptionsUsed.maturity_date))
    : `${certificateConfig.durationYears} years`;

  const stopDetails: Record<(typeof JOURNEY_STOPS)[number]["key"], string> = {
    purchase: purchaseLabel,
    "first-payment": firstPaymentLabel,
    "passive-income": `${certificateConfig.durationYears} years`,
    maturity: maturityLabel,
  };

  return (
    <article className="wealth-sp-journey-card">
      <div className="wealth-sp-card-heading">
        <div>
          <p className="eyebrow">Certificate journey</p>
          <h3>Savings → Security → Monthly income → Future maturity</h3>
        </div>
      </div>
      <div className="wealth-sp-journey-track" aria-hidden="true">
        <span className="wealth-sp-journey-line" />
        {JOURNEY_STOPS.map((stop, index) => (
          <span className="wealth-sp-journey-stop" key={stop.key} style={{ left: `${(index / (JOURNEY_STOPS.length - 1)) * 100}%` }}>
            <span className="wealth-sp-journey-dot" />
          </span>
        ))}
      </div>
      <div className="wealth-sp-journey-labels">
        {JOURNEY_STOPS.map((stop) => (
          <div className="wealth-sp-journey-label" key={stop.key}>
            <strong>{stop.label}</strong>
            <small>{stopDetails[stop.key]}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function PlannerInsightCard({
  mode,
  returnShare,
  durationYears,
  payoutLabel,
  certificateName,
}: {
  mode: PlannerMode;
  returnShare: number;
  durationYears: number;
  payoutLabel: string;
  certificateName: string;
}) {
  const insight = buildPlannerInsight({ certificateName, durationYears, mode, payoutLabel, returnShare });

  return (
    <article className="wealth-insight-card wealth-insight-neutral wealth-sp-insight-card">
      <p className="eyebrow">Insight</p>
      <h3>{insight}</h3>
    </article>
  );
}

function buildHeadlineSummary(
  mode: PlannerMode,
  investment: number,
  maturityValue: number,
  certificateConfig: ReturnType<typeof getSanchayapatraConfig>,
) {
  if (mode === "income") {
    return `Your ${formatWealthCurrency(investment)} investment could provide steady government-backed income over ${certificateConfig.durationYears} years and grow into approximately ${formatWealthCurrency(maturityValue)} by maturity.`;
  }
  return `Your ${formatWealthCurrency(investment)} investment could preserve capital while government returns quietly build toward approximately ${formatWealthCurrency(maturityValue)} over the certificate period.`;
}

function buildPlannerInsight({
  mode,
  returnShare,
  durationYears,
  payoutLabel,
  certificateName,
}: {
  mode: PlannerMode;
  returnShare: number;
  durationYears: number;
  payoutLabel: string;
  certificateName: string;
}) {
  if (returnShare >= 55) {
    return "Your investment is approaching maturity.";
  }
  if (returnShare < 28) {
    return "Most of your capital remains protected while profits accumulate.";
  }
  if (mode === "income") {
    return `Your certificate is beginning to generate steady income through ${payoutLabel.toLowerCase()} payouts.`;
  }
  return `${certificateName} offers government-backed stability rather than aggressive growth over ${durationYears} years.`;
}

function resolvePayoutLabel(result: WealthToolCalculateResponse) {
  const payoutMetric = result.metrics.find((metric) => {
    const label = metric.label.toLowerCase();
    return label.includes("profit") && !label.includes("total");
  });
  return payoutMetric?.label ?? "Profit payment";
}

function findMetricValue(result: WealthToolCalculateResponse, needle: string) {
  const metric = result.metrics.find((item) => item.label.toLowerCase().includes(needle.toLowerCase()));
  if (metric?.value == null || metric.value === "") {
    return null;
  }
  return metric.value;
}

function formatPreviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
