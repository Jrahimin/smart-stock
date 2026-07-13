import { WealthSourceTaxControl } from "@/features/wealth/components/wealth-source-tax-control";
import { WEALTH_TOOL_DETAILS_DEFAULTS } from "@/features/wealth/catalog/wealth-catalog";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

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
  locale?: AppLocale;
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
  locale,
}: WealthProjectionSectionProps) {
  const copy = getWealthToolsLanguage(locale);
  const resolvedTitle =
    locale && title === WEALTH_TOOL_DETAILS_DEFAULTS.title ? copy.common.detailsTitle : title;
  const resolvedHint =
    locale && hint === WEALTH_TOOL_DETAILS_DEFAULTS.hint ? copy.common.detailsHint : hint;
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
          locale={locale}
        />
      ) : null}
      {showInflation && inflationRate != null && onInflationRateChange ? (
        <label className="wealth-field">
          <span>{copy.common.inflationRate}</span>
          <input inputMode="decimal" onChange={(event) => onInflationRateChange(event.target.value)} value={inflationRate} />
        </label>
      ) : null}
      {showAccountIdentifier ? (
        <label className="wealth-field wealth-field-optional">
          <span>{accountIdentifierLabel}</span>
          <input
            onChange={(event) => onAccountIdentifierChange(event.target.value)}
            placeholder={copy.common.optional}
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
        <span>{resolvedTitle}</span>
        {resolvedHint ? <p>{resolvedHint}</p> : null}
      </div>
      <div className="wealth-projection-fields">{fields}</div>
    </div>
  );
}
