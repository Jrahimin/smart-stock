"use client";

import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/ui/metric-card";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { WealthNextSteps } from "@/features/wealth/components/wealth-next-steps";
import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSaveSnapshotCard } from "@/features/wealth/components/wealth-save-snapshot-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { WealthInfoModal } from "@/features/wealth/components/wealth-info-modal";
import { WEALTH_DEFAULT_RATES, WEALTH_TOOL_CONFIG } from "@/features/wealth/catalog/wealth-catalog";
import {
  buildCalculatorSnapshotDraft,
  calculatorSnapshotTitle,
  canSaveCalculatorToSnapshot,
  getCalculatorAccountIdentifierLabel,
} from "@/features/wealth/lib/calculator-snapshot";
import { appendLocalScenarioTitle, readLocalMoneySnapshot, saveLocalMoneySnapshotDraft } from "@/features/wealth/lib/local-money-snapshot";
import type { WealthToolSlug } from "@/features/wealth/types/wealth-types";
import { buildToolResultViewModel, formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useWealthTool } from "@/features/wealth/hooks/use-wealth-tool";
import { useAuth } from "@/features/auth/context/auth-context";
import { saveWealthScenario } from "@/lib/api/wealth-api";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthToolWorkspaceProps = {
  toolSlug: WealthToolSlug;
  locale: AppLocale;
};

