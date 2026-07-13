import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthSourceTaxControlProps = {
  customRate: string;
  onCustomRateChange: (value: string) => void;
  onPresetChange: (value: string) => void;
  preset: string;
  locale?: AppLocale;
};

export function WealthSourceTaxControl({
  preset,
  customRate,
  onPresetChange,
  onCustomRateChange,
  locale,
}: WealthSourceTaxControlProps) {
  const { common } = getWealthToolsLanguage(locale);
  return (
    <div className="wealth-source-tax-control">
      <span>{common.sourceTax}</span>
      <div className="wealth-source-tax-options">
        {["10", "15"].map((option) => (
          <button
            className={preset === option ? "wealth-source-tax-active" : ""}
            key={option}
            onClick={() => onPresetChange(option)}
            type="button"
          >
            {option}%
          </button>
        ))}
        <button
          className={preset === "custom" ? "wealth-source-tax-active" : ""}
          onClick={() => onPresetChange("custom")}
          type="button"
        >
          {common.custom}
        </button>
      </div>
      {preset === "custom" ? (
        <input inputMode="decimal" onChange={(event) => onCustomRateChange(event.target.value)} value={customRate} />
      ) : null}
      <small>{common.sourceTaxHint}</small>
    </div>
  );
}

export function resolveSourceTaxRate(preset: string, customRate: string) {
  if (preset === "custom") {
    const numericValue = Number(customRate);
    return Number.isFinite(numericValue) ? numericValue : 10;
  }
  return preset === "15" ? 15 : 10;
}
