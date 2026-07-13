"use client";

import type {
  ScenarioContributionSummary,
  ScenarioViewProjection,
} from "@/features/wealth/view-models/wealth-comparison-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";

type WealthComparisonScenarioInputsProps = {
  contributionSummary: ScenarioContributionSummary;
  fieldLabels: Record<string, string>;
  leftInputs: Record<string, string>;
  onLeftChange: (next: Record<string, string>) => void;
  onRightChange: (next: Record<string, string>) => void;
  rightInputs: Record<string, string>;
  viewProjection: ScenarioViewProjection | null;
  locale: AppLocale;
};

export function WealthComparisonScenarioInputs({
  contributionSummary,
  fieldLabels,
  leftInputs,
  onLeftChange,
  onRightChange,
  rightInputs,
  viewProjection,
  locale,
}: WealthComparisonScenarioInputsProps) {
  const copy = getWealthToolsLanguage(locale).comparison;
  return (
    <section aria-label={copy.scenarioTitle} className="wealth-comparison-scenario-panel">
      <div className="wealth-comparison-scenario-panel-head">
        <span className="eyebrow">{copy.scenarioEyebrow}</span>
        <span aria-hidden="true" className="wealth-comparison-scenario-panel-sep" />
        <h2>{copy.scenarioTitle}</h2>
      </div>

      <div className="wealth-comparison-scenario-row">
        <div className="wealth-comparison-scenario-group wealth-comparison-scenario-group-left">
          <div className="wealth-comparison-scenario-fields">
            {leftInputs.monthly_payment != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "মাসে কত রাখবেন" : fieldLabels.monthly_payment ?? "Monthly saving"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, monthly_payment: event.target.value })}
                  value={leftInputs.monthly_payment}
                />
              </label>
            ) : null}
            {leftInputs.principal != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "কত টাকা" : fieldLabels.principal ?? "Amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, principal: event.target.value })}
                  value={leftInputs.principal}
                />
              </label>
            ) : null}
            {leftInputs.amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "কত টাকা" : fieldLabels.amount ?? "Amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, amount: event.target.value })}
                  value={leftInputs.amount}
                />
              </label>
            ) : null}
            {leftInputs.extra_amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "অতিরিক্ত amount" : fieldLabels.extra_amount ?? "Extra amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, extra_amount: event.target.value })}
                  value={leftInputs.extra_amount}
                />
              </label>
            ) : null}
            {leftInputs.annual_rate != null ? (
              <label className="wealth-comparison-scenario-field wealth-comparison-scenario-field-rate">
                <span>{locale === "bn" ? "DPS rate (%)" : resolveRateLabel("left", fieldLabels)}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, annual_rate: event.target.value })}
                  value={leftInputs.annual_rate}
                />
              </label>
            ) : null}
            {leftInputs.loan_rate != null ? (
              <label className="wealth-comparison-scenario-field wealth-comparison-scenario-field-rate">
                <span>{locale === "bn" ? "Loan rate (%)" : fieldLabels.loan_rate ?? "Loan rate (%)"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, loan_rate: event.target.value })}
                  value={leftInputs.loan_rate}
                />
              </label>
            ) : null}
          </div>
        </div>

        <span aria-hidden="true" className="wealth-comparison-scenario-vs">
          {locale === "bn" ? "vs" : "vs"}
        </span>

        <div className="wealth-comparison-scenario-group wealth-comparison-scenario-group-right">
          <div className="wealth-comparison-scenario-fields">
            {rightInputs.principal != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "FDR-এ কত রাখবেন" : fieldLabels.principal ?? "Amount to lock"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, principal: event.target.value })}
                  value={rightInputs.principal}
                />
              </label>
            ) : null}
            {rightInputs.amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "কত টাকা" : fieldLabels.amount ?? "Amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, amount: event.target.value })}
                  value={rightInputs.amount}
                />
              </label>
            ) : null}
            {rightInputs.extra_amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{locale === "bn" ? "অতিরিক্ত amount" : fieldLabels.extra_amount ?? "Extra amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, extra_amount: event.target.value })}
                  value={rightInputs.extra_amount}
                />
              </label>
            ) : null}
            {rightInputs.annual_rate != null ? (
              <label className="wealth-comparison-scenario-field wealth-comparison-scenario-field-rate">
                <span>{locale === "bn" ? "FDR rate (%)" : resolveRateLabel("right", fieldLabels)}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, annual_rate: event.target.value })}
                  value={rightInputs.annual_rate}
                />
              </label>
            ) : null}
          </div>
        </div>
      </div>

      <div className="wealth-comparison-scenario-horizon-note">
        {contributionSummary.kind === "dps-vs-fdr" ? (
          <>
            <p className="wealth-comparison-scenario-setup">
              <span className="wealth-comparison-scenario-amount">{contributionSummary.monthly}</span>/{locale === "bn" ? "মাসে DPS" : "mo into DPS"} vs{" "}
              <span className="wealth-comparison-scenario-amount">{contributionSummary.fdrTotal}</span> {locale === "bn" ? "FDR-এ রাখা" : "locked in FDR"}
              {contributionSummary.horizon !== "today" ? (
                <>
                  {" "}
                  over <span className="wealth-comparison-scenario-amount">{contributionSummary.horizon}</span>
                </>
              ) : null}
              — {locale === "bn" ? "একই starting capital, দুই রকম পথ।" : "same starting capital, two different rhythms."}
            </p>
            {viewProjection ? (
              <p className="wealth-comparison-scenario-projection">
                {locale === "bn" ? "Year" : "At"} <span className="wealth-comparison-scenario-amount">{viewProjection.yearLabel}</span>: DPS{" "}
                <span className="wealth-comparison-scenario-amount wealth-comparison-scenario-amount-dps">
                  {viewProjection.dpsValue}
                </span>
                <span aria-hidden="true" className="wealth-comparison-scenario-projection-sep">
                  ·
                </span>
                FDR{" "}
                <span className="wealth-comparison-scenario-amount wealth-comparison-scenario-amount-fdr">
                  {viewProjection.fdrValue}
                </span>
              </p>
            ) : (
              <p className="wealth-comparison-scenario-projection">
                {locale === "bn" ? "নিচের timeline টেনে দেখুন, সময়ের সঙ্গে কোন path কীভাবে বাড়ে।" : "Scrub the timeline below to see how each path grows over time."}
              </p>
            )}
          </>
        ) : (
          <p className="wealth-comparison-scenario-setup">
            {locale === "bn" ? `${contributionSummary.horizon} ধরে হিসাব হচ্ছে — নিচের timeline টেনে যেকোনো সময় দেখুন।` : `Simulating over ${contributionSummary.horizon} — scrub the journey below to visit any moment in time.`}
          </p>
        )}
      </div>
    </section>
  );
}

function resolveRateLabel(side: "left" | "right", fieldLabels: Record<string, string>) {
  if (side === "left" && fieldLabels.annual_rate?.toLowerCase().includes("dps")) {
    return "DPS rate (%)";
  }
  if (side === "right" && fieldLabels.principal?.toLowerCase().includes("fdr")) {
    return "FDR rate (%)";
  }
  return fieldLabels.annual_rate ?? "Rate (%)";
}
