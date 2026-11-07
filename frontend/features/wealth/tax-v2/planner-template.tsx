import { useId, useRef } from "react";
import { Banknote, CircleMinus, Coins, FileText, Percent, Shield, Sprout, Wallet } from "lucide-react";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { Income, Policy, RulePack, TaxBreakdown, TaxResult, YearSummary } from "./contracts";
import { bdt, translator } from "./fields";
import { hasMoney } from "./facts";
import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";
import { RebateDetails } from "./rebate-details";
import { EligibleInvestments } from "./eligible-investments";
import css from "./tax.module.css";
import { guidanceText } from "./guidance";

function effectiveRate(base: TaxBreakdown, locale: AppLocale) {
  const total = Number(sumMoney([base.ordinary_income, base.special_rate_income]));
  return usableBase(base) && total > 0
    ? new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(Number(base.annual_liability) / total * 100) + "%" : "—";
}

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


export function TaxHero({ locale, identity, base, rules, policies }: { locale: AppLocale; identity?: YearSummary; base?: TaxBreakdown; rules?: RulePack; policies?: Policy[] }) {
  const copy = getWealthToolsLanguage(locale).tax;
  const t = translator(locale);
  const savings = usableBase(base) ? base!.rebate.potential_additional_tax_saving : null;
  return <header className="wealth-tax-hero" data-guide="tax-planner-year">
    <div className="wealth-tax-hero-content">
      <span className="wealth-tax-badge">{identity ? t("Active tax rules · ", "সক্রিয় করের নিয়ম · ") + identity.assessment_year : t("Bangladesh Income Tax", "বাংলাদেশ আয়কর")}</span>
      <h1 id="tax-planner-title">{copy.title}</h1>
      <p className="wealth-tax-hero-subtitle">{copy.hero}</p>
      <ul aria-label={t("Planner benefits", "পরিকল্পকের সুবিধা")} className="wealth-tax-chip-row">{copy.heroChips.map((chip) => <li className="wealth-tax-chip" key={chip}><span aria-hidden="true">✓</span>{chip}</li>)}</ul>
    </div>
    <aside aria-label={t("Savings preview", "সাশ্রয়ের এক নজর")} className="wealth-tax-hero-aside">
      <SavingsJar fillPercent={50} floating />
      <div className={"wealth-tax-savings-card " + css.heroSummary} aria-live="polite">
        <div className={css.heroTax}><FileText className={css.heroMetricIcon} aria-hidden="true" size={19} /><p className="eyebrow">{t("Annual tax", "বার্ষিক কর")}</p><strong>{usableBase(base) ? bdt(base!.annual_liability!, locale) : "—"}</strong><span>{t("After current rebate", "এখনকার রেয়াতের পরে")}</span></div>
        <div className={css.heroSaving}><Sprout className={css.heroMetricIcon} aria-hidden="true" size={19} /><p className="eyebrow">{t("Could still save", "আরও বাঁচতে পারে")}</p><strong>{savings === null ? "—" : bdt(savings, locale)}</strong><span>{t("With more eligible investment", "আরও যোগ্য বিনিয়োগে")}</span></div>
      </div>
      {rules && policies && <EligibleInvestments rules={rules} policies={policies} locale={locale} />}
    </aside>
  </header>;
}

