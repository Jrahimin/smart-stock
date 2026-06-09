/** Mirrors backend `sanchayapatra_config.py` for UI defaults and snapshot behavior. */

export type SanchayapatraCatalogEntry = {
  internalKey: string;
  displayName: string;
  shortLabel: string;
  durationYears: number;
  defaultRate: string;
  profitDistribution: "monthly" | "quarterly" | "yearly" | "maturity";
  payoutFrequencyMonths: number | null;
  defaultSourceTax: string;
  supportedSourceTaxValues: string[];
};

export const SANCHAYAPATRA_CATALOG: Record<string, SanchayapatraCatalogEntry> = {
  "family-savings": {
    internalKey: "family-savings",
    displayName: "Family Savings Certificate",
    shortLabel: "Family",
    durationYears: 5,
    defaultRate: "10.54",
    profitDistribution: "monthly",
    payoutFrequencyMonths: 1,
    defaultSourceTax: "10",
    supportedSourceTaxValues: ["10", "15"],
  },
  "pensioner-savings": {
    internalKey: "pensioner-savings",
    displayName: "Pensioner Savings Certificate",
    shortLabel: "Pensioner",
    durationYears: 5,
    defaultRate: "10.59",
    profitDistribution: "quarterly",
    payoutFrequencyMonths: 3,
    defaultSourceTax: "10",
    supportedSourceTaxValues: ["10", "15"],
  },
  "five-year-bangladesh": {
    internalKey: "five-year-bangladesh",
    displayName: "5-Year Bangladesh Savings Certificate",
    shortLabel: "5-Year BD",
    durationYears: 5,
    defaultRate: "10.44",
    profitDistribution: "maturity",
    payoutFrequencyMonths: null,
    defaultSourceTax: "10",
    supportedSourceTaxValues: ["10", "15"],
  },
  "three-month-profit": {
    internalKey: "three-month-profit",
    displayName: "3-Month Profit Based Savings Certificate",
    shortLabel: "3-Month",
    durationYears: 3,
    defaultRate: "10.48",
    profitDistribution: "quarterly",
    payoutFrequencyMonths: 3,
    defaultSourceTax: "10",
    supportedSourceTaxValues: ["10", "15"],
  },
};

export const SANCHAYAPATRA_CERTIFICATE_OPTIONS = Object.values(SANCHAYAPATRA_CATALOG).map((entry) => ({
  value: entry.internalKey,
  label: entry.displayName,
  shortLabel: entry.shortLabel,
}));

export function getSanchayapatraConfig(certificateType: string | undefined) {
  return SANCHAYAPATRA_CATALOG[certificateType ?? "family-savings"] ?? SANCHAYAPATRA_CATALOG["family-savings"];
}

export function buildSanchayapatraMetadata(certificateType: string) {
  const config = getSanchayapatraConfig(certificateType);
  return {
    certificate_type: config.internalKey,
    interest_rate: config.defaultRate,
    profit_distribution: config.profitDistribution,
    source_tax_preset: config.defaultSourceTax,
    source_tax_rate: config.defaultSourceTax,
  };
}
