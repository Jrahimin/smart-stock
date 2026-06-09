import type { WealthToolCalculateResponse, WealthToolSlug } from "@/features/wealth/types/wealth-types";
import { buildSanchayapatraMetadata } from "@/features/wealth/catalog/sanchayapatra-catalog";

export function getCalculatorAccountIdentifierLabel(toolSlug: string): string | null {
  switch (toolSlug) {
    case "fdr":
      return "FDR account number (optional)";
    case "dps":
      return "DPS account number (optional)";
    case "sanchayapatra":
      return "Certificate / SP number (optional)";
    case "emi":
      return "Loan account number (optional)";
    case "compound-growth":
      return "Portfolio reference (optional)";
    default:
      return null;
  }
}

export function canSaveCalculatorToSnapshot(toolSlug: WealthToolSlug): boolean {
  return ["fdr", "dps", "sanchayapatra", "compound-growth", "emi", "retirement", "savings-goal"].includes(toolSlug);
}

type SnapshotDraftInput = {
  toolSlug: WealthToolSlug;
  inputs: Record<string, string>;
  result: WealthToolCalculateResponse;
  accountIdentifier?: string;
  extras?: {
    sourceTaxPreset?: string;
    customSourceTax?: string;
    tenureYears?: number;
    monthlySaving?: number;
  };
};

export function buildCalculatorSnapshotDraft(input: SnapshotDraftInput) {
  const { toolSlug, inputs, result, accountIdentifier, extras } = input;
  const identifier = accountIdentifier?.trim()
    ? { account_identifier: accountIdentifier.trim() }
    : {};

  switch (toolSlug) {
    case "fdr":
      return {
        assets: [
          {
            category: "DEPOSIT",
            label: "FDR deposit",
            value: Number(inputs.principal) || 0,
            metadata: {
              deposit_type: "fdr",
              interest_rate: inputs.annual_rate,
              tenure_years: extras?.tenureYears,
              profit_distribution: inputs.profit_distribution_type ?? "maturity",
              projected_maturity: Number(result.headline_value) || undefined,
              source_tax_preset: extras?.sourceTaxPreset,
              ...(extras?.sourceTaxPreset === "custom" ? { source_tax_rate: extras?.customSourceTax } : {}),
              ...identifier,
            },
          },
        ],
        liabilities: [],
      };
    case "dps":
      return {
        monthly_savings: extras?.monthlySaving,
        assets: [
          {
            category: "DEPOSIT",
            label: "DPS",
            value: Number(result.headline_value) || 0,
            metadata: {
              deposit_type: "dps",
              interest_rate: inputs.annual_rate,
              projected_maturity: Number(result.headline_value) || undefined,
              source_tax_preset: extras?.sourceTaxPreset,
              ...(extras?.sourceTaxPreset === "custom" ? { source_tax_rate: extras?.customSourceTax } : {}),
              ...identifier,
            },
          },
        ],
        liabilities: [],
      };
    case "sanchayapatra":
      return {
        assets: [
          {
            category: "SANCHAYAPATRA",
            label: String(result.assumptions_used?.display_name ?? "Sanchayapatra"),
            value: Number(inputs.principal) || 0,
            metadata: {
              ...buildSanchayapatraMetadata(inputs.certificate_type ?? "family-savings"),
              ...(inputs.purchase_date ? { purchase_date: inputs.purchase_date } : {}),
              ...(extras?.sourceTaxPreset === "custom"
                ? { source_tax_rate: extras?.customSourceTax }
                : { source_tax_preset: extras?.sourceTaxPreset }),
              ...identifier,
            },
          },
        ],
        liabilities: [],
      };
    case "compound-growth":
      return {
        assets: [
          {
            category: "STOCK",
            label: "Investments",
            value: Number(result.headline_value) || Number(inputs.principal) || 0,
            metadata: {
              interest_rate: inputs.annual_rate,
              monthly_contribution: inputs.monthly_contribution,
              ...identifier,
            },
          },
        ],
        liabilities: [],
      };
    case "emi": {
      const emiMetric = result.metrics.find((metric) => metric.label.toLowerCase().includes("emi"));
      return {
        assets: [],
        liabilities: [
          {
            category: "LOAN",
            label: "Loan",
            balance: Number(inputs.principal) || 0,
            interest_rate: Number(inputs.annual_rate) || undefined,
            monthly_emi: emiMetric?.value != null ? Number(emiMetric.value) : undefined,
            remaining_months: Number(inputs.tenure_months) || undefined,
            metadata: {
              ...(inputs.loan_start_date ? { start_date: inputs.loan_start_date } : {}),
              ...identifier,
            },
          },
        ],
      };
    }
    case "retirement":
    case "savings-goal":
      return {
        monthly_savings: Number(inputs.monthly_contribution) || undefined,
        assets: [],
        liabilities: [],
      };
    default:
      return { assets: [], liabilities: [] };
  }
}

export function calculatorSnapshotTitle(toolSlug: WealthToolSlug): string {
  switch (toolSlug) {
    case "fdr":
      return "FDR — lock money";
    case "dps":
      return "DPS monthly habit";
    case "sanchayapatra":
      return "Government Savings Planner";
    case "compound-growth":
      return "Invest — build future income";
    case "emi":
      return "Loan / EMI";
    case "retirement":
      return "Retirement goal";
    case "savings-goal":
      return "Savings goal";
    default:
      return "Wealth scenario";
  }
}
