import { useId } from "react";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { Income, Policy, RulePack, TaxBreakdown, TaxResult, YearSummary } from "./contracts";
import { bdt, Rows, translator } from "./fields";
import { RuleSources } from "./rule-sources";
import { hasMoney } from "./facts";
import { RebateDetails } from "./rebate-details";
import css from "./tax.module.css";
import { guidanceText } from "./guidance";

/** Display aggregation of amounts already calculated by the backend. */
export function sumMoney(values: string[]) {
  const cents = values.reduce((total, value) => {
    const [whole, fraction = ""] = value.split(".");
    return total + BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  }, BigInt(0));
  return (cents / BigInt(100)).toString() + "." + (cents % BigInt(100)).toString().padStart(2, "0");
}

export function usableBase(base?: TaxBreakdown) {
  return !!base && base.annual_status === "complete" && base.annual_liability !== null;
}

export function rebateProgress(base?: TaxBreakdown) {
  if (!usableBase(base) || !base) return undefined;
  if (rebateComplete(base)) return 100;
  const remaining = base.rebate.additional_eligible_investment_for_lowest_usable_liability;
  if (remaining === null) return undefined;
  const total = Number(base.eligible_investment) + Number(remaining);
  return total > 0 ? Math.min(99, Math.round(Number(base.eligible_investment) / total * 100)) : undefined;
}

export function rebateComplete(base?: TaxBreakdown) {
  return usableBase(base) && base?.rebate.potential_additional_tax_saving !== null
    && base?.rebate.potential_additional_tax_saving !== undefined
    && !hasMoney(base.rebate.potential_additional_tax_saving);
}

export function requiredInvestment(base?: TaxBreakdown) {
  const additional = base?.rebate.additional_eligible_investment_for_lowest_usable_liability;
  if (rebateComplete(base)) return base!.eligible_investment;
  return usableBase(base) && additional !== null && additional !== undefined
    ? sumMoney([base!.eligible_investment, additional]) : null;
}

/** Difference between displayed backend checkpoints, preserving their cent rounding. */
function rebateBeforeMinimum(base: TaxBreakdown) {
  if (base.post_rebate_tax === null) return null;
  const cents = (amount: string) => {
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  };
  const applied = cents(base.gross_tax) - cents(base.post_rebate_tax);
  return (applied / BigInt(100)).toString() + "." + (applied % BigInt(100)).toString().padStart(2, "0");
}

