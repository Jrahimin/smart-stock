type NullableNumber = string | number | null | undefined;

export function toNumber(value: NullableNumber): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumber(value: NullableNumber, options: Intl.NumberFormatOptions = {}) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...options,
  }).format(parsed);
}

export function formatPercent(value: NullableNumber, options: Intl.NumberFormatOptions = {}) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "N/A";
  }

  const sign = parsed > 0 ? "+" : "";
  return `${sign}${formatNumber(parsed, { maximumFractionDigits: 2, ...options })}%`;
}

export function formatCompactNumber(value: NullableNumber) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(parsed);
}

/**
 * AmarStock MarketCap / PaidUpCap values are stored in million BDT.
 * Convert to absolute BDT before compact formatting so 25143 → 25.1B, not 25.1K.
 */
export function normalizeMarketCapToAbsoluteBdt(value: number) {
  if (value <= 0) {
    return value;
  }

  // Absolute DSE caps are almost always >= 100M BDT. Smaller magnitudes are million-BDT units.
  if (value < 100_000_000) {
    return value * 1_000_000;
  }

  return value;
}

export function formatMarketCapBdt(value: NullableNumber) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "N/A";
  }

  return formatCompactNumber(normalizeMarketCapToAbsoluteBdt(parsed));
}

/** Missing or non-meaningful stored values (null, undefined, zero). */
export function isMissingFinancialValue(value: NullableNumber, options: { allowZero?: boolean } = {}) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return true;
  }

  if (!options.allowZero && parsed === 0) {
    return true;
  }

  return false;
}

export function formatFinancialDisplay(
  value: NullableNumber,
  formatter: (parsed: number) => string,
  options: { allowZero?: boolean; emptyLabel?: string } = {},
) {
  if (isMissingFinancialValue(value, { allowZero: options.allowZero })) {
    return options.emptyLabel ?? "—";
  }

  return formatter(toNumber(value)!);
}

export function formatBdt(value: NullableNumber) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "N/A";
  }

  return `BDT ${formatNumber(parsed, { maximumFractionDigits: 2 })}`;
}

export function formatConfidence(value: NullableNumber) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "N/A";
  }

  const normalized = parsed <= 1 ? parsed * 100 : parsed;
  return `${formatNumber(normalized, { maximumFractionDigits: 0 })}%`;
}
