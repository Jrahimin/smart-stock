"use client";

import type {
  ScenarioContributionSummary,
  ScenarioViewProjection,
} from "@/features/wealth/view-models/wealth-comparison-view-model";

type WealthComparisonScenarioInputsProps = {
  contributionSummary: ScenarioContributionSummary;
  fieldLabels: Record<string, string>;
  leftInputs: Record<string, string>;
  onLeftChange: (next: Record<string, string>) => void;
  onRightChange: (next: Record<string, string>) => void;
  rightInputs: Record<string, string>;
  viewProjection: ScenarioViewProjection | null;
};

export function WealthComparisonScenarioInputs({
  contributionSummary,
  fieldLabels,
  leftInputs,
  onLeftChange,
  onRightChange,
  rightInputs,
  viewProjection,
}: WealthComparisonScenarioInputsProps) {
  return (
    <section aria-label="Your comparison scenario" className="wealth-comparison-scenario-panel">
      <div className="wealth-comparison-scenario-panel-head">
        <span className="eyebrow">Your scenario</span>
        <span aria-hidden="true" className="wealth-comparison-scenario-panel-sep" />
        <h2>What you&apos;re comparing</h2>
      </div>

      <div className="wealth-comparison-scenario-row">
        <div className="wealth-comparison-scenario-group wealth-comparison-scenario-group-left">
          <div className="wealth-comparison-scenario-fields">
            {leftInputs.monthly_payment != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.monthly_payment ?? "Monthly saving"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, monthly_payment: event.target.value })}
                  value={leftInputs.monthly_payment}
                />
              </label>
            ) : null}
            {leftInputs.principal != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.principal ?? "Amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, principal: event.target.value })}
                  value={leftInputs.principal}
                />
              </label>
            ) : null}
            {leftInputs.amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.amount ?? "Amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, amount: event.target.value })}
                  value={leftInputs.amount}
                />
              </label>
            ) : null}
            {leftInputs.extra_amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.extra_amount ?? "Extra amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, extra_amount: event.target.value })}
                  value={leftInputs.extra_amount}
                />
              </label>
            ) : null}
            {leftInputs.annual_rate != null ? (
              <label className="wealth-comparison-scenario-field wealth-comparison-scenario-field-rate">
                <span>{resolveRateLabel("left", fieldLabels)}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onLeftChange({ ...leftInputs, annual_rate: event.target.value })}
                  value={leftInputs.annual_rate}
                />
              </label>
            ) : null}
            {leftInputs.loan_rate != null ? (
              <label className="wealth-comparison-scenario-field wealth-comparison-scenario-field-rate">
                <span>{fieldLabels.loan_rate ?? "Loan rate (%)"}</span>
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
          vs
        </span>

        <div className="wealth-comparison-scenario-group wealth-comparison-scenario-group-right">
          <div className="wealth-comparison-scenario-fields">
            {rightInputs.principal != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.principal ?? "Amount to lock"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, principal: event.target.value })}
                  value={rightInputs.principal}
                />
              </label>
            ) : null}
            {rightInputs.amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.amount ?? "Amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, amount: event.target.value })}
                  value={rightInputs.amount}
                />
              </label>
            ) : null}
            {rightInputs.extra_amount != null ? (
              <label className="wealth-comparison-scenario-field">
                <span>{fieldLabels.extra_amount ?? "Extra amount"}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => onRightChange({ ...rightInputs, extra_amount: event.target.value })}
                  value={rightInputs.extra_amount}
                />
              </label>
            ) : null}
            {rightInputs.annual_rate != null ? (
              <label className="wealth-comparison-scenario-field wealth-comparison-scenario-field-rate">
                <span>{resolveRateLabel("right", fieldLabels)}</span>
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
              <span className="wealth-comparison-scenario-amount">{contributionSummary.monthly}</span>/mo into DPS vs{" "}
              <span className="wealth-comparison-scenario-amount">{contributionSummary.fdrTotal}</span> locked in FDR
              {contributionSummary.horizon !== "today" ? (
                <>
                  {" "}
                  over <span className="wealth-comparison-scenario-amount">{contributionSummary.horizon}</span>
                </>
              ) : null}
              — same starting capital, two different rhythms.
            </p>
            {viewProjection ? (
              <p className="wealth-comparison-scenario-projection">
                At <span className="wealth-comparison-scenario-amount">{viewProjection.yearLabel}</span>: DPS{" "}
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
                Scrub the timeline below to see how each path grows over time.
              </p>
            )}
          </>
        ) : (
          <p className="wealth-comparison-scenario-setup">
            Simulating over {contributionSummary.horizon} — scrub the journey below to visit any moment in time.
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
