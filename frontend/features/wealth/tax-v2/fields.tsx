import { createContext, useContext, useId, type ReactNode } from "react";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { Answer } from "./contracts";
import { normalizeMoneyInput } from "./facts";
import css from "./tax.module.css";
import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";

export type Text = (en: string, bn: string) => string;
export const translator = (locale: AppLocale): Text => (en, bn) => locale === "bn" ? bn : en;
export function bdt(value: string, locale: AppLocale) {
  const [whole, fraction] = value.split(".");
  const format = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD");
  try {
    const tail = fraction && /[1-9]/.test(fraction)
      ? "." + [...fraction].map((digit) => format.format(Number(digit))).join("") : "";
    return (locale === "bn" ? "৳" : "BDT ") + format.format(BigInt(whole)) + tail;
  } catch { return value; }
}
export function dateLabel(value: string, locale: AppLocale) {
  const date = new Date(value.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeZone: "UTC" });
}
export const CompactFieldHelp = createContext(false);

type Shared = { label: string; path?: string; help?: string; disabled?: boolean; tooltip?: ReactNode; tooltipLabel?: string };
type InputProps = Shared & {
  value: string; onChange: (value: string) => void; type?: "text" | "date" | "number";
  money?: boolean; min?: string; max?: string; maxLength?: number; placeholder?: string;
  ariaLabel?: string;
};
export function Input({ label, ariaLabel, path, help, disabled, value, onChange, type = "text", money, min, max, maxLength, placeholder, tooltip, tooltipLabel }: InputProps) {
  const id = useId();
  const compact = useContext(CompactFieldHelp);
  const info = tooltip ?? (compact ? help : undefined);
  const inlineHelp = compact && info ? undefined : help;
  const input = <input id={id + "-input"} type={type} value={value} disabled={disabled} inputMode={money ? "decimal" : undefined}
      min={min} max={max} maxLength={maxLength ?? (money ? 22 : undefined)} placeholder={placeholder}
      aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : id + "-label"} aria-describedby={inlineHelp ? id : undefined} onChange={(event) => onChange(money ? normalizeMoneyInput(event.target.value) : event.target.value)} />;
  if (info) return <div className={css.field} data-path={path}>
    <div className="wealth-field-label-row"><label id={id + "-label"} htmlFor={id + "-input"}>{label}</label><TaxInfoTooltip ariaLabel={tooltipLabel ?? "More about " + label}>{info}</TaxInfoTooltip></div>
    {input}{inlineHelp && <small id={id} className={css.muted}>{inlineHelp}</small>}
  </div>;
  return <label className={css.field} data-path={path}><span id={id + "-label"}>{label}</span>
    {input}
    {help && <small id={id} className={css.muted}>{help}</small>}
  </label>;
}
export function Select<T extends string>({ label, path, help, disabled, value, options, onChange }: Shared & {
  value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void;
}) {
  const id = useId(), compact = useContext(CompactFieldHelp);
  return <div className={css.field} data-path={path}>
    <div className="wealth-field-label-row"><label id={id + "-label"} htmlFor={id + "-input"}>{label}</label>
      {compact && help && <TaxInfoTooltip ariaLabel={"More about " + label}>{help}</TaxInfoTooltip>}</div>
    <select id={id + "-input"} value={value} disabled={disabled} aria-labelledby={id + "-label"} aria-describedby={!compact && help ? id : undefined}
      onChange={(event) => onChange(event.target.value as T)}>
      {options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
    </select>{!compact && help && <small id={id} className={css.muted}>{help}</small>}
  </div>;
}
export function Tri({ t, ...props }: Shared & { t: Text; value: Answer; onChange: (value: Answer) => void }) {
  return <Select {...props} options={[["unknown", t("Not sure", "নিশ্চিত নই")], ["no", t("No", "না")], ["yes", t("Yes", "হ্যাঁ")]]} />;
}
export function Check({ label, path, disabled, checked, onChange }: Shared & { checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={css.check} data-path={path}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
export function Button({ children, onClick, disabled, selected, primary, type = "button", ...rest }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; selected?: boolean; primary?: boolean; type?: "submit" | "button"; "data-guide"?: string;
}) {
  return <button {...rest} className={[css.button, selected ? css.selected : "", primary ? css.primary : ""].join(" ")}
    type={type} aria-pressed={selected} disabled={disabled} onClick={onClick}>{children}</button>;
}
export function Rows({ items }: { items: (readonly [ReactNode, ReactNode])[] }) {
  return <dl className={css.list}>{items.map(([label, value], index) => <div key={index} className={css.line}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