export function TaxSnapshot({ result, locale, conditional = false, rules, presentation, onExploreSavings, state }: { result?: TaxResult; locale: AppLocale; conditional?: boolean; rules?: RulePack; presentation?: EstimatePresentation; onExploreSavings?: () => void; state?: "idle"|"pending"|"unavailable"|"restored" }) {
  const t = translator(locale), base = result?.base;
  const available = usableBase(base);
  const amount = (value: string | null | undefined) => available && value != null ? bdt(value, locale) : "—";
  const total = base ? sumMoney([base.ordinary_income, base.special_rate_income]) : null;
  const rate = base ? effectiveRate(base, locale) : "—";
  return <section className="wealth-tax-snapshot wealth-panel">
    <div className="wealth-tax-snapshot-head"><p className="wealth-tax-section-eyebrow">{t("Tax Snapshot", "Tax Snapshot")}</p><h2>{t("Here’s your current picture", "এখনকার হিসাব এক নজরে")}</h2></div>
    <div className="wealth-tax-story-grid">
      <article className="wealth-tax-story-card wealth-tax-story-pay">
        {result ? <h3 className="wealth-tax-story-label" id="tax-v2-result-title">{t("Estimated annual liability", "আনুমানিক বার্ষিক করদায়")}</h3>
          : <span className="wealth-tax-story-label">{t("Estimated annual liability", "আনুমানিক বার্ষিক করদায়")}</span>}
        <strong>{amount(base?.annual_liability)}</strong>
      </article>
      <article className="wealth-tax-story-card wealth-tax-story-save"><span className="wealth-tax-story-label">{t("You Could Still Save", "আরও বাঁচতে পারে")}</span><strong>{amount(base?.rebate.potential_additional_tax_saving)}</strong></article>
      <article className="wealth-tax-story-card wealth-tax-story-max"><span className="wealth-tax-story-label">{rebateComplete(base) ? base?.annual_liability && !hasMoney(base.annual_liability) ? t("Eligible Investment · No Additional Saving", "যোগ্য বিনিয়োগ · অতিরিক্ত সাশ্রয় নেই") : t("Eligible Investment · Target Met", "যোগ্য বিনিয়োগ · লক্ষ্য পূরণ") : t("Target Eligible Investment", "লক্ষ্যের যোগ্য বিনিয়োগ")}</span><strong>{amount(requiredInvestment(base))}</strong></article>
    </div>
    <div className="wealth-tax-stat-pills" role="list">
      {[
        ["status", t("Estimate status", "হিসাবের অবস্থা"), !result ? t("Enter your facts", "তথ্য দিন") : !available ? t("Review needed", "যাচাই প্রয়োজন") : conditional ? t("Planning assumptions", "পরিকল্পনার ধারণা") : t("Confirmed scope", "নিশ্চিত প্রযোজ্যতা")],
        ["rate", t("Effective annual rate", "কার্যকর বার্ষিক হার"), rate],
        ["income", t("Before allowance", "করমুক্ত সীমার আগে"), amount(total)],
        ["rebate", t("Usable tax reduction", "ব্যবহারযোগ্য কর হ্রাস"), amount(base?.rebate.effective_tax_reduction)],
      ].map(([key, label, value]) => <span className="wealth-tax-stat-pill" role="listitem" key={key}><span className="wealth-tax-stat-pill-label">{label}
        {key === "rate" && <TaxInfoTooltip ariaLabel={t("How effective tax rate is calculated", "কার্যকর করহার কীভাবে হিসাব হয়")}>{t("Annual liability divided by normalized income before the personal threshold. Filing credits and timing adjustments are separate.", "ব্যক্তিগত করমুক্ত সীমার আগের নির্ধারিত আয়ের সঙ্গে বার্ষিক করদায়ের অনুপাত। কর সমন্বয় ও দাখিলকালীন সমন্বয় আলাদা।")}</TaxInfoTooltip>}
        {key === "income" && <TaxInfoTooltip ariaLabel={t("What income before allowance means", "করমুক্ত সীমার আগের আয় কী")}>{t("Income after allowed source exclusions and deductions. The ordinary threshold and separate-rate income follow their own rules.", "উৎসের অনুমোদিত অব্যাহতি ও বিয়োজনের পর আয়। সাধারণ করমুক্ত সীমা ও বিশেষ হারের আয় নিজ নিজ নিয়ম অনুসরণ করে।")}{base && <p>{t("Ordinary income ", "সাধারণ আয় ")}{bdt(base.ordinary_income, locale)}{" · "}{t("Special-rate income ", "বিশেষ হারের আয় ")}{bdt(base.special_rate_income, locale)}</p>}</TaxInfoTooltip>}
        {key === "rebate" && base && <RebateDetails base={base} rules={rules} locale={locale} />}
      </span><strong>{value}</strong></span>)}
    </div>
    {conditional && <p className="wealth-tax-footer-disclaimer">{t("Conditional planning estimate", "শর্তসাপেক্ষ পরিকল্পনার হিসাব")} <TaxInfoTooltip ariaLabel={t("Assumptions behind this estimate", "এই হিসাবের ধারণা")}>
      {t("Unanswered special-case questions are assumed not to apply, and the regular taxpayer minimum is used. Your gross salary example assumes taxable noncash benefits are included. Category amounts assume eligible annual payments, after insurance, PF and donation conditions. These are planning assumptions, not saved confirmations. Explicit answers and category eligibility still apply. Filing balances require verified facts.", "উত্তর না দেওয়া বিশেষ পরিস্থিতি প্রযোজ্য নয় এবং সাধারণ ন্যূনতম কর ধরা হয়েছে। মোট বেতনের নমুনায় করযোগ্য নগদবহির্ভূত সুবিধা অন্তর্ভুক্ত ধরা হয়। শ্রেণির অঙ্কে বীমা, পিএফ ও অনুদানের শর্তের পর যোগ্য বার্ষিক পরিশোধ ধরা হয়। এগুলো পরিকল্পনার ধারণা, সংরক্ষিত নিশ্চয়তা নয়। আপনার দেওয়া উত্তর ও শ্রেণির যোগ্যতা প্রযোজ্য থাকবে। দাখিলের বাকি করের জন্য তথ্য যাচাই আবশ্যক।")}
    </TaxInfoTooltip></p>}
  </section>;
}