export function SavingsJar({ fillPercent, floating = false }: { fillPercent?: number; floating?: boolean }) {
  const id = useId().replaceAll(":", "");
  const level = Math.min(100, Math.max(0, fillPercent ?? 0));
  const height = Math.max(level * .96, level > 0 ? 6 : 0);
  const y = 150 - height;
  const fill = level === 0 ? "empty" : level < 35 ? "partial" : level < 70 ? "half" : "full";
  return <div aria-hidden="true" className={`wealth-tax-jar wealth-tax-jar-${fillPercent === undefined ? "unavailable" : fill} wealth-tax-jar-compact ${floating ? "wealth-tax-jar-floating" : ""}`}>
    <svg viewBox="0 0 160 190" role="presentation">
      <defs>
        <linearGradient id={id + "money"} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--positive)" stopOpacity=".95" /><stop offset="100%" stopColor="var(--positive)" stopOpacity=".6" /></linearGradient>
        <linearGradient id={id + "glass"} x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="rgb(255 255 255 / 22%)" /><stop offset="100%" stopColor="rgb(255 255 255 / 4%)" /></linearGradient>
        <clipPath id={id + "clip"}><path d="M44 48 L116 48 L116 150 Q116 164 100 164 L60 164 Q44 164 44 150 Z" /></clipPath>
      </defs>
      <ellipse className="wealth-tax-jar-glow" cx="80" cy="170" rx="62" ry="14" />
      <rect height="14" rx="5" ry="5" width="58" x="51" y="22" className="wealth-tax-jar-lid" />
      <path className="wealth-tax-jar-body" d="M40 44 Q40 38 46 38 L114 38 Q120 38 120 44 L120 150 Q120 168 100 168 L60 168 Q40 168 40 150 Z" fill={`url(#${id}glass)`} />
      <g className="wealth-tax-jar-fill" clipPath={`url(#${id}clip)`}>
        <rect className="wealth-tax-jar-fill-rect" fill={`url(#${id}money)`} height={height} width="80" x="40" y={y} />
        {level > 15 && <g className="wealth-tax-jar-notes"><rect fill="rgb(255 255 255 / 35%)" height="6" rx="2" width="40" x="58" y={y + 10} /><rect fill="rgb(255 255 255 / 22%)" height="6" rx="2" width="32" x="62" y={y + 26} /></g>}
      </g>
      <path className="wealth-tax-jar-outline" d="M40 44 Q40 38 46 38 L114 38 Q120 38 120 44 L120 150 Q120 168 100 168 L60 168 Q40 168 40 150 Z" fill="none" />
      {level > 8 && <text className="wealth-tax-jar-symbol" x="80" y={Math.min(150, y + height / 2 + 6)} textAnchor="middle">৳</text>}
    </svg>
    <span className="wealth-tax-jar-spark wealth-tax-jar-spark-1">✦</span><span className="wealth-tax-jar-spark wealth-tax-jar-spark-2">✶</span><span className="wealth-tax-jar-spark wealth-tax-jar-spark-3">✦</span>
  </div>;
}

export type EstimatePresentation = {
  provenance?: "example" | "personal" | "restored";
  freshness?: "current" | "updating" | "last";
  defaults?: string[];
};

export function EstimateState({ locale, provenance = "personal", freshness = "current" }: EstimatePresentation & { locale: AppLocale }) {
  const t = translator(locale);
  return <p className={css.estimateState}>
    {provenance === "example" ? t("Example · based on BDT 900,000 annual salary", "নমুনা · বছরে ৯ লাখ টাকা বেতন ধরে") : provenance === "restored" ? t("Restored estimate", "ফিরিয়ে আনা হিসাব") : t("Your current facts", "আপনার বর্তমান তথ্য")}
    {freshness === "updating" ? t(" · Previous estimate · updating", " · আগের হিসাব · হালনাগাদ হচ্ছে") : freshness === "last" ? t(" · Last calculated", " · শেষ হিসাব করা ফল") : ""}
  </p>;
}

export function TaxHero({ locale, identity }: { locale: AppLocale; identity?: YearSummary; base?: TaxBreakdown; rules?: RulePack; policies?: Policy[] }) {
  const t = translator(locale);
  return <header className={css.plannerHeader} data-guide="tax-planner-year">
    <div><h1 id="tax-planner-title">Tax Planner</h1><p>{identity ? t("Income period: ", "আয়কাল: ") + identity.income_period_start + " — " + identity.income_period_end : t("Estimate annual Tax using the active published rules.", "সক্রিয় প্রকাশিত নিয়মে বার্ষিক করের আনুমানিক হিসাব করুন।")}</p></div>
    {identity && <span className={css.rulesBadge}>{t("Active rules · ", "সক্রিয় নিয়ম · ")}{identity.assessment_year}</span>}
  </header>;
}

