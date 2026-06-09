type WealthSourceTaxControlProps = {
  customRate: string;
  onCustomRateChange: (value: string) => void;
  onPresetChange: (value: string) => void;
  preset: string;
};

export function WealthSourceTaxControl({
  preset,
  customRate,
  onPresetChange,
  onCustomRateChange,
}: WealthSourceTaxControlProps) {
  return (
    <div className="wealth-source-tax-control">
      <span>Source tax on interest (%)</span>
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
          Custom
        </button>
      </div>
      {preset === "custom" ? (
        <input inputMode="decimal" onChange={(event) => onCustomRateChange(event.target.value)} value={customRate} />
      ) : null}
      <small>Applied to earned interest only. Principal stays intact.</small>
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
