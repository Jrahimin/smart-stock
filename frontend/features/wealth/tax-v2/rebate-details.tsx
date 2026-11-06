import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { RulePack, TaxBreakdown } from "./contracts";
import { bdt, translator } from "./fields";

function sameAmount(first: string, second: string) {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  };
  return normalize(first) === normalize(second);
}

export function rebateLimitLabels(base: TaxBreakdown, locale: AppLocale) {
  const t = translator(locale);
  if (base.annual_status !== "complete") return [t("Review the facts", "তথ্য যাচাই করুন")];
  const limits = [
    [base.rebate.income_limit, t("Income rule", "আয়ের সীমা")],
    [base.rebate.investment_limit, t("Investment amount", "বিনিয়োগের অঙ্ক")],
    [base.rebate.statutory_cap, t("Statutory cap", "আইনি সর্বোচ্চ সীমা")],
  ];
  const labels = limits.filter(([amount]) => sameAmount(amount, base.rebate.entitlement)).map(([, label]) => label);
  if (base.minimum_tax_binding) labels.push(t("Minimum tax floor", "ন্যূনতম কর"));
  return labels;
}

export function RebateDetails({ base, rules, locale, align = "end" }: {
  base: TaxBreakdown; rules?: RulePack; locale: AppLocale; align?: "start" | "center" | "end";
}) {
  const t = translator(locale), amount = (value: string | null) => value === null ? "—" : bdt(value, locale);
  return <TaxInfoTooltip align={align} ariaLabel={t("How your rebate is calculated", "রেয়াত কীভাবে হিসাব হয়")} panelClassName="wealth-tax-info-popover--wide">
    <p className="wealth-tax-breakdown-title">{t("How your rebate is calculated", "রেয়াত কীভাবে হিসাব হয়")}</p>
    <div className="wealth-tax-breakdown-lines">
      <p className="wealth-tax-breakdown-intro">{t("The backend applies the lowest statutory limit, then checks the usable reduction and minimum tax.", "ব্যাকএন্ডে প্রযোজ্য সর্বনিম্ন আইনি সীমা, ব্যবহারযোগ্য কর হ্রাস ও ন্যূনতম কর যাচাই হয়।")}</p>
      <p><span>{t("Rebate income base", "রেয়াতের আয়ের ভিত্তি")}</span><strong>{amount(base.rebate_income_base)}</strong></p>
      <p><span>{t("Income limit", "আয়ভিত্তিক সীমা")}{rules && " · " + rules.rebate.income_rate + "%"}</span><strong>{amount(base.rebate.income_limit)}</strong></p>
      <p><span>{t("Investment limit", "বিনিয়োগভিত্তিক সীমা")}{rules && " · " + rules.rebate.investment_rate + "%"}</span><strong>{amount(base.rebate.investment_limit)}</strong></p>
      <p><span>{t("Statutory cap", "আইনি সর্বোচ্চ সীমা")}</span><strong>{amount(base.rebate.statutory_cap)}</strong></p>
      <p className="wealth-tax-breakdown-result"><span>{t("Statutory entitlement", "আইনি প্রাপ্য রেয়াত")}</span><strong>{amount(base.rebate.entitlement)}</strong></p>
      <p className="wealth-tax-breakdown-result"><span>{t("Usable tax reduction", "ব্যবহারযোগ্য কর হ্রাস")}</span><strong>{amount(base.rebate.effective_tax_reduction)}</strong></p>
      <p className="wealth-tax-breakdown-limiter"><span>{t("Current limiting rules", "বর্তমান সীমাবদ্ধতার নিয়ম")}</span><strong>{rebateLimitLabels(base, locale).join(" · ")}</strong></p>
    </div>
  </TaxInfoTooltip>;
}

export function RebateLimiterBadge({ base, locale }: { base: TaxBreakdown; locale: AppLocale }) {
  const t = translator(locale);
  return <span className="wealth-tax-play-context-badge wealth-tax-play-context-badge--limiter">
    {t("Limited by ", "সীমা নির্ধারণ করছে ")}{rebateLimitLabels(base, locale).join(" · ")}
  </span>;
}