export function AssumptionNotes({ result, locale, defaults = [] }: { result: TaxResult; locale: AppLocale; defaults?: string[] }) {
  const t = translator(locale);
  const notes = [
    ...(defaults.some((path) => path.startsWith("coverage.")) ? [t("Unanswered special cases are assumed not to apply.", "উত্তর না দেওয়া বিশেষ পরিস্থিতি প্রযোজ্য নয় ধরা হয়েছে।")] : []),
    ...(defaults.includes("profile.new_taxpayer_floor") ? [t("The regular taxpayer minimum is assumed.", "সাধারণ করদাতার ন্যূনতম কর ধরা হয়েছে।")] : []),
    ...(defaults.some((path) => path.endsWith("benefits_valuation_complete")) ? [t("Unconfirmed salary benefits are assumed included in gross pay.", "অনিশ্চিত বেতন সুবিধা মোট বেতনে অন্তর্ভুক্ত ধরা হয়েছে।")] : []),
    ...result.base.assumptions.map((note) => guidanceText(note, locale)),
  ];
  return notes.length ? <div className={css.assumptionNote}><strong>{t("Assumptions used in this estimate", "এই হিসাবে ব্যবহৃত ধারণা")}</strong><ul>{[...new Set(notes)].map((note) => <li key={note}>{note}</li>)}</ul></div> : null;
}

export function TaxSnapshot({ result, locale, presentation, onExploreSavings, state = "idle" }: { result?: TaxResult; locale: AppLocale; conditional?: boolean; rules?: RulePack; presentation?: EstimatePresentation; onExploreSavings?: () => void; state?: "idle" | "pending" | "unavailable" | "restored" }) {
  const t = translator(locale), base = result?.base;
  const available = usableBase(base);
  const amount = (value: string | null | undefined) => available && value != null ? bdt(value, locale) : "—";
  return <section className={css.annualEstimate} aria-labelledby="tax-v2-result-title">
    <div><h2 id="tax-v2-result-title">{t("Estimated annual Tax", "আনুমানিক বার্ষিক কর")}</h2>
      {result ? <EstimateState locale={locale} {...presentation} /> : <p className={css.estimateState}>{state === "restored" ? t("Restored entries · review before calculating", "ফিরিয়ে আনা তথ্য · হিসাবের আগে যাচাই করুন") : state === "pending" ? t("Calculating estimate…", "হিসাব হচ্ছে…") : state === "unavailable" ? t("Estimate unavailable", "হিসাব পাওয়া যাচ্ছে না") : t("Enter your facts to begin", "শুরু করতে তথ্য দিন")}</p>}
      <strong className={css.primaryAmount}>{amount(base?.annual_liability)}</strong>
      <p>{available ? t("After the Tax reduction already applied", "রেয়াতে কর কমার পরের অঙ্ক") : base?.annual_status === "unsupported" ? t("Unsupported situation · see the affected source below", "এই পরিস্থিতির হিসাব সমর্থিত নয় · নিচে সংশ্লিষ্ট উৎস দেখুন") : !result ? t("No calculated result yet", "এখনও হিসাব করা ফল নেই") : t("Needs information or review", "তথ্য বা যাচাই প্রয়োজন")}</p>
    </div>
    {available && <div className={css.estimateSecondary}>
      <p><span>{t("Tax reduction already applied", "রেয়াতে কর কমেছে")}</span><strong>{amount(base?.rebate.effective_tax_reduction)}</strong></p>
      <p><span>{t("Could save more with eligible Investment", "যোগ্য বিনিয়োগে আরও সাশ্রয় হতে পারে")}</span><strong>{amount(base?.rebate.potential_additional_tax_saving)}</strong></p>
      <button type="button" className={css.optionalAction} onClick={onExploreSavings}>{t("Explore Investment →", "Investment তুলনা করুন →")}</button>
    </div>}
    {available && result && <AssumptionNotes result={result} locale={locale} defaults={presentation?.defaults} />}
  </section>;
}

