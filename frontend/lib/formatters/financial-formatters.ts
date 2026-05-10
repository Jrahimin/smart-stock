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
