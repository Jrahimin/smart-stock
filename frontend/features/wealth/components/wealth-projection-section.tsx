import { WealthSourceTaxControl } from "@/features/wealth/components/wealth-source-tax-control";
import { WEALTH_TOOL_DETAILS_DEFAULTS } from "@/features/wealth/catalog/wealth-catalog";

type WealthProjectionSectionProps = {
  accountIdentifier?: string;
  accountIdentifierLabel?: string | null;
  customSourceTax?: string;
  hint?: string;
  inflationRate?: string;
  onAccountIdentifierChange?: (value: string) => void;
  onCustomSourceTaxChange?: (value: string) => void;
  onInflationRateChange?: (value: string) => void;
  onSourceTaxPresetChange?: (value: string) => void;
  showHeading?: boolean;
  showInflation?: boolean;
  showSourceTax?: boolean;
  sourceTaxPreset?: string;
  title?: string;
  compactTop?: boolean;
};

export function WealthProjectionSection({
  title = WEALTH_TOOL_DETAILS_DEFAULTS.title,
  hint = WEALTH_TOOL_DETAILS_DEFAULTS.hint,
  showHeading = true,
  showSourceTax = false,
  showInflation = false,
  sourceTaxPreset,
  customSourceTax,
  onSourceTaxPresetChange,
  onCustomSourceTaxChange,
  inflationRate,
  onInflationRateChange,
  accountIdentifierLabel,
  accountIdentifier = "",
  onAccountIdentifierChange,
  compactTop = false,
}: WealthProjectionSectionProps) {
  const showAccountIdentifier = accountIdentifierLabel != null && onAccountIdentifierChange != null;

  if (!showSourceTax && !showInflation && !showAccountIdentifier) {
    return null;
  }

  const fields = (
    <>
      {showSourceTax && sourceTaxPreset != null && onSourceTaxPresetChange && onCustomSourceTaxChange && customSourceTax != null ? (
        <WealthSourceTaxControl
          customRate={customSourceTax}
          onCustomRateChange={onCustomSourceTaxChange}
          onPresetChange={onSourceTaxPresetChange}
          preset={sourceTaxPreset}
        />
      ) : null}
      {showInflation && inflationRate != null && onInflationRateChange ? (
        <label className="wealth-field">
          <span>Inflation rate (%)</span>
          <input inputMode="decimal" onChange={(event) => onInflationRateChange(event.target.value)} value={inflationRate} />
        </label>
      ) : null}
      {showAccountIdentifier ? (
        <label className="wealth-field wealth-field-optional">
          <span>{accountIdentifierLabel}</span>
          <input
            onChange={(event) => onAccountIdentifierChange(event.target.value)}
            placeholder="Optional"
            value={accountIdentifier}
          />
        </label>
      ) : null}
    </>
  );

  if (!showHeading) {
    return <div className="wealth-projection-fields">{fields}</div>;
  }

  return (
    <div className={`wealth-projection-section${compactTop ? " wealth-projection-section-compact-top" : ""}`}>
      <div className="wealth-form-section-break">
        <span>{title}</span>
        {hint ? <p>{hint}</p> : null}
      </div>
      <div className="wealth-projection-fields">{fields}</div>
    </div>
  );
}