export function TaxJourney({ result, locale, rules, presentation }: { result: TaxResult; locale: AppLocale; incomeFacts?: Income[]; rules?: RulePack; onExploreSavings?: () => void; presentation?: EstimatePresentation }) {
  const t = translator(locale), base = result.base;
  if (!usableBase(base)) return null;
  const m = (value: string | null) => value == null ? "—" : bdt(value, locale);
  return <section className={css.journey} aria-labelledby="tax-journey-title">
    <header className={css.headingRow}><div><p className={css.muted}>Tax Journey</p><h2 id="tax-journey-title">{t("How your current annual Tax was calculated", "বর্তমান বার্ষিক Tax যেভাবে হিসাব হয়েছে")}</h2><EstimateState locale={locale} {...presentation} /></div><SavingsJar fillPercent={rebateProgress(base)} /></header>
    <div className={css.journeyGroups}>
      <details className={css.journeyGroup} open><summary><span>1 · {t("Income", "আয়")}</span><strong>{m(sumMoney([base.ordinary_income, base.special_rate_income]))}</strong></summary>
        <p className={css.muted}>{t("After source exemptions and allowed deductions, before the personal allowance.", "উৎসের অব্যাহতি ও অনুমোদিত বিয়োজনের পরে, ব্যক্তিগত করমুক্ত সীমার আগে।")}</p>
        {base.income.map((row, i) => <details className={css.detail} key={row.id}><summary>{t("Income source ", "আয়ের উৎস ")}{i + 1}</summary><Rows items={[[t("Receipts entered", "দেওয়া প্রাপ্তি"), m(row.entered_amount)], [t("Excluded", "বাদ"), m(row.excluded_amount)], [t("Allowed deductions", "অনুমোদিত বিয়োজন"), m(row.deductible_amount)], [t("Taxable", "করযোগ্য"), m(row.taxable_amount)]]} /></details>)}
        {base.income_deductions.map((row) => <Rows key={row.id} items={[[t("CZM deduction entered", "দেওয়া CZM বিয়োজন"), m(row.entered_amount)], [t("Allowed", "গ্রহণযোগ্য"), m(row.allowed_amount)]]} />)}
        <Rows items={[[t("Ordinary income", "সাধারণ আয়"), m(base.ordinary_income)], [t("Special-rate income", "বিশেষ হারের আয়"), m(base.special_rate_income)]]} />
      </details>
      <details className={css.journeyGroup}><summary><span>2 · {t("Tax calculation", "করের হিসাব")}</span><strong>{m(base.gross_tax)}</strong></summary>
        <Rows items={[[t("Applied allowance", "প্রযোজ্য করমুক্ত সীমা"), m(base.allowance)], [t("Ordinary income above allowance", "সীমার বেশি সাধারণ আয়"), m(base.ordinary_income_above_allowance)], [t("Ordinary tax", "সাধারণ কর"), m(base.ordinary_tax)], [t("Special-rate tax", "বিশেষ হারের কর"), m(base.special_tax)], [t("Tax before rebate", "রেয়াতের আগে কর"), m(base.gross_tax)]]} />
        <Rows items={base.slabs.map((row) => [row.rate + "% · " + m(row.taxable_amount), m(row.tax)])} />
        <Rows items={[[t("Rebate before minimum-tax check", "ন্যূনতম কর যাচাইয়ের আগে রেয়াত"), m(rebateBeforeMinimum(base))], [t("Tax after rebate", "রেয়াতের পরে কর"), m(base.post_rebate_tax)], [t("Minimum-tax top-up", "ন্যূনতম করের জন্য যোগ"), m(base.minimum_tax_top_up)], [t("Tax reduction actually applied", "রেয়াতে প্রকৃত কর কমেছে"), m(base.rebate.effective_tax_reduction)]]} />
        <RebateDetails base={base} rules={rules} locale={locale} />
        {rules && <RuleSources rules={rules} ruleId="tax.minimum" t={t} />}
      </details>
      <article className={css.journeyFinal}><h3>3 · {t("Final result", "শেষ ফল")}</h3><p>{t("Estimated annual Tax", "আনুমানিক বার্ষিক কর")}</p><strong>{m(base.annual_liability)}</strong><p>{t("Explains your current facts. Additional Investment is compared separately below.", "এটি বর্তমান তথ্যের হিসাব। অতিরিক্ত Investment-এর তুলনা নিচে আলাদা আছে।")}</p></article>
    </div>
  </section>;
}
