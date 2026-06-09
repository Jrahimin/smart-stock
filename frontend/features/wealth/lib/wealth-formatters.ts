const EMPTY_VALUE = "—";

type BangladeshNumberOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

export function formatBangladeshNumber(
  value: string | number | null | undefined,
  options: BangladeshNumberOptions = {},
) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_VALUE;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return EMPTY_VALUE;
  }

  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const sign = numericValue < 0 ? "-" : "";
  const absoluteValue = Math.abs(numericValue);
  const fixedValue = absoluteValue.toFixed(maximumFractionDigits);
  const [rawIntegerPart, rawFractionPart = ""] = fixedValue.split(".");
  const fractionPart = rawFractionPart.replace(/0+$/, "");
  const paddedFractionPart = fractionPart.padEnd(minimumFractionDigits, "0");
  const visibleFractionPart = paddedFractionPart ? `.${paddedFractionPart}` : "";

  return `${sign}${groupBangladeshInteger(rawIntegerPart)}${visibleFractionPart}`;
}

export function formatBangladeshCurrency(value: string | number | null | undefined) {
  const formattedNumber = formatBangladeshNumber(value, { maximumFractionDigits: 0 });
  return formattedNumber === EMPTY_VALUE ? EMPTY_VALUE : `BDT ${formattedNumber}`;
}

export function formatBangladeshCurrencyText(text: string | null | undefined) {
  if (!text) {
    return text ?? "";
  }

  return text.replace(/\b(BDT|৳)\s*([0-9][0-9,]*(?:\.\d+)?)/g, (_match, currencyLabel: string, rawValue: string) => {
    const numericValue = Number(rawValue.replace(/,/g, ""));
    if (!Number.isFinite(numericValue)) {
      return `${currencyLabel} ${rawValue}`;
    }
    return `${currencyLabel === "৳" ? "BDT" : currencyLabel} ${formatBangladeshNumber(numericValue, { maximumFractionDigits: 0 })}`;
  });
}

function groupBangladeshInteger(value: string) {
  if (value.length <= 3) {
    return value;
  }

  const lastThreeDigits = value.slice(-3);
  const leadingDigits = value.slice(0, -3);
  const groupedLeadingDigits = leadingDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${groupedLeadingDigits},${lastThreeDigits}`;
}
