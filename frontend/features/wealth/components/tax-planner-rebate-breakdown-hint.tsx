"use client";

import { useMemo } from "react";

import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";
import {
  buildRebateBreakdown,
  formatPct,
  formatPlainAmount,
  getActiveLimiterBadgeLabel,
  getLimitingFactorLabel,
  type RebateBreakdown,
} from "@/features/wealth/lib/tax-planner-rebate-helpers";
import type { TaxPlannerCalculateResponse } from "@/features/wealth/types/tax-planner-types";
import type { TaxPlannerConfigResponse } from "@/features/wealth/types/tax-planner-config-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

type RebateBreakdownHintProps = {
  align?: "center" | "end" | "start";
  result: TaxPlannerCalculateResponse;
  plannerConfig?: TaxPlannerConfigResponse | null;
  /** When true, breakdown reflects maximum available rebate planning limits. */
  planningMode?: boolean;
  /** Full simulator view with current + maximum rebate and limiting factor. */
  simulatorMode?: boolean;
};

function SimulatorBreakdownLines({ breakdown }: { breakdown: RebateBreakdown }) {
  return (
    <div className="wealth-tax-breakdown-lines">
      <p className="wealth-tax-breakdown-intro">
        Your tax rebate is the <strong>lowest</strong> of these three limits. That lowest amount is what
        applies today.
      </p>
      <p>
        <span>Income limit</span>
        <strong>
          {formatPct(breakdown.incomeLimitPct)}% of taxable income ={" "}
          {formatWealthCurrency(breakdown.incomeLimitedRebate)}
        </strong>
      </p>
      <p>
        <span>Investment limit</span>
        <strong>
          {formatPct(breakdown.investmentRebatePct)}% of {formatWealthCurrency(breakdown.currentInvestment)} ={" "}
          {formatWealthCurrency(breakdown.investmentLimitedRebate)}
        </strong>
      </p>
      <p>
        <span>Maximum rebate cap</span>
        <strong>{formatWealthCurrency(breakdown.capLimitedRebate)}</strong>
      </p>
      <p className="wealth-tax-breakdown-result">
        <span>Your current rebate</span>
        <strong>{formatWealthCurrency(breakdown.appliedRebate)}</strong>
      </p>
      <p className="wealth-tax-breakdown-result">
        <span>Maximum you can still reach</span>
        <strong>{formatWealthCurrency(breakdown.maximumAvailableRebate)}</strong>
      </p>
      <p className="wealth-tax-breakdown-limiter">
        <span>What is limiting you</span>
        <strong>{getLimitingFactorLabel(breakdown.appliedLimiter)}</strong>
      </p>
    </div>
  );
}

function BreakdownLines({ breakdown, planningMode }: { breakdown: RebateBreakdown; planningMode: boolean }) {
  const displayRebate = planningMode ? breakdown.maximumAvailableRebate : breakdown.appliedRebate;
  const limiter = planningMode ? breakdown.maxAvailableLimiter : breakdown.appliedLimiter;

  return (
    <div className="wealth-tax-breakdown-lines">
      <p>
        <span>Taxable Income</span>
        <strong>{formatWealthCurrency(breakdown.taxableIncome)}</strong>
      </p>
      <p>
        <span>Income Limit</span>
        <strong>
          {formatPct(breakdown.incomeLimitPct)}% × {formatPlainAmount(breakdown.taxableIncome)} ={" "}
          {formatWealthCurrency(breakdown.incomeLimitedRebate)}
        </strong>
      </p>
      <p>
        <span>Investment Limit</span>
        <strong>
          {formatPct(breakdown.investmentRebatePct)}% × {formatPlainAmount(breakdown.currentInvestment)} ={" "}
          {formatWealthCurrency(breakdown.investmentLimitedRebate)}
        </strong>
      </p>
      <p>
        <span>Maximum Rebate Cap</span>
        <strong>{formatWealthCurrency(breakdown.capLimitedRebate)}</strong>
      </p>
      <p className="wealth-tax-breakdown-result">
        <span>{planningMode ? "Maximum Available Rebate" : "Applied Rebate"}</span>
        <strong>{formatWealthCurrency(displayRebate)}</strong>
      </p>
      <p className="wealth-tax-breakdown-note">Lowest value wins.</p>
      <p className="wealth-tax-breakdown-limiter">
        <span>Active Limiter</span>
        <strong>{getLimitingFactorLabel(limiter)}</strong>
      </p>
    </div>
  );
}

export function RebateBreakdownHint({
  align = "center",
  result,
  plannerConfig,
  planningMode = false,
  simulatorMode = false,
}: RebateBreakdownHintProps) {
  const breakdown = useMemo(() => buildRebateBreakdown(result, plannerConfig), [result, plannerConfig]);

  return (
    <TaxInfoTooltip
      align={align}
      ariaLabel="How your rebate is calculated"
      panelClassName="wealth-tax-info-popover--wide"
    >
      <p className="wealth-tax-breakdown-title">How your rebate is calculated</p>
      {simulatorMode ? (
        <SimulatorBreakdownLines breakdown={breakdown} />
      ) : (
        <BreakdownLines breakdown={breakdown} planningMode={planningMode} />
      )}
    </TaxInfoTooltip>
  );
}

export function RebateLimiterChip({
  result,
  plannerConfig,
  planningMode = false,
}: {
  result: TaxPlannerCalculateResponse;
  plannerConfig?: TaxPlannerConfigResponse | null;
  planningMode?: boolean;
}) {
  const breakdown = useMemo(() => buildRebateBreakdown(result, plannerConfig), [result, plannerConfig]);
  const limiter = planningMode ? breakdown.maxAvailableLimiter : breakdown.appliedLimiter;

  return <span className="wealth-tax-limiter-chip">{getActiveLimiterBadgeLabel(limiter)}</span>;
}

export function ActiveLimiterBadge({
  result,
  plannerConfig,
}: {
  result: TaxPlannerCalculateResponse;
  plannerConfig?: TaxPlannerConfigResponse | null;
}) {
  const breakdown = useMemo(() => buildRebateBreakdown(result, plannerConfig), [result, plannerConfig]);

  return (
    <span className="wealth-tax-play-context-badge wealth-tax-play-context-badge--limiter">
      ⚠ Limited by {getActiveLimiterBadgeLabel(breakdown.appliedLimiter)}
    </span>
  );
}