const journeySteps = [
  ["gross_salary", ["Gross Income", "মোট আয়"], Banknote, "info"],
  ["employment_income_exemption", ["Excluded Income", "বাদ দেওয়া আয়"], Shield, "positive"],
  ["taxable_salary", ["Income Deductions", "আয় থেকে বিয়োজন"], CircleMinus, "positive"],
  ["income_deductions", ["Income Deductions", "আয় থেকে বিয়োজন"], CircleMinus, "positive"],
  ["total_income", ["Income Before Allowance", "করমুক্ত সীমার আগে আয়"], Coins, "neutral"],
  ["tax_free_allowance", ["Personal Threshold", "ব্যক্তিগত করমুক্ত সীমা"], Shield, "positive"],
  ["taxable_income", ["Ordinary Income Above Threshold", "সীমার বেশি সাধারণ আয়"], Wallet, "warning"],
  ["gross_tax", ["Tax Before Rebate", "রেয়াতের আগে কর"], Percent, "warning"],
  ["rebate", ["Rebate Before Minimum Tax", "ন্যূনতম করের আগে রেয়াত"], Sprout, "positive"],
  ["post_rebate", ["Tax After Rebate", "রেয়াতের পর কর"], Percent, "warning"],
  ["minimum_tax", ["Minimum Tax Top-up", "ন্যূনতম করের জন্য যোগ"], Shield, "warning"],
  ["final_tax", ["Annual Liability", "বার্ষিক করদায়"], FileText, "primary"],
] as const;

function JourneyVisual({ step, amount, base }: { step: typeof journeySteps[number][0]; amount: string; base: TaxBreakdown }) {
  const total = Number(sumMoney(base.income.map((row) => row.entered_amount)));
  const ratio = total > 0 ? Math.min(100, Math.max(0, Number(amount) / total * 100)) : 0;
  if (step === "gross_tax") return <div className="wealth-tax-journey-visual wealth-tax-journey-visual-slabs">
    {[1, 2, 3, 4].map((band) => <span key={band} className={"wealth-tax-journey-slab wealth-tax-journey-slab-" + band} />)}
  </div>;
  if (step === "final_tax") return <div className="wealth-tax-journey-visual wealth-tax-journey-visual-destination"><span className="wealth-tax-journey-destination-doc">🧾</span><span className="wealth-tax-journey-destination-check">✓</span></div>;
  if (step === "tax_free_allowance") return <div className="wealth-tax-journey-visual wealth-tax-journey-visual-shield"><span /></div>;
  if (step === "total_income") return <div className="wealth-tax-journey-visual wealth-tax-journey-visual-income-split"><span style={{ flex: Number(base.ordinary_income) + " 1 0" }} /><span style={{ flex: Number(base.special_rate_income) + " 1 0" }} /></div>;
  const visual = {
    gross_salary: "gross-salary", employment_income_exemption: "exemption",
    taxable_salary: "taxable-salary", income_deductions: "taxable-salary", taxable_income: "taxable", rebate: "rebate", post_rebate: "taxable", minimum_tax: "taxable",
  }[step];
  const width = step === "gross_salary" ? 100 : step === "rebate" ? rebateProgress(base) ?? 0 : ratio;
  return <div className={"wealth-tax-journey-visual wealth-tax-journey-visual-" + visual}><span style={{ width: width + "%" }} /></div>;
}

