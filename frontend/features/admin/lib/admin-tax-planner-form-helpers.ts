export type AdminTaxConfigScalars = {
  tax_year_label: string;
  display_name: string;
  disclaimer: string;
  minimum_tax_note: string;
  threshold_general: string | number;
  threshold_woman_or_senior: string | number;
  threshold_person_with_disability: string | number;
  threshold_freedom_fighter: string | number;
  rebate_taxable_income_limit_pct: string | number;
  rebate_investment_pct: string | number;
  rebate_maximum_amount: string | number;
  minimum_tax_national: string | number;
  minimum_tax_dhaka_ctg: string | number;
  minimum_tax_other_city: string | number;
  minimum_tax_rural: string | number;
};

export type AdminTaxSlab = {
  sort_order: number;
  band_amount: string | number | null;
  rate: string | number;
  label: string;
  is_allowance_band: boolean;
};

export type AdminTaxInvestmentCategory = {
  category_key: string;
  display_label: string;
  sort_order: number;
  is_enabled: boolean;
};

/** Human-friendly display without trailing zeros (375000.0000 → 375000). */
export function formatDisplayNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }

  const numeric = Number(trimmed.replace(/,/g, ""));
  if (Number.isNaN(numeric)) {
    return trimmed;
  }

  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return String(parseFloat(numeric.toFixed(4)));
}

export function formatAdminCurrency(value: string | number | null | undefined): string {
  const display = formatDisplayNumber(value);
  if (!display) {
    return "0";
  }

  const numeric = Number(display.replace(/,/g, ""));
  if (Number.isNaN(numeric)) {
    return display;
  }

  return new Intl.NumberFormat("en-US").format(numeric);
}

export function normalizeScalar(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }

  const numeric = Number(trimmed.replace(/,/g, ""));
  if (!Number.isNaN(numeric)) {
    return String(numeric);
  }

  return trimmed;
}

export function coerceNumericPayload(value: string | number | null | undefined): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed.replace(/,/g, ""));
  return Number.isNaN(numeric) ? trimmed : numeric;
}

export function configsEqual(left: AdminTaxConfigScalars, right: AdminTaxConfigScalars): boolean {
  const keys = Object.keys(left) as Array<keyof AdminTaxConfigScalars>;
  return keys.every((key) => normalizeScalar(left[key]) === normalizeScalar(right[key]));
}

export function normalizeSlab(row: AdminTaxSlab): AdminTaxSlab {
  return {
    sort_order: Number(row.sort_order) || 0,
    band_amount:
      row.band_amount === null || row.band_amount === undefined || String(row.band_amount).trim() === ""
        ? null
        : coerceNumericPayload(row.band_amount),
    rate: coerceNumericPayload(row.rate) ?? 0,
    label: row.label.trim(),
    is_allowance_band: row.is_allowance_band,
  };
}

export function slabsEqual(left: AdminTaxSlab[], right: AdminTaxSlab[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((row, index) => {
    const normalizedLeft = normalizeSlab(row);
    const normalizedRight = normalizeSlab(right[index]);
    return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
  });
}

export function isOpenEndedSlab(row: AdminTaxSlab): boolean {
  return row.band_amount === null || row.band_amount === undefined || String(row.band_amount).trim() === "";
}

export function prepareConfigPayload(config: AdminTaxConfigScalars): Record<string, unknown> {
  return {
    tax_year_label: config.tax_year_label.trim(),
    display_name: config.display_name.trim(),
    disclaimer: config.disclaimer.trim(),
    minimum_tax_note: config.minimum_tax_note.trim(),
    threshold_general: coerceNumericPayload(config.threshold_general),
    threshold_woman_or_senior: coerceNumericPayload(config.threshold_woman_or_senior),
    threshold_person_with_disability: coerceNumericPayload(config.threshold_person_with_disability),
    threshold_freedom_fighter: coerceNumericPayload(config.threshold_freedom_fighter),
    rebate_taxable_income_limit_pct: coerceNumericPayload(config.rebate_taxable_income_limit_pct),
    rebate_investment_pct: coerceNumericPayload(config.rebate_investment_pct),
    rebate_maximum_amount: coerceNumericPayload(config.rebate_maximum_amount),
    minimum_tax_national: coerceNumericPayload(config.minimum_tax_national),
    minimum_tax_dhaka_ctg: coerceNumericPayload(config.minimum_tax_dhaka_ctg),
    minimum_tax_other_city: coerceNumericPayload(config.minimum_tax_other_city),
    minimum_tax_rural: coerceNumericPayload(config.minimum_tax_rural),
  };
}