export function WealthToolWorkspace({ toolSlug, locale }: WealthToolWorkspaceProps) {
  const copy = getWealthToolsLanguage(locale);
  const { isAuthenticated } = useAuth();
  const config = WEALTH_TOOL_CONFIG[toolSlug];
  const initialInputs = useMemo(() => {
    return Object.fromEntries(config.fields.map((field) => [field.key, field.defaultValue ?? ""]));
  }, [config.fields]);

  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs);
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const assumptions = useMemo(
    () => ({
      country_code: "BD",
      inflation_rate: inflationRate ? Number(inflationRate) : undefined,
    }),
    [inflationRate],
  );

  const { result, isLoading, isError, refetch } = useWealthTool(toolSlug, inputs, assumptions);

  useEffect(() => {
    setInputs(initialInputs);
  }, [initialInputs, toolSlug]);

  const viewModel = result ? buildToolResultViewModel(result) : null;
  const displayViewModel = localizeEmiViewModel(
    localizeZakatViewModel(viewModel, locale, toolSlug),
    locale,
    toolSlug,
    inputs,
  );
  const productLabel = toolSlug === "emi" ? copy.emi.eyebrow : config.title.split("—")[0]?.trim() ?? config.title;
  const coreFields = config.fields.filter((field) => !isDetailField(field) && field.group !== "tenure");
  const tenureFields = config.fields.filter((field) => field.group === "tenure");
  const detailFields = config.fields.filter((field) => isDetailField(field));
  const showDetailsSection =
    detailFields.length > 0 ||
    config.includeInflationAssumption === true ||
    getCalculatorAccountIdentifierLabel(toolSlug, locale) != null;
  const accountIdentifierLabel = getCalculatorAccountIdentifierLabel(toolSlug, locale);
  const supportsSnapshotSave = canSaveCalculatorToSnapshot(toolSlug);

  async function handleSaveScenario() {
    if (!result) {
      return;
    }
    appendLocalScenarioTitle(config.title);
    if (isAuthenticated) {
      await saveWealthScenario({
        scenario_type: "TOOL",
        slug: toolSlug,
        title: config.title,
        input_json: inputs,
        output_json: result,
      });
    }
  }

  function handleSaveToSnapshot() {
    if (!result) {
      return;
    }
    const draft = buildCalculatorSnapshotDraft({
      toolSlug,
      inputs,
      result,
      accountIdentifier,
    });
    const current = readLocalMoneySnapshot();
    saveLocalMoneySnapshotDraft({
      monthly_savings: draft.monthly_savings ?? current.monthly_savings,
      assets: [...current.assets, ...draft.assets],
      liabilities: [...current.liabilities, ...draft.liabilities],
    });
    appendLocalScenarioTitle(calculatorSnapshotTitle(toolSlug));
    setSaveMessage(toolSlug === "emi" ? copy.emi.saveMessage : copy.common.snapshotDraftSaved);
  }

  return (
    <section className="wealth-tool-workspace">
      <WealthSubNav locale={locale} />

      <header className="wealth-hero-card">
        <p className="eyebrow">{productLabel}</p>
        <h1>
          {toolSlug === "zakat"
            ? copy.zakat.heroTitle
            : toolSlug === "emi"
              ? copy.emi.title
              : config.title}
        </h1>
        <p>
          {toolSlug === "zakat"
            ? copy.zakat.heroDescription
            : toolSlug === "emi"
              ? copy.emi.prompt
              : config.prompt}
        </p>
        {toolSlug === "zakat" ? (
          <>
            <p className="wealth-muted-copy">{copy.zakat.fixedRate}</p>
            <button className="wealth-zakat-guide-trigger" onClick={() => setIsInfoOpen(true)} type="button">
              <span aria-hidden="true">✦</span>
              {copy.zakat.learnMore}
              <span aria-hidden="true">→</span>
            </button>
          </>
        ) : null}
      </header>

      <div className="wealth-tool-layout">
        <section className="wealth-panel wealth-tool-form-panel">
          <div className="wealth-form-grid">
            {coreFields.map((field) => (
              <ToolInputField
                field={field}
                key={field.key}
                locale={locale}
                onChange={(value) => setInputs((current) => ({ ...current, [field.key]: value }))}
                toolSlug={toolSlug}
                value={inputs[field.key] ?? ""}
              />
            ))}
            {tenureFields.length > 0 ? (
              <TenureFieldGroup
                fields={tenureFields}
                inputs={inputs}
                onChange={(key, value) => setInputs((current) => ({ ...current, [key]: value }))}
              />
            ) : null}
          </div>

          {showDetailsSection ? (
            <div className="wealth-projection-section">
              <div className="wealth-form-section-break">
                <span>
                  {toolSlug === "zakat"
                    ? copy.zakat.detailsTitle
                    : toolSlug === "emi"
                      ? copy.common.detailsTitle
                      : config.detailsTitle ?? copy.common.detailsTitle}
                </span>
                <p>
                  {toolSlug === "zakat"
                    ? copy.zakat.detailsHint
                    : toolSlug === "emi"
                      ? copy.emi.detailsHint
                      : config.detailsHint ?? copy.common.detailsHint}
                </p>
              </div>
              <div className="wealth-projection-fields">
                {detailFields.length > 0 ? (
                  <div className="wealth-form-grid">
                    {detailFields.map((field) => (
                      <ToolInputField
                        field={field}
                        key={field.key}
                        locale={locale}
                        onChange={(value) => setInputs((current) => ({ ...current, [field.key]: value }))}
                        toolSlug={toolSlug}
                        value={inputs[field.key] ?? ""}
                      />
                    ))}
                  </div>
                ) : null}
                <WealthProjectionSection
                  accountIdentifier={accountIdentifier}
                  accountIdentifierLabel={accountIdentifierLabel}
                  inflationRate={inflationRate}
                  onAccountIdentifierChange={accountIdentifierLabel ? setAccountIdentifier : undefined}
                  onInflationRateChange={config.includeInflationAssumption ? setInflationRate : undefined}
                  showHeading={false}
                  showInflation={config.includeInflationAssumption === true}
                  locale={locale}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="wealth-panel wealth-result-panel">
          {isLoading ? <p className="wealth-muted-copy">{copy.common.updating}</p> : null}
          {isError ? (
            <div className="wealth-tool-error-state" role="alert">
              <p className="wealth-error-copy">{copy.common.calculationError}</p>
              <button className="wealth-secondary-button" onClick={() => void refetch()} type="button">
                {copy.common.retry}
              </button>
            </div>
          ) : null}
          {displayViewModel ? (
            <>
              <div className="wealth-result-hero">
                <p className="eyebrow">{displayViewModel.headlineLabel}</p>
                <h2>{displayViewModel.headline}</h2>
                {displayViewModel.summary ? <p className="wealth-result-summary">{displayViewModel.summary}</p> : null}
              </div>
              {displayViewModel.timeline.length > 0 ? (
                <div className="wealth-result-outcome-strip">
                  {displayViewModel.timeline.map((point, index) => (
                    <div
                      className={`wealth-result-outcome-point ${index === displayViewModel.timeline.length - 1 ? "wealth-result-outcome-point-highlight" : ""}`}
                      key={point.label}
                    >
                      <span>{point.label}</span>
                      <strong>{point.value}</strong>
                      {point.realValue ? <small>{copy.common.inflationAdjusted}: {point.realValue}</small> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="wealth-metric-grid wealth-supporting-metrics">
                {displayViewModel.metrics.map((metric) => (
                  <MetricCard helper={undefined} key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
              <div className="wealth-insight-grid">
                {displayViewModel.insights.map((insight) => (
                  <WealthInsightCard insight={insight} key={insight.id} />
                ))}
              </div>
              {supportsSnapshotSave ? (
                <WealthSaveSnapshotCard
                  onSave={handleSaveToSnapshot}
                  saveMessage={saveMessage}
                  title={toolSlug === "emi" ? copy.emi.snapshotTitle : `Carry this ${productLabel.toLowerCase()} scenario into your bigger financial picture.`}
                  locale={locale}
                />
              ) : null}
              <p className="wealth-disclaimer">
                {toolSlug === "emi" && locale === "bn" ? copy.emi.disclaimer : displayViewModel.disclaimer}
              </p>
              <WealthNextSteps locale={locale} onSaveScenario={handleSaveScenario} steps={displayViewModel.nextSteps} />
            </>
          ) : null}
        </section>
      </div>
      {toolSlug === "zakat" ? <WealthInfoModal closeLabel={copy.zakat.modal.close} content={copy.zakat.modal} isOpen={isInfoOpen} locale={locale} onClose={() => setIsInfoOpen(false)} /> : null}
    </section>
  );
}

type ToolField = (typeof WEALTH_TOOL_CONFIG)[WealthToolSlug]["fields"][number];

function isDetailField(field: ToolField) {
  return field.group === "details" || field.optional === true;
}

function TenureFieldGroup({
  fields,
  inputs,
  onChange,
}: {
  fields: ToolField[];
  inputs: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const valueField = fields.find((field) => field.key === "tenure_value") ?? fields[0];
  const unitField = fields.find((field) => field.key === "tenure_unit");

  return (
    <label className="wealth-field wealth-tenure-field">
      <span>{valueField.label}</span>
      <div className="wealth-tenure-inputs">
        <input
          inputMode="decimal"
          onChange={(event) => onChange(valueField.key, event.target.value)}
          value={inputs[valueField.key] ?? ""}
        />
        {unitField ? (
          <select onChange={(event) => onChange(unitField.key, event.target.value)} value={inputs[unitField.key] ?? ""}>
            {unitField.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </label>
  );
}

function ToolInputField({
  field,
  locale,
  onChange,
  toolSlug,
  value,
}: {
  field: ToolField;
  locale: AppLocale;
  onChange: (value: string) => void;
  toolSlug: WealthToolSlug;
  value: string;
}) {
  const fieldClassName = field.optional ? "wealth-field wealth-field-optional" : "wealth-field";
  const label =
    toolSlug === "zakat"
      ? getZakatFieldLabel(field.key, locale) ?? field.label
      : toolSlug === "emi"
        ? getEmiFieldLabel(field.key, locale) ?? field.label
        : field.label;

  if (field.type === "select") {
    return (
      <label className={fieldClassName}>
        <span>{label}</span>
        <select onChange={(event) => onChange(event.target.value)} value={value}>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className={fieldClassName}>
      <span>{label}</span>
      <input
        inputMode={field.type === "text" || field.type === "date" ? undefined : "decimal"}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.optional ? getWealthToolsLanguage(locale).common.optional : undefined}
        type={field.type === "date" ? "date" : "text"}
        value={value}
      />
    </label>
  );
}

function getZakatFieldLabel(fieldKey: string, locale: AppLocale) {
  if (locale !== "bn") {
    return undefined;
  }

  const labels: Record<string, string> = {
    cash: "হাতে থাকা ক্যাশ",
    cash_and_bank: "Cash ও bank balance",
    cash_savings: "Cash ও savings",
    gold: "স্বর্ণের মূল্য",
    deductible_liabilities: "শিগগির মেটাতে হবে এমন দায়",
    eligible_assets: "যাকাতের জন্য যোগ্য সম্পদ",
    investments: "যাকাত-যোগ্য investment",
    liabilities: "শিগগির মেটাতে হবে এমন দায়",
    nisab: "Nisab threshold",
    nisab_threshold: "Nisab threshold",
    nisab_amount: "Nisab threshold",
    receivables: "পাওনা টাকা",
  };

  return labels[fieldKey];
}

function getEmiFieldLabel(fieldKey: string, locale: AppLocale) {
  if (locale !== "bn") {
    return undefined;
  }

  const labels: Record<string, string> = {
    principal: getWealthToolsLanguage(locale).emi.principal,
    annual_rate: getWealthToolsLanguage(locale).emi.annualRate,
    tenure_months: getWealthToolsLanguage(locale).emi.tenureMonths,
    loan_start_date: getWealthToolsLanguage(locale).emi.loanStartDate,
    amount_repaid: getWealthToolsLanguage(locale).emi.amountRepaid,
  };

  return labels[fieldKey];
}

function localizeEmiViewModel(
  viewModel: ReturnType<typeof buildToolResultViewModel> | null,
  locale: AppLocale,
  toolSlug: WealthToolSlug,
  inputs: Record<string, string>,
) {
  if (!viewModel || toolSlug !== "emi" || locale !== "bn") {
    return viewModel;
  }

  const copy = getWealthToolsLanguage(locale).emi;
  const principal = formatWealthCurrency(inputs.principal ?? "0");
  const emi = viewModel.headline;
  const months = inputs.tenure_months ?? "0";

  return {
    ...viewModel,
    headlineLabel: copy.headlineLabel,
    summary: copy.summary
      .replace("{principal}", principal)
      .replace("{emi}", emi)
      .replace("{months}", months),
    metrics: viewModel.metrics.map((metric) => ({
      ...metric,
      label: copy.metrics[metric.label] ?? metric.label,
    })),
    timeline: viewModel.timeline.map((point) => ({
      ...point,
      label: localizeEmiTimelineLabel(point.label),
    })),
    insights: viewModel.insights.map((insight) =>
      insight.id === "emi-prepay"
        ? {
            ...insight,
            title: copy.insightPrepayTitle,
            body: copy.insightPrepayBody,
            action_label: copy.comparePrepay,
          }
        : insight,
    ),
    nextSteps: viewModel.nextSteps.map((step) => ({
      ...step,
      label:
        step.href === "/wealth/compare/loan-prepayment-vs-investing"
          ? copy.comparePrepay
          : step.href === "/wealth/snapshot"
            ? copy.addToSnapshot
            : step.label,
    })),
    disclaimer: copy.disclaimer,
  };
}

function localizeEmiTimelineLabel(label: string) {
  if (label.startsWith("Loan starts")) {
    return label.replace("Loan starts", "Loan শুরু");
  }
  if (label.startsWith("Loan paid off")) {
    return label.replace("Loan paid off", "Loan শেষ");
  }
  return label;
}

function localizeZakatViewModel(
  viewModel: ReturnType<typeof buildToolResultViewModel> | null,
  locale: AppLocale,
  toolSlug: WealthToolSlug,
) {
  if (!viewModel || toolSlug !== "zakat" || locale !== "bn") {
    return viewModel;
  }

  const eligibleWealth = viewModel.metrics.find((metric) => metric.label === "Eligible wealth")?.value;
  const labels: Record<string, string> = {
    "Eligible wealth": "যাকাত-যোগ্য সম্পদ",
    "Estimated Zakat": "সম্ভাব্য যাকাত",
    "Nisab threshold": "নিসাব মেটাতে হবে এমন পরিমাণ",
    "Zakat rate": "যাকাত হিসাবের হার",
  };

  return {
    ...viewModel,
    headlineLabel: "সম্ভাব্য যাকাত",
    summary: eligibleWealth ? `আপনার দেওয়া তথ্য অনুযায়ী যাকাত-যোগ্য সম্পদ প্রায় ${eligibleWealth}।` : viewModel.summary,
    timeline: viewModel.timeline.map((point) => ({ ...point, label: labels[point.label] ?? point.label })),
    metrics: viewModel.metrics.map((metric) => ({ ...metric, label: labels[metric.label] ?? metric.label })),
    insights: viewModel.insights.map((insight) =>
      insight.id === "zakat-disclaimer"
        ? {
            ...insight,
            title: "শেখার জন্য একটি অনুমান",
            body: "জটিল সম্পদ, ব্যবসার পণ্য বা সময়ের নিয়মে আলেমের পরামর্শ লাগতে পারে।",
          }
        : insight,
    ),
    disclaimer: "এটি শেখার জন্য একটি হিসাব, চূড়ান্ত ধর্মীয় বা আর্থিক পরামর্শ নয়।",
    nextSteps: viewModel.nextSteps.map((step) => ({
      ...step,
      label:
        step.href === "/wealth/snapshot"
          ? "Money Snapshot-এ gold যোগ করুন"
          : step.href === "/wealth/compare/save-vs-spend"
            ? "সঞ্চয় ও খরচ compare করুন"
            : step.label,
    })),
  };
}
