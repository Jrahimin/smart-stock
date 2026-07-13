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
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type PlannerMode = "income" | "wealth";

const JOURNEY_STOP_KEYS = [
  { key: "purchase" as const, labelKey: "journeyPurchase" as const },
  { key: "first-payment" as const, labelKey: "journeyFirstPayment" as const },
  { key: "passive-income" as const, labelKey: "journeyPassiveIncome" as const },
  { key: "maturity" as const, labelKey: "journeyMaturity" as const },
] as const;

export function SanchayapatraToolWorkspace({ locale }: { locale: AppLocale }) {
  const copy = getWealthToolsLanguage(locale);
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
    const payoutLabel = resolvePayoutLabel(result, locale);

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
  }, [principal, result, locale]);

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

    setSaveMessage(copy.sanchayapatra.saveMessage);
  }

  return (
    <section className="wealth-tool-workspace wealth-sp-planner">
      <WealthSubNav locale={locale} />

      <header className="wealth-hero-card wealth-sp-hero">
        <div>
          <p className="eyebrow">{copy.sanchayapatra.eyebrow}</p>
          <h1>{copy.sanchayapatra.title}</h1>
          <p>{copy.sanchayapatra.description}</p>
        </div>
        <div className="wealth-sp-mode-toggle" aria-label={copy.sanchayapatra.eyebrow}>
          <button
            className={mode === "income" ? "wealth-sp-mode-active" : ""}
            onClick={() => setMode("income")}
            type="button"
          >
            {copy.sanchayapatra.income}
          </button>
          <button
            className={mode === "wealth" ? "wealth-sp-mode-active" : ""}
            onClick={() => setMode("wealth")}
            type="button"
          >
            {copy.sanchayapatra.wealth}
          </button>
        </div>
      </header>

      <div className="wealth-sp-stage">
        <section className="wealth-panel wealth-sp-control-panel">
          <div className="wealth-sp-primary-inputs">
            <label className="wealth-field">
              <span>{copy.sanchayapatra.certificate}</span>
              <select onChange={(event) => handleCertificateChange(event.target.value)} value={certificateType}>
                {SANCHAYAPATRA_CERTIFICATE_OPTIONS.map((certificate) => (
                  <option key={certificate.value} value={certificate.value}>
                    {certificate.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wealth-field wealth-sp-large-field">
              <span>{copy.sanchayapatra.investment}</span>
              <input inputMode="decimal" onChange={(event) => setPrincipal(event.target.value)} value={principal} />
            </label>
            <label className="wealth-field wealth-field-optional">
              <span>{copy.sanchayapatra.purchaseDate}</span>
              <input onChange={(event) => setPurchaseDate(event.target.value)} type="date" value={purchaseDate} />
            </label>
          </div>

          <article className="wealth-sp-rate-info" aria-label="Government rate information">
            <span>{copy.sanchayapatra.governmentRate}</span>
            <strong>{certificateConfig.defaultRate}%</strong>
            <small>{copy.sanchayapatra.configuredRate}</small>
          </article>

          <WealthProjectionSection
            accountIdentifier={accountIdentifier}
            accountIdentifierLabel={getCalculatorAccountIdentifierLabel("sanchayapatra", locale)}
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
            hint={copy.common.detailsHint}
            locale={locale}
          />
        </section>

        <section className="wealth-panel wealth-sp-result-panel">
          {isLoading ? <p className="wealth-muted-copy">{copy.common.updating}</p> : null}
          {isError ? <p className="wealth-error-copy">{copy.common.calculationError}</p> : null}
          {result && projection ? (
            <>
              <div className="wealth-result-hero">
                <p className="eyebrow">{copy.sanchayapatra.maturityEyebrow}</p>
                <h2>{formatWealthCurrency(projection.maturityValue)}</h2>
                <p className="wealth-result-summary">
                  {buildHeadlineSummary(mode, projection.investment, projection.maturityValue, certificateConfig, copy.sanchayapatra)}
                </p>
              </div>

              {mode === "income" && projection.payoutAmount != null && projection.payoutAmount > 0 ? (
                <article className="wealth-sp-income-highlight">
                  <p className="eyebrow">{copy.sanchayapatra.incomeEyebrow}</p>
                  <h3>{formatWealthCurrency(projection.payoutAmount)}</h3>
                  <p>
                    {copy.sanchayapatra.incomeBody.replace(
                      "{payout}",
                      projection.payoutLabel.toLowerCase(),
                    )}
                  </p>
                </article>
              ) : null}

              <CapitalReturnCard
                copy={copy.sanchayapatra}
                capitalShare={projection.capitalShare}
                earnedReturn={projection.earnedReturn}
                investment={projection.investment}
                returnShare={projection.returnShare}
              />

              <JourneyTimeline
                assumptionsUsed={projection.assumptionsUsed}
                certificateConfig={certificateConfig}
                copy={copy.sanchayapatra}
                locale={locale}
                purchaseDate={purchaseDate}
              />

              {projection.inflationAdjusted != null ? (
                <article className="wealth-sp-purchasing-card">
                  <div className="wealth-sp-card-heading">
                    <div>
                      <p className="eyebrow">{copy.sanchayapatra.purchasingEyebrow}</p>
                      <h3>{copy.sanchayapatra.purchasingTitle}</h3>
                    </div>
                  </div>
                  <div className="wealth-sp-purchasing-values">
                    <div>
                      <span>{copy.sanchayapatra.nominalMaturity}</span>
                      <strong>{formatWealthCurrency(projection.maturityValue)}</strong>
                    </div>
                    <div>
                      <span>{copy.sanchayapatra.equivalentToday}</span>
                      <strong>{formatWealthCurrency(projection.inflationAdjusted)}</strong>
                    </div>
                  </div>
                  <p className="wealth-sp-purchasing-helper">{copy.sanchayapatra.purchasingHelper}</p>
                </article>
              ) : null}

              <PlannerInsightCard
                certificateName={certificateConfig.displayName}
                copy={copy.sanchayapatra}
                durationYears={certificateConfig.durationYears}
                mode={mode}
                payoutLabel={projection.payoutLabel}
                returnShare={projection.returnShare}
              />

              <WealthSaveSnapshotCard
                onSave={() => void handleSaveCertificate()}
                saveLabel={copy.sanchayapatra.save}
                saveMessage={saveMessage}
                title={copy.sanchayapatra.snapshotTrackTitle}
                description={copy.common.snapshotEyebrow}
                locale={locale}
              />

              <p className="wealth-disclaimer">{result.disclaimer}</p>
            </>
          ) : null}
        </section>
      </div>

      <footer className="wealth-sp-educational-footer">
        {copy.sanchayapatra.disclaimer}
      </footer>
    </section>
  );
}

function CapitalReturnCard({
  copy,
  investment,
  earnedReturn,
  capitalShare,
  returnShare,
}: {
  copy: ReturnType<typeof getWealthToolsLanguage>["sanchayapatra"];
  investment: number;
  earnedReturn: number;
  capitalShare: number;
  returnShare: number;
}) {
  return (
    <article className="wealth-sp-capital-card">
      <div className="wealth-sp-card-heading">
        <div>
          <p className="eyebrow">{copy.capitalEyebrow}</p>
          <h3>{copy.capitalTitle}</h3>
        </div>
        <span>{copy.capitalShare.replace("{pct}", String(Math.round(returnShare)))}</span>
      </div>
      <div className="wealth-sp-capital-bar" aria-label={copy.capitalAria}>
        <span className="wealth-sp-capital-principal" style={{ width: `${capitalShare}%` }} />
        <span className="wealth-sp-capital-return" style={{ width: `${returnShare}%` }} />
      </div>
      <div className="wealth-sp-capital-values">
        <span>{copy.capitalInvestment.replace("{amount}", formatWealthCurrency(investment))}</span>
        <span>{copy.capitalReturn.replace("{amount}", formatWealthCurrency(earnedReturn))}</span>
      </div>
    </article>
  );
}

function JourneyTimeline({
  assumptionsUsed,
  certificateConfig,
  copy,
  locale,
  purchaseDate,
}: {
  assumptionsUsed: Record<string, unknown>;
  certificateConfig: ReturnType<typeof getSanchayapatraConfig>;
  copy: ReturnType<typeof getWealthToolsLanguage>["sanchayapatra"];
  locale: AppLocale;
  purchaseDate: string;
}) {
  const purchaseLabel = purchaseDate
    ? formatPreviewDate(purchaseDate, locale)
    : formatPreviewDate(String(assumptionsUsed.purchase_date ?? new Date().toISOString().slice(0, 10)), locale);
  const firstPaymentLabel = assumptionsUsed.next_payment_date
    ? formatPreviewDate(String(assumptionsUsed.next_payment_date), locale)
    : certificateConfig.profitDistribution === "maturity"
      ? copy.atMaturity
      : copy.afterPurchase;
  const maturityLabel = assumptionsUsed.maturity_date
    ? formatPreviewDate(String(assumptionsUsed.maturity_date), locale)
    : copy.yearsDuration.replace("{years}", String(certificateConfig.durationYears));

  const stopDetails: Record<(typeof JOURNEY_STOP_KEYS)[number]["key"], string> = {
    purchase: purchaseLabel,
    "first-payment": firstPaymentLabel,
    "passive-income": copy.yearsDuration.replace("{years}", String(certificateConfig.durationYears)),
    maturity: maturityLabel,
  };

  return (
    <article className="wealth-sp-journey-card">
      <div className="wealth-sp-card-heading">
        <div>
          <p className="eyebrow">{copy.journeyEyebrow}</p>
          <h3>{copy.journeyTitle}</h3>
        </div>
      </div>
      <div className="wealth-sp-journey-track" aria-hidden="true">
        <span className="wealth-sp-journey-line" />
        {JOURNEY_STOP_KEYS.map((stop, index) => (
          <span className="wealth-sp-journey-stop" key={stop.key} style={{ left: `${(index / (JOURNEY_STOP_KEYS.length - 1)) * 100}%` }}>
            <span className="wealth-sp-journey-dot" />
          </span>
        ))}
      </div>
      <div className="wealth-sp-journey-labels">
        {JOURNEY_STOP_KEYS.map((stop) => (
          <div className="wealth-sp-journey-label" key={stop.key}>
            <strong>{copy[stop.labelKey]}</strong>
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
  copy,
}: {
  mode: PlannerMode;
  returnShare: number;
  durationYears: number;
  payoutLabel: string;
  certificateName: string;
  copy: ReturnType<typeof getWealthToolsLanguage>["sanchayapatra"];
}) {
  const insight = buildPlannerInsight({ certificateName, durationYears, mode, payoutLabel, returnShare, copy });

  return (
    <article className="wealth-insight-card wealth-insight-neutral wealth-sp-insight-card">
      <p className="eyebrow">{copy.insightEyebrow}</p>
      <h3>{insight}</h3>
    </article>
  );
}

function buildHeadlineSummary(
  mode: PlannerMode,
  investment: number,
  maturityValue: number,
  certificateConfig: ReturnType<typeof getSanchayapatraConfig>,
  copy: ReturnType<typeof getWealthToolsLanguage>["sanchayapatra"],
) {
  const template = mode === "income" ? copy.headlineIncome : copy.headlineWealth;
  return template
    .replace("{investment}", formatWealthCurrency(investment))
    .replace("{years}", String(certificateConfig.durationYears))
    .replace("{maturity}", formatWealthCurrency(maturityValue));
}

function buildPlannerInsight({
  mode,
  returnShare,
  durationYears,
  payoutLabel,
  certificateName,
  copy,
}: {
  mode: PlannerMode;
  returnShare: number;
  durationYears: number;
  payoutLabel: string;
  certificateName: string;
  copy: ReturnType<typeof getWealthToolsLanguage>["sanchayapatra"];
}) {
  if (returnShare >= 55) {
    return copy.insightApproaching;
  }
  if (returnShare < 28) {
    return copy.insightProtected;
  }
  if (mode === "income") {
    return copy.insightSteadyIncome.replace("{payout}", payoutLabel.toLowerCase());
  }
  return copy.insightStability
    .replace("{name}", certificateName)
    .replace("{years}", String(durationYears));
}

function findMetricValue(result: WealthToolCalculateResponse, needle: string) {
  const metric = result.metrics.find((item) => item.label.toLowerCase().includes(needle.toLowerCase()));
  if (metric?.value == null || metric.value === "") {
    return null;
  }
  return metric.value;
}

function resolvePayoutLabel(result: WealthToolCalculateResponse, locale: AppLocale) {
  const payoutMetric = result.metrics.find((metric) => {
    const label = metric.label.toLowerCase();
    return label.includes("profit") && !label.includes("total");
  });
  if (locale === "bn") {
    return getWealthToolsLanguage(locale).sanchayapatra.profitPayment;
  }
  return payoutMetric?.label ?? "Profit payment";
}

function formatPreviewDate(value: string, locale: AppLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
