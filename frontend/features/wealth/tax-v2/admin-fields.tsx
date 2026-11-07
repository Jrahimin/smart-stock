import { createContext, useContext, type ComponentProps } from "react";
import { Input as FieldInput, Select as FieldSelect, Check as FieldCheck, bdt, dateLabel } from "./fields";
export const ReadOnlyRules = createContext(false);
export const RuleFieldErrors = createContext<Record<string,string>>({});
export function useRuleFieldError(path?:string) {
 const errors=useContext(RuleFieldErrors);
 return path ? errors[path] || Object.entries(errors).find(([key])=>key.startsWith(path+"."))?.[1] : undefined;
}
export function Input(props: ComponentProps<typeof FieldInput>) {
 const read = useContext(ReadOnlyRules);
 const error=useRuleFieldError(props.path);
 if (!read) return <div className={error ? "tax-admin-field-error" : undefined}><FieldInput {...props} invalid={!!error} help={[props.help,error].filter(Boolean).join(" · ") || undefined} /></div>;
 const percent = props.label.includes("%");
 const value = !props.value ? props.placeholder || "Not specified" : props.money ? percent ? props.value + "%" : bdt(props.value,"en") : props.type === "date" ? dateLabel(props.value,"en") : props.value;
 return <div data-path={props.path} className="tax-admin-value"><span>{props.label}</span><strong>{value}</strong>{props.help && <small>{props.help}</small>}</div>;
}
export function Select<T extends string>(props: ComponentProps<typeof FieldSelect<T>>) {
 const read = useContext(ReadOnlyRules);
 const error=useRuleFieldError(props.path);
 return read ? <div data-path={props.path} className="tax-admin-value"><span>{props.label}</span><strong>{props.options.find(([key])=>key===props.value)?.[1] ?? props.value}</strong></div> : <div className={error ? "tax-admin-field-error" : undefined}><FieldSelect {...props} invalid={!!error} help={[props.help,error].filter(Boolean).join(" · ") || undefined} /></div>;
}
export function Check(props: ComponentProps<typeof FieldCheck>) {
 const read = useContext(ReadOnlyRules);
 return read ? <div data-path={props.path} className="tax-admin-value"><span>{props.label}</span><strong>{props.checked ? "Visible" : "Hidden"}</strong></div> : <FieldCheck {...props} />;
}
export const adminTabs = ["Overview", "Tax rules", "Investments & rebate", "Filing calendar", "Labels & visibility", "Sources & evidence", "Review & publish"] as const;
export type AdminTab = typeof adminTabs[number];
// Read only explicitly recorded printed-page citations. Never convert an
// evidence PDF page into a page in another document edition.
export function printedPageCitation(provision:string) {
 return provision.match(/(?:printed\s+(?:pages?|pp?\.?)|মুদ্রিত\s+পৃষ্ঠা)\s*[:=]?\s*([\d০-৯][\d০-৯,\s–-]*)/i)?.[1]?.trim() || "Not recorded separately";
}
export function tabForPath(path: string): AdminTab {
 const key = path.replace(/^rules\./, "").split(".")[0];
 if (["thresholds","minimum_tax","taxable_bands","employment_exemption_cap","dividend_rate","listed_gain_exemption","listed_gain_rate","ordinary_turnover_zero_rate_ceiling"].includes(key)) return "Tax rules";
 if (["rebate","dps_cap","government_securities_cap","life_insurance_sum_assured_rate","part2_donation_limit_rate","donation_approvals"].includes(key)) return "Investments & rebate";
 if (key === "filing_windows") return "Filing calendar";
 if (key === "investment_presentation") return "Labels & visibility";
 if (["sources","rule_references"].includes(key)) return "Sources & evidence";
 return "Review & publish";
}

// Translate generic numeric-bound errors only for percentage fields.
export function adminValidationMessage(path:string,message:string) {
 if(/(?:^|\.)(?:rate|[a-z_]+_rate)$/.test(path) && /allowed limit|greater than|less than|between|at most|at least/i.test(message)) {
  const band=path.match(/taxable_bands\.(\d+)\.rate$/);
  return (band ? "Band "+(Number(band[1])+1)+": " : "")+"Enter a rate between 0% and 100%.";
 }
 return message;
}