export function TaxJourney({ result, locale, incomeFacts, rules, onExploreSavings, presentation }: { result: TaxResult; locale: AppLocale; incomeFacts?: Income[]; rules?: RulePack; onExploreSavings?: () => void; presentation?: EstimatePresentation }) {
  const t = translator(locale), base = result.base;
  const flow = useRef<HTMLDivElement>(null);
  if (!usableBase(base)) return null;
  const positiveFacts = incomeFacts?.filter((entry) => hasMoney(entry.amount)) ?? [];
  const salaryOnly = positiveFacts.length > 0 && positiveFacts.every((entry) => entry.kind === "private_employment" && entry.basis === "gross")
    && base.income.filter((entry) => hasMoney(entry.entered_amount)).every((entry) => entry.classification === "ordinary")
    && !base.income_deductions.some((entry) => hasMoney(entry.allowed_amount));
  const exclusions = sumMoney(base.income.map((row) => row.excluded_amount));
  const deductions = sumMoney([...base.income.map((row) => row.deductible_amount), ...base.income_deductions.map((row) => row.allowed_amount)]);
  const amounts: Record<typeof journeySteps[number][0], string | null> = {
    gross_salary: sumMoney(base.income.map((row) => row.entered_amount)),
    employment_income_exemption: salaryOnly ? sumMoney([exclusions, deductions]) : exclusions,
    taxable_salary: base.ordinary_income, income_deductions: deductions,
    total_income: sumMoney([base.ordinary_income, base.special_rate_income]), tax_free_allowance: base.allowance,
    taxable_income: base.ordinary_income_above_allowance, gross_tax: base.gross_tax, rebate: rebateBeforeMinimum(base),
    post_rebate: base.post_rebate_tax, minimum_tax: base.minimum_tax_top_up, final_tax: base.annual_liability,
  };
  const steps = journeySteps.filter(([key]) => {
    if (key === "minimum_tax" || key === "post_rebate") return base.minimum_tax_binding;
    if (salaryOnly) return key !== "total_income" && key !== "income_deductions";
    if (key === "taxable_salary") return false;
    if (key === "employment_income_exemption") return hasMoney(exclusions);
    if (key === "income_deductions") return hasMoney(deductions);
    return true;
  });
  const captions: Record<typeof journeySteps[number][0], string> = {
    gross_salary: t("Receipts for the active income period", "সক্রিয় আয়কালের প্রাপ্তি"),
    employment_income_exemption: salaryOnly ? t("Verified employment exemption and excluded benefits", "যাচাইকৃত চাকরির অব্যাহতি ও বাদ দেওয়া সুবিধা") : t("Exempt and excluded receipts", "করমুক্ত ও বাদ দেওয়া প্রাপ্তি"),
    taxable_salary: t("Salary after employment exemptions", "চাকরির অব্যাহতির পর বেতন"),
    income_deductions: t("Allowed source expenses and income deductions", "অনুমোদিত উৎসের খরচ ও আয় থেকে বিয়োজন"),
    total_income: t("Ordinary and separate-rate income", "সাধারণ ও আলাদা হারের আয়"),
    tax_free_allowance: t("Applied ordinary income threshold", "প্রযোজ্য সাধারণ করমুক্ত সীমা"),
    taxable_income: t("Ordinary income above that threshold", "ওই সীমার বেশি সাধারণ আয়"),
    gross_tax: t("Tax bands and special-rate tax", "করের ধাপ ও বিশেষ হারের কর"),
    rebate: t("Applied before the minimum-tax check", "ন্যূনতম কর যাচাইয়ের আগে প্রয়োগ"),
    post_rebate: t("Before the minimum-tax top-up", "ন্যূনতম কর যোগ করার আগে"),
    minimum_tax: t("Adjustment to the applicable minimum", "প্রযোজ্য ন্যূনতম করে সমন্বয়"),
    final_tax: effectiveRate(base, locale) + t(" of income before allowance", " করমুক্ত সীমার আগের আয়ের"),
  };
  return <section className="wealth-tax-journey-section wealth-panel">
    <header className="wealth-tax-journey-head"><p className="wealth-tax-section-eyebrow">Tax Journey</p><h2>{t("Your tax journey, simplified", "Income থেকে শেষের Tax কীভাবে আসে")}</h2><p className="wealth-tax-journey-subtitle">{t("See how your income becomes your annual tax.", "ধাপে ধাপে দেখুন, আয় থেকে বার্ষিক কর কীভাবে আসে।")}</p></header>
    <div className="wealth-tax-journey-scroll-nav" data-overflow={steps.length > 8}>
      <button type="button" className="wealth-inline-link wealth-tax-link-button" aria-label={t("Previous tax steps", "আগের করের ধাপ")} onClick={() => flow.current?.scrollBy?.({ left: -300, behavior: "smooth" })}>←</button>
      <span>{t("Scroll to explore every step", "সব ধাপ দেখতে পাশে স্ক্রল করুন")}</span>
      <button type="button" className="wealth-inline-link wealth-tax-link-button" aria-label={t("More tax steps", "আরও করের ধাপ")} onClick={() => flow.current?.scrollBy?.({ left: 300, behavior: "smooth" })}>→</button>
    </div>
    <div className="wealth-tax-journey-main"><div className="wealth-tax-journey-flow-wrap" ref={flow} tabIndex={0} role="region" aria-label={t("Tax journey steps", "করের হিসাবের ধাপ")}>
      <div aria-hidden="true" className="wealth-tax-journey-connector" />
      <div className="wealth-tax-journey-flow">{steps.map(([key, label, Icon, tone], index) => <div className="wealth-tax-journey-item" key={key}>
        <article className={`wealth-tax-journey-node wealth-tax-node-${tone} wealth-tax-journey-node-${key}${key === "final_tax" ? " wealth-tax-journey-node-destination" : ""}`}>
          <span className="wealth-tax-journey-icon-wrap" aria-hidden="true"><span className="wealth-tax-journey-icon"><Icon size={22} strokeWidth={2} className="wealth-tax-journey-step-svg" /></span></span>
          <span className="wealth-tax-journey-label">{salaryOnly && key === "gross_salary" ? t("Gross Salary", "মোট বেতন") : salaryOnly && key === "employment_income_exemption" ? t("Employment Exemption", "চাকরির অব্যাহতি") : salaryOnly && key === "taxable_salary" ? t("Taxable Salary", "করযোগ্য বেতন") : t(label[0], label[1])}</span><strong className={`wealth-tax-journey-amount${key === "final_tax" ? " wealth-tax-journey-final-amount" : key === "rebate" ? " wealth-tax-journey-rebate-amount" : ""}`}>{amounts[key] === null ? "—" : bdt(amounts[key]!, locale)}</strong>
          <div className="wealth-tax-journey-visual-slot" aria-hidden="true"><JourneyVisual step={key} amount={amounts[key] ?? "0"} base={base} /></div>
          <p className="wealth-tax-journey-caption">{captions[key]}</p>
          {key === "rebate" && <RebateDetails base={base} rules={rules} locale={locale} />}
        </article>
        {index < steps.length - 1 && <span aria-hidden="true" className="wealth-tax-journey-arrow-node"><span className="wealth-tax-journey-arrow-glow" /><span className="wealth-tax-journey-arrow-icon">→</span></span>}
      </div>)}</div>
    </div>
    <div className="wealth-tax-journey-metrics" role="list">
      {[
        ["income", t("Before Allowance", "করমুক্ত সীমার আগে"), bdt(amounts.total_income!, locale), "💰"],
        ["saved", t("Tax Saved", "কর কমেছে"), base.rebate.effective_tax_reduction === null ? "—" : bdt(base.rebate.effective_tax_reduction, locale), "🎯"],
        ["pay", t("Annual Liability", "বার্ষিক করদায়"), bdt(base.annual_liability!, locale), "🧾"],
        ["rate", t("Effective Tax Rate", "কার্যকর করহার"), effectiveRate(base, locale), "📊"],
      ].map(([key, label, value, icon]) => <article className={"wealth-tax-journey-metric wealth-tax-journey-metric-" + key} role="listitem" key={key}>
        <span className="wealth-tax-journey-metric-icon-wrap" aria-hidden="true"><span className="wealth-tax-journey-metric-icon">{icon}</span></span>
        <div className="wealth-tax-journey-metric-body"><span className="wealth-tax-journey-metric-label">{label}</span><strong>{value}</strong></div>
      </article>)}
    </div></div>
    <div className="wealth-tax-journey-insights-block">
      <p className="wealth-tax-section-eyebrow wealth-tax-journey-insights-eyebrow"><span aria-hidden="true">💡</span> {t("Smart Insights", "কাজের কথা")}</p>
      <div className="wealth-tax-journey-insights-layout"><div className="wealth-tax-journey-insights-grid">
        {[
          ["threshold", "⭐", "positive", t("Your Tax-Free Threshold", "আপনার করমুক্ত সীমা"), t("The applied ordinary threshold is ", "প্রযোজ্য সাধারণ করমুক্ত সীমা ") + bdt(base.allowance, locale) + t(". Special-rate income is handled separately.", "। বিশেষ হারের আয় আলাদাভাবে হিসাব হয়।")],
          ["opportunity", "🎯", "warning", t("Unlock More Savings", "আরও সাশ্রয়ের সুযোগ"), rebateComplete(base) ? t("No further annual tax saving is available under the current facts.", "বর্তমান তথ্য অনুযায়ী আর অতিরিক্ত বার্ষিক করসাশ্রয় নেই।") : base.rebate.additional_eligible_investment_for_lowest_usable_liability !== null && base.rebate.potential_additional_tax_saving !== null ? t("Additional eligible investment ", "আরও যোগ্য বিনিয়োগ ") + bdt(base.rebate.additional_eligible_investment_for_lowest_usable_liability, locale) + t(" can reduce annual tax by ", " বার্ষিক কর কমাতে পারে ") + bdt(base.rebate.potential_additional_tax_saving, locale) : t("Review eligibility before comparing more investment.", "আরও বিনিয়োগ তুলনার আগে যোগ্যতা যাচাই করুন।")],
          ["progress", "🌱", "positive", t("Rebate Progress", "রেয়াতের অগ্রগতি"), rebateComplete(base) ? Number(base.annual_liability) === 0 ? t("No tax saving needed. Your estimated annual tax is zero.", "করসাশ্রয়ের প্রয়োজন নেই। আপনার আনুমানিক বার্ষিক কর শূন্য।") : t("Usable target complete. Further investment does not reduce this annual estimate.", "ব্যবহারযোগ্য লক্ষ্য পূরণ। আরও বিনিয়োগে এই বার্ষিক হিসাবের কর কমছে না।") : rebateProgress(base) === undefined ? t("The usable target needs review.", "ব্যবহারযোগ্য লক্ষ্য যাচাই প্রয়োজন।") : t("Current usable target progress ", "বর্তমান ব্যবহারযোগ্য লক্ষ্যের অগ্রগতি ") + rebateProgress(base) + "%"],
        ].map(([key, icon, tone, title, body]) => <article className={"wealth-tax-journey-insight-card wealth-tax-journey-insight-" + tone} key={key}>
          <span className="wealth-tax-journey-insight-icon-wrap" aria-hidden="true"><span className="wealth-tax-journey-insight-icon">{icon}</span></span>
          <div className="wealth-tax-journey-insight-body"><h3>{title}</h3><p>{body}</p></div>
        </article>)}
      </div><button type="button" className="wealth-tax-journey-cta" onClick={onExploreSavings}>{t("Explore More Savings", "আরও করসাশ্রয়ের সুযোগ দেখুন")}<span aria-hidden="true">→</span></button></div>
    </div>
  </section>;
}
