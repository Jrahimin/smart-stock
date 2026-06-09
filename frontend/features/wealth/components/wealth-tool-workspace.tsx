"use client";

import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/ui/metric-card";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { WealthNextSteps } from "@/features/wealth/components/wealth-next-steps";
import { WealthProjectionSection } from "@/features/wealth/components/wealth-projection-section";
import { WealthSaveSnapshotCard } from "@/features/wealth/components/wealth-save-snapshot-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { WEALTH_DEFAULT_RATES, WEALTH_TOOL_CONFIG, WEALTH_TOOL_DETAILS_DEFAULTS } from "@/features/wealth/catalog/wealth-catalog";
import {
  buildCalculatorSnapshotDraft,
  calculatorSnapshotTitle,
  canSaveCalculatorToSnapshot,
  getCalculatorAccountIdentifierLabel,
} from "@/features/wealth/lib/calculator-snapshot";
import { appendLocalScenarioTitle, readLocalMoneySnapshot, saveLocalMoneySnapshotDraft } from "@/features/wealth/lib/local-money-snapshot";
import type { WealthToolSlug } from "@/features/wealth/types/wealth-types";
import { buildToolResultViewModel } from "@/features/wealth/view-models/wealth-view-model";
import { useWealthTool } from "@/features/wealth/hooks/use-wealth-tool";
import { useAuth } from "@/features/auth/context/auth-context";
import { saveWealthScenario } from "@/lib/api/wealth-api";

type WealthToolWorkspaceProps = {
  toolSlug: WealthToolSlug;
};

export function WealthToolWorkspace({ toolSlug }: WealthToolWorkspaceProps) {
  const { isAuthenticated } = useAuth();
  const config = WEALTH_TOOL_CONFIG[toolSlug];
  const initialInputs = useMemo(() => {
    return Object.fromEntries(config.fields.map((field) => [field.key, field.defaultValue ?? ""]));
  }, [config.fields]);

  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs);
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const assumptions = useMemo(
    () => ({
      country_code: "BD",
      inflation_rate: inflationRate ? Number(inflationRate) : undefined,
    }),
    [inflationRate],
  );

  const { result, isLoading, isError } = useWealthTool(toolSlug, inputs, assumptions);

  useEffect(() => {
    setInputs(initialInputs);
  }, [initialInputs, toolSlug]);

  const viewModel = result ? buildToolResultViewModel(result) : null;
  const productLabel = config.title.split("—")[0]?.trim() ?? config.title;
  const coreFields = config.fields.filter((field) => !isDetailField(field) && field.group !== "tenure");
  const tenureFields = config.fields.filter((field) => field.group === "tenure");
  const detailFields = config.fields.filter((field) => isDetailField(field));
  const showDetailsSection =
    detailFields.length > 0 ||
    config.includeInflationAssumption === true ||
    getCalculatorAccountIdentifierLabel(toolSlug) != null;
  const accountIdentifierLabel = getCalculatorAccountIdentifierLabel(toolSlug);
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
    setSaveMessage("Added to your Money Snapshot draft.");
  }

  return (
    <section className="wealth-tool-workspace">
      <WealthSubNav />

      <header className="wealth-hero-card">
        <p className="eyebrow">{productLabel}</p>
        <h1>{config.title}</h1>
        <p>{config.prompt}</p>
        {toolSlug === "zakat" ? (
          <p className="wealth-muted-copy">
            Zakat rate is fixed at 2.5% on eligible wealth above nisab. Adjust asset values below; rate is not editable.
          </p>
        ) : null}
      </header>

      <div className="wealth-tool-layout">
        <section className="wealth-panel wealth-tool-form-panel">
          <div className="wealth-form-grid">
            {coreFields.map((field) => (
              <ToolInputField
                field={field}
                key={field.key}
                onChange={(value) => setInputs((current) => ({ ...current, [field.key]: value }))}
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
                <span>{config.detailsTitle ?? WEALTH_TOOL_DETAILS_DEFAULTS.title}</span>
                <p>{config.detailsHint ?? WEALTH_TOOL_DETAILS_DEFAULTS.hint}</p>
              </div>
              <div className="wealth-projection-fields">
                {detailFields.length > 0 ? (
                  <div className="wealth-form-grid">
                    {detailFields.map((field) => (
                      <ToolInputField
                        field={field}
                        key={field.key}
                        onChange={(value) => setInputs((current) => ({ ...current, [field.key]: value }))}
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
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="wealth-panel wealth-result-panel">
          {isLoading ? <p className="wealth-muted-copy">Updating your scenario…</p> : null}
          {isError ? <p className="wealth-error-copy">Could not calculate this scenario right now.</p> : null}
          {viewModel ? (
            <>
              <div className="wealth-result-hero">
                <p className="eyebrow">{viewModel.headlineLabel}</p>
                <h2>{viewModel.headline}</h2>
                {viewModel.summary ? <p className="wealth-result-summary">{viewModel.summary}</p> : null}
              </div>
              {viewModel.timeline.length > 0 ? (
                <div className="wealth-result-outcome-strip">
                  {viewModel.timeline.map((point, index) => (
                    <div
                      className={`wealth-result-outcome-point ${index === viewModel.timeline.length - 1 ? "wealth-result-outcome-point-highlight" : ""}`}
                      key={point.label}
                    >
                      <span>{point.label}</span>
                      <strong>{point.value}</strong>
                      {point.realValue ? <small>Inflation-adjusted: {point.realValue}</small> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="wealth-metric-grid wealth-supporting-metrics">
                {viewModel.metrics.map((metric) => (
                  <MetricCard helper={undefined} key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
              <div className="wealth-insight-grid">
                {viewModel.insights.map((insight) => (
                  <WealthInsightCard insight={insight} key={insight.id} />
                ))}
              </div>
              {supportsSnapshotSave ? (
                <WealthSaveSnapshotCard
                  onSave={handleSaveToSnapshot}
                  saveMessage={saveMessage}
                  title={`Carry this ${productLabel.toLowerCase()} scenario into your bigger financial picture.`}
                />
              ) : null}
              <p className="wealth-disclaimer">{viewModel.disclaimer}</p>
              <WealthNextSteps onSaveScenario={handleSaveScenario} steps={viewModel.nextSteps} />
            </>
          ) : null}
        </section>
      </div>
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
  onChange,
  value,
}: {
  field: ToolField;
  onChange: (value: string) => void;
  value: string;
}) {
  const fieldClassName = field.optional ? "wealth-field wealth-field-optional" : "wealth-field";

  if (field.type === "select") {
    return (
      <label className={fieldClassName}>
        <span>{field.label}</span>
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
      <span>{field.label}</span>
      <input
        inputMode={field.type === "text" || field.type === "date" ? undefined : "decimal"}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.optional ? "Optional" : undefined}
        type={field.type === "date" ? "date" : "text"}
        value={value}
      />
    </label>
  );
}
