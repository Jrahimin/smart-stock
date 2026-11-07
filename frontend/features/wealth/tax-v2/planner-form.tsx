import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { Coverage, Credit, FinancialExpense, Income, Investment, Profile, SelectedYear, TaxBreakdown, TaxResult } from "./contracts";
import { hasMoney, incomeEntry, investmentEntry, quickOther, quickSalary, validMoney, type Facts } from "./facts";
import { bdt, Button, Check, Input, Select, translator, Tri, type Text } from "./fields";
import { RuleSources } from "./rule-sources";
import { rebateComplete, rebateProgress, requiredInvestment, SavingsJar, usableBase } from "./planner-template";
import { sumMoney } from "./planner-template";
import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";
import { RebateDetails, RebateLimiterBadge } from "./rebate-details";
import { InfoDialog } from "./info-dialog";
import css from "./tax.module.css";

export const incomeNames: Record<Income["kind"], [string, string]> = {
  private_employment: ["Private employment", "বেসরকারি চাকরি"], government_employment: ["Government employment", "সরকারি চাকরি"],
  ordinary_other: ["Other ordinary taxable income", "অন্যান্য সাধারণ করযোগ্য আয়"], ordinary_rent: ["Rental income", "ভাড়া থেকে আয়"],
  ordinary_business: ["Business or professional income", "ব্যবসা বা পেশার আয়"], bank_interest: ["Bank interest", "ব্যাংক সুদ"],
  fdr_profit: ["FDR profit", "এফডিআরের মুনাফা"], dps_profit: ["DPS profit", "ডিপিএসের মুনাফা"],
  savings_certificate_profit: ["Savings certificate profit", "সঞ্চয়পত্রের মুনাফা"], domestic_dividend: ["Domestic dividend", "দেশীয় লভ্যাংশ"],
  listed_gain: ["Realized listed capital gains", "তালিকাভুক্ত সম্পদ বিক্রির লাভ"], foreign: ["Foreign or treaty income", "বিদেশি বা চুক্তিভুক্ত আয়"],
  conditional_exemption: ["Income with a conditional exemption", "শর্তসাপেক্ষ অব্যাহতির আয়"], property_gain: ["Property gain", "সম্পত্তি বিক্রির লাভ"],
  precious_metal_gain: ["Precious metal gain", "মূল্যবান ধাতু বিক্রির লাভ"], partnership_or_aop: ["Partnership or association income", "অংশীদারি বা সংঘের আয়"],
  final_tax: ["Income subject to final tax", "চূড়ান্ত করের আওতাধীন আয়"], restricted_tax: ["Income subject to restricted tax credit", "সীমিত কর সমন্বয়ের আয়"],
  unclassified: ["Income that needs classification", "শ্রেণি নির্ধারণ প্রয়োজন এমন আয়"],
};
const incomeOptions = (t: Text) => (Object.keys(incomeNames) as Income["kind"][]).map((key) => [key, t(...incomeNames[key])] as const);
const reviewOnlyIncome = new Set<Income["kind"]>(["foreign", "conditional_exemption", "property_gain", "precious_metal_gain", "partnership_or_aop", "final_tax", "restricted_tax", "unclassified"]);
export const coverageNames: Record<keyof Coverage, [string, string]> = {
  wealth_surcharge: ["Could wealth surcharge apply?", "সম্পদের সারচার্জ প্রযোজ্য হতে পারে?"],
  environmental_surcharge: ["Could environmental surcharge apply?", "পরিবেশ সারচার্জ প্রযোজ্য হতে পারে?"],
  personal_vehicle_advance_tax: ["Is there personal vehicle advance tax?", "ব্যক্তিগত গাড়ির অগ্রিম কর আছে?"],
  commercial_vehicle_or_vessel: ["Does commercial vehicle or vessel income apply?", "বাণিজ্যিক গাড়ি বা নৌযানের আয় আছে?"],
  foreign_or_treaty_income: ["Is there foreign or treaty income?", "বিদেশি বা করচুক্তির আয় আছে?"],
  unresolved_special_income: ["Is there another exemption or special income still to review?", "অন্য কোনো অব্যাহতি বা বিশেষ আয় যাচাই করা বাকি?"],
  losses_or_setoff: ["Are losses or loss offsets claimed?", "ক্ষতি বা ক্ষতির সমন্বয় দাবি করা হচ্ছে?"],
  turnover_or_special_sector: ["Could turnover or special sector tax apply?", "টার্নওভার বা বিশেষ খাতের কর প্রযোজ্য হতে পারে?"],
  prior_rebate_recovery: ["Could an earlier rebate be recovered?", "আগের রেয়াত ফেরত দিতে হতে পারে?"],
  other_part2_donation_claims: ["Are there other Part 2 donation claims?", "দ্বিতীয় অংশের অন্য কোনো অনুদান দাবি আছে?"],
};
const qualifications = {
  woman: ["Woman", "নারী"], disability: ["Person with disability", "প্রতিবন্ধী ব্যক্তি"], third_gender: ["Third gender", "তৃতীয় লিঙ্গ"],
  gazetted_war_wounded_freedom_fighter: ["Gazetted war-wounded freedom fighter", "গেজেটভুক্ত যুদ্ধাহত মুক্তিযোদ্ধা"],
  gazetted_injured_july_2024_warrior: ["Gazetted injured July 2024 warrior", "গেজেটভুক্ত আহত জুলাই ২০২৪ যোদ্ধা"],
} as const;
const coverageHelp: Partial<Record<keyof Coverage, [string, string]>> = {
  wealth_surcharge: ["Check statutory net assets, ownership of multiple qualifying cars, or a large house property under the rules for this year.", "এই করবর্ষের নিয়ম অনুযায়ী ঘোষণাযোগ্য নিট সম্পদ, একাধিক যোগ্য গাড়ির মালিকানা বা বড় গৃহসম্পত্তি আছে কি না যাচাই করুন।"],
  environmental_surcharge: ["Review this if you own multiple qualifying vehicles. Check exclusions and vehicle classes in the official schedule.", "একাধিক যোগ্য গাড়ি থাকলে এটি যাচাই করুন। সরকারি তফসিলে গাড়ির শ্রেণি ও বাদ দেওয়ার নিয়ম দেখুন।"],
  personal_vehicle_advance_tax: ["Review any advance tax paid when registering or renewing a personal vehicle. Its treatment is separate from environmental surcharge.", "ব্যক্তিগত গাড়ির নিবন্ধন বা নবায়নের সময় দেওয়া অগ্রিম কর যাচাই করুন। এর নিয়ম পরিবেশ সারচার্জ থেকে আলাদা।"],
  commercial_vehicle_or_vessel: ["Review tax and credit treatment for income from a commercial vehicle or vessel.", "বাণিজ্যিক গাড়ি বা নৌযানের আয়ে কর ও কর সমন্বয়ের নিয়ম যাচাই করুন।"],
};
/** The untouched annual assumption is a separate choice from explicit uncertainty. */
function PlanningAnswer({ t, defaulted, ...props }: Parameters<typeof Tri>[0] & { defaulted: boolean }) {
  return defaulted && props.value === "unknown" ? <Select {...props} value="" options={[
    ["", t("Unanswered · annual assumption", "উত্তর দেওয়া হয়নি · বার্ষিক ধারণা")],
    ["unknown", t("Not sure", "নিশ্চিত নই")], ["no", t("No", "না")], ["yes", t("Yes", "হ্যাঁ")],
  ]} onChange={(answer) => { if (answer === "unknown" || answer === "no" || answer === "yes") props.onChange(answer); }} /> : <Tri t={t} {...props} />;
}


function Description({ children, label = "More information / বিস্তারিত" }: { children: import("react").ReactNode; label?: string }) {
  return <span className={css.description}><TaxInfoTooltip ariaLabel={label}>{children}</TaxInfoTooltip></span>;
}

type FormProps = { facts: Facts; change: (patch: Partial<Facts>) => void; selected: SelectedYear; locale: AppLocale; focusPath?: string; base?: TaxBreakdown; onEditStep?: (step: number) => void };
const newId = (prefix: string) => prefix + "-" + crypto.randomUUID();
const replaceAt = <T,>(values: T[], i: number, value: T) => values.map((item, index) => index === i ? value : item);
const removeAt = <T,>(values: T[], i: number) => values.filter((_, index) => index !== i);
const isQuickEntry = (item: Income) => (item.id === quickSalary && item.kind === "private_employment" && item.basis === "gross") || (item.id === quickOther && item.kind === "ordinary_other");
export function hasDetailedFacts(facts: Facts) {
  const p = facts.profile;
  return facts.income.some((row) => !isQuickEntry(row) || row.earned_on || (
    row.kind === "private_employment" && (
      hasMoney(row.excluded_group_insurance_benefit) || row.benefits_valuation_complete === "no"
    )
  )) ||
    facts.credits.length > 0 || facts.creditStatus !== "unknown" || !!facts.filing ||
    facts.deductions.length > 0 || facts.investmentMode === "itemized" || facts.investmentMode === "categories" || facts.investments.length > 0 ||
    p.residence !== "resident" || p.entity !== "individual" || p.senior_qualified_for_year !== "no" ||
    p.eligible_disabled_dependents > 0 || p.new_taxpayer_floor === "yes" || p.first_return !== "unknown" ||
    Object.keys(qualifications).some((key) => p[key as keyof typeof qualifications]) ||
    Object.values(facts.coverage).some((answer) => answer === "yes");
}

export function QuickForm({ facts, change, locale, openDetailed, openInvestments, disabled = false }: FormProps & { openDetailed: () => void; openInvestments?: () => void; disabled?: boolean }) {
  const t = translator(locale);
  function setIncome(id: string, kind: "private_employment" | "ordinary_other", amount: string) {
    const current = facts.income.find((item) => item.id === id);
    if (current) {
      change({ income: !amount && !facts.credits.some((credit) => credit.income_id === id)
        ? facts.income.filter((item) => item.id !== id)
        : facts.income.map((item) => item.id === id ? { ...item, amount } : item) });
    } else if (amount) {
      const item = incomeEntry(kind, id, amount);
      change({ income: [...facts.income, item.kind === "ordinary_other"
        ? { ...item, ordinary_treatment_confirmed: "yes" } : item] });
    }
  }
  const existingSalary = facts.income.find(({ id }) => id === quickSalary);
  const existingOther = facts.income.find(({ id }) => id === quickOther);
  const richer = hasDetailedFacts(facts);
  return <div className="wealth-tax-quick">
    <div className="wealth-tax-workspace-head"><h2 id="tax-v2-form-heading" tabIndex={-1}>{t("Three yearly numbers, one quick picture", "তিনটি বার্ষিক তথ্য, এক নজরে হিসাব")}</h2>
      <p className="wealth-muted-copy">{t("Your estimate updates live below as you type.", "তথ্য বদলালেই নিচের হিসাব হালনাগাদ হবে।")}</p></div>
    <div className="wealth-form-grid">
      {(!existingSalary || isQuickEntry(existingSalary)) && <Input money placeholder="0" label={t("Gross private salary, including bonuses", "বোনাসসহ মোট বেসরকারি বেতন")} help={t("Yearly gross salary before tax deductions.", "কর কাটার আগের মোট বার্ষিক বেতন।")} path={existingSalary ? "income." + facts.income.indexOf(existingSalary) + ".amount" : "quick.salary"} value={existingSalary?.amount ?? ""} onChange={(v) => setIncome(quickSalary, "private_employment", v)} />}
      {(!existingOther || isQuickEntry(existingOther)) && <Input money placeholder="0" label={t("Other confirmed ordinary taxable income", "নিশ্চিত অন্যান্য সাধারণ করযোগ্য আয়")} help={t("Use Detailed for separate-rate and special sources.", "আলাদা হার ও বিশেষ উৎসের জন্য বিস্তারিত হিসাব।")} path={existingOther ? "income." + facts.income.indexOf(existingOther) + ".amount" : "quick.other"} value={existingOther?.amount ?? "0"} onChange={(v) => setIncome(quickOther, "ordinary_other", v)} />}
      {facts.investmentMode === "aggregate" && <Aggregate facts={facts} change={change} t={t} />}
      {facts.investmentMode !== "aggregate" && <div className={css.quickInvestmentSummary}><span>{t("Investments from Detailed", "বিস্তারিত অংশের বিনিয়োগ")}</span><strong>{facts.investmentMode === "categories" ? bdt(sumMoney(Object.values(facts.categoryAmounts ?? {}).filter(validMoney)), locale) : facts.investments.every((item) => validMoney(item.amount)) ? bdt(sumMoney(facts.investments.map((item) => item.amount)), locale) : "—"}</strong><button type="button" className={css.optionalAction} onClick={openInvestments ?? openDetailed}>{t("Review category amounts", "শ্রেণির অঙ্ক দেখুন")} ↗</button></div>}
    </div>
    <details className={css.quickAssumptions}><summary>{t("Estimate assumptions", "হিসাবের ধারণা")}</summary>
      <p className="wealth-muted-copy">{richer ? t("Your detailed entries still apply to this estimate. Open Detailed to review or edit them.", "আপনার বিস্তারিত তথ্য এই হিসাবে থাকছে। দেখতে বা বদলাতে বিস্তারিত হিসাব খুলুন।") :
        t("Conditional annual estimate: assumes a resident individual, ordinary income, no special tax rules and the regular taxpayer minimum. It assumes your gross salary includes any taxable noncash benefits. Verify these in Detailed before estimating a filing balance.", "শর্তসাপেক্ষ বার্ষিক হিসাব: নিবাসী ব্যক্তি, সাধারণ আয়, বিশেষ করবিধি নেই এবং সাধারণ ন্যূনতম কর ধরা হয়েছে। মোট বেতনে করযোগ্য নগদবহির্ভূত সুবিধা অন্তর্ভুক্ত বলে ধরা হয়েছে। রিটার্নের বাকি কর হিসাবের আগে বিস্তারিত অংশে যাচাই করুন।")}</p>
    </details>
    <div className={"wealth-tax-quick-foot " + css.quickActions}><button type="button" className={css.detailAction} onClick={openDetailed}><span className={css.readingIcon} aria-hidden="true">◈</span><span>{t("Need more accuracy? Try detailed estimate", "আরও মিলিয়ে দেখতে চান? বিস্তারিত হিসাব ব্যবহার করুন")}</span><span aria-hidden="true">→</span></button><button type="submit" className={css.calculateButton} disabled={disabled}><span aria-hidden="true">✦</span>{t("Calculate estimate", "আনুমানিক হিসাব করুন")}<span aria-hidden="true">→</span></button></div>
  </div>;
}
function Aggregate({ facts, change, t }: Pick<FormProps, "facts" | "change"> & { t: Text }) {
  return <div className={css.stack}>
    <Input money placeholder="0" label={t("Already eligible investment total", "যোগ্য বিনিয়োগের নিশ্চিত মোট")} tooltipLabel={t("More about eligible investments", "যোগ্য বিনিয়োগ সম্পর্কে আরও জানুন")} tooltip={t("For planning, we assume your entered total is eligible after category rules and shared caps for this income period. Use the optional individual verification fields to check insurance, PF and approved donations for filing.", "পরিকল্পনার হিসাবে ধরে নেওয়া হয় আপনার দেওয়া মোট এই আয়কালের শ্রেণিভিত্তিক নিয়ম ও সম্মিলিত সীমার পর যোগ্য। রিটার্নের জন্য ঐচ্ছিক পৃথক যাচাইয়ের ঘরে বীমা, পিএফ ও অনুমোদিত অনুদান যাচাই করা যায়।")} path="investments.amount" value={facts.aggregate} onChange={(aggregate) => change({ aggregate, aggregateConfirmed: true })} />

  </div>;
}
export function ProfileStep({ facts, change, selected, locale, base }: FormProps) {
  const t = translator(locale), p = facts.profile;
  const update = (patch: Partial<Profile>) => change({ profile: { ...p, ...patch }, answeredPaths: [...new Set([...(facts.answeredPaths ?? []), ...Object.keys(patch).map(key=>"profile."+key)])] });
  const allowanceKnown = !!base && p.residence === "resident" && p.entity === "individual"
    && !base.missing_facts.some((note) => note.field_path?.startsWith("profile.")
      && note.field_path !== "profile.new_taxpayer_floor" && note.field_path !== "profile.first_return");
  return <div className={css.stack}>
    <div className={css.headingRow}><h2 id="tax-v2-form-heading" tabIndex={-1}>{t("Profile and coverage", "পরিচয় ও প্রযোজ্যতা")}</h2><Description>{t("Select only applicable qualifications. Senior means qualified for the age 65+ threshold for this income period. The highest applicable threshold is used; category thresholds are not added together. Amounts come from the active rules.", "শুধু প্রযোজ্য যোগ্যতা বেছে নিন। প্রবীণ বলতে এই আয়কালে ৬৫+ বয়সের করমুক্ত সীমার যোগ্য বোঝায়। প্রযোজ্য সর্বোচ্চ সীমাটি নেওয়া হয়; শ্রেণির সীমা যোগ করা হয় না। অঙ্ক সক্রিয় নিয়ম থেকে আসে।")}</Description></div>
    <div className={css.fields}>
      <Select label={t("Tax residence", "কর নিবাস")} path="profile.residence" value={p.residence} onChange={(residence) => update({ residence })} options={[["resident", t("Resident", "নিবাসী")], ["non_resident", t("Non-resident", "অনিবাসী")], ["unknown", t("Not sure", "নিশ্চিত নই")]]} />
      <Select label={t("Taxpayer type", "করদাতার ধরন")} path="profile.entity" value={p.entity} onChange={(entity) => update({ entity })} options={[["individual", t("Individual", "ব্যক্তি")], ["huf", t("Hindu undivided family", "হিন্দু অবিভক্ত পরিবার")], ["company", t("Company", "কোম্পানি")], ["other", t("Other", "অন্যান্য")]]} />
      <PlanningAnswer defaulted={!facts.answeredPaths?.includes("profile.new_taxpayer_floor")} t={t} label={t("Eligible for the new taxpayer minimum?", "নতুন করদাতার ন্যূনতম করের যোগ্য?")} path="profile.new_taxpayer_floor" help={t(
        "Above your applicable tax-free threshold, the new taxpayer minimum is " + bdt(selected.rules.minimum_tax.eligible_new_taxpayer, locale) + " if you meet the statutory conditions; otherwise the ordinary minimum is " + bdt(selected.rules.minimum_tax.ordinary, locale) + ". A new TIN or first use of this planner does not confirm eligibility. Choose Not sure if unverified.",
        "প্রযোজ্য করমুক্ত সীমার ওপরে আইনি শর্ত পূরণ হলে নতুন করদাতার ন্যূনতম কর " + bdt(selected.rules.minimum_tax.eligible_new_taxpayer, locale) + "; অন্যথায় সাধারণ ন্যূনতম কর " + bdt(selected.rules.minimum_tax.ordinary, locale) + "। নতুন টিআইএন বা প্রথমবার এই হিসাব ব্যবহার যোগ্যতা নিশ্চিত করে না। যাচাই না হলে ‘নিশ্চিত নই’ বেছে নিন।"
      )} value={p.new_taxpayer_floor} onChange={(new_taxpayer_floor) => update({ new_taxpayer_floor })} />
      <Input type="number" min="0" max="100" label={t("Eligible disabled dependents", "যোগ্য প্রতিবন্ধী নির্ভরশীলের সংখ্যা")} path="profile.eligible_disabled_dependents" value={String(p.eligible_disabled_dependents)} onChange={(v) => { if (/^\d{0,3}$/.test(v) && Number(v) <= 100) update({ eligible_disabled_dependents: Number(v) }); }} />
      {p.eligible_disabled_dependents > 0 && <Tri t={t} label={t("Confirmed no duplicate dependent claim?", "একই নির্ভরশীলের জন্য দ্বৈত দাবি নেই?")} path="profile.no_duplicate_dependent_claim" value={p.no_duplicate_dependent_claim} onChange={(no_duplicate_dependent_claim) => update({ no_duplicate_dependent_claim })} />}
    </div>
    <div className="wealth-tax-about-stack"><div className="wealth-tax-about-card-grid" role="group" aria-label={t("Special taxpayer categories", "বিশেষ করদাতার শ্রেণি")}>
      {(["woman", "senior", "disability", "gazetted_war_wounded_freedom_fighter", "third_gender", "gazetted_injured_july_2024_warrior"] as const).map((key) => {
        if (key === "senior") return <div key={key} className={css.seniorCard} data-path="profile.senior_qualified_for_year"><button type="button" aria-label={t("Senior Citizen · 65+", "প্রবীণ করদাতা · ৬৫+") + " · " + bdt(selected.rules.thresholds.woman_or_senior, locale)} aria-pressed={p.senior_qualified_for_year === "yes"} className={`wealth-tax-taxpayer-card ${p.senior_qualified_for_year === "yes" ? "wealth-tax-taxpayer-card-active" : ""}`} onClick={() => update({ senior_qualified_for_year: p.senior_qualified_for_year === "yes" ? "no" : "yes" })}>
        <span className="wealth-tax-taxpayer-card-icon-box" aria-hidden="true"><img className="wealth-tax-taxpayer-card-icon" src="/images/wealth/taxpayer-categories/senior.png" alt="" /></span>
        <span className="wealth-tax-taxpayer-card-copy"><span className="wealth-tax-taxpayer-card-title">{t("Senior Citizen · 65+", "প্রবীণ করদাতা · ৬৫+")}</span><span className="wealth-tax-taxpayer-card-subtitle">{bdt(selected.rules.thresholds.woman_or_senior, locale)}</span></span>
        <span className="wealth-tax-taxpayer-card-check" aria-hidden="true">{p.senior_qualified_for_year === "yes" ? "✓" : ""}</span>
      </button></div>;
        const image = key === "woman" ? "woman" : key === "disability" ? "disability" : key === "third_gender" ? null : "freedom-fighter";
        return <button type="button" key={key} aria-label={t(qualifications[key][0], qualifications[key][1])} aria-pressed={p[key]} className={`wealth-tax-taxpayer-card ${p[key] ? "wealth-tax-taxpayer-card-active" : ""}`} data-path={"profile." + key} onClick={() => update({ [key]: !p[key] })}>
          <span className="wealth-tax-taxpayer-card-icon-box" aria-hidden="true">{image ? <img className="wealth-tax-taxpayer-card-icon" src={`/images/wealth/taxpayer-categories/${image}.png`} alt="" /> : "⚧"}</span>
          <span className="wealth-tax-taxpayer-card-copy"><span className="wealth-tax-taxpayer-card-title">{t(qualifications[key][0], qualifications[key][1])}</span><span className="wealth-tax-taxpayer-card-subtitle">{bdt(key === "woman" ? selected.rules.thresholds.woman_or_senior : key === "disability" || key === "third_gender" ? selected.rules.thresholds.disability_or_third_gender : selected.rules.thresholds.gazetted_war_wounded_or_injured_july_warrior, locale)}</span></span>
          <span className="wealth-tax-taxpayer-card-check" aria-hidden="true">{p[key] ? "✓" : ""}</span>
        </button>;
      })}

    </div></div>
    <aside className="wealth-tax-about-allowance-insight" aria-live="polite">
      <p className="wealth-tax-about-allowance-insight-line"><span>{allowanceKnown ? t("✓ Applied profile allowance confirmed", "✓ প্রযোজ্য পরিচিতির করমুক্ত সীমা নিশ্চিত") : t("Review your profile to confirm the allowance", "করমুক্ত সীমা নিশ্চিত করতে পরিচিতি যাচাই করুন")}</span><span className="wealth-tax-about-allowance-insight-sep" aria-hidden="true">·</span><span>{t("Tax-free threshold ", "করমুক্ত সীমা ")}<strong>{allowanceKnown ? bdt(base!.allowance, locale) : "—"}</strong></span></p>
    </aside>
    <div className={css.headingRow}><h3>{t("Special cases", "বিশেষ পরিস্থিতি")}</h3><Description>{t("Check the year's wealth surcharge and vehicle rules against your declared assets and vehicles. Personal vehicle advance tax and environmental surcharge are separate. If a special case applies or you are unsure, the planner will flag it for review.", "ঘোষিত সম্পদ ও গাড়ির তথ্যের সঙ্গে এই করবর্ষের সম্পদ সারচার্জ ও গাড়ির নিয়ম মিলিয়ে দেখুন। ব্যক্তিগত গাড়ির অগ্রিম কর ও পরিবেশ সারচার্জ আলাদা। বিশেষ নিয়ম প্রযোজ্য হলে বা নিশ্চিত না হলে পরিকল্পক তা যাচাই করতে বলবে।")}</Description></div>
    <InfoDialog title={t("Official minimum tax, surcharge and vehicle sources", "ন্যূনতম কর, সারচার্জ ও গাড়ির সরকারি উৎস")} icon="§">
      <div className={css.stack}><RuleSources rules={selected.rules} ruleId="tax.minimum" t={t} /><RuleSources rules={selected.rules} ruleId="scope.wealth_and_vehicle" t={t} /></div>
    </InfoDialog>
    <div className={css.coverageFields}>{(Object.keys(facts.coverage) as (keyof Coverage)[]).filter((key) => key !== "other_part2_donation_claims").map((key) => {
      const help = coverageHelp[key];
      return <PlanningAnswer defaulted={!facts.answeredPaths?.includes("coverage."+key)} key={key} t={t} label={t(...coverageNames[key])} help={help && t(...help)} path={"coverage." + key} value={facts.coverage[key]} onChange={(answer) => change({ coverage: { ...facts.coverage, [key]: answer }, answeredPaths: [...new Set([...(facts.answeredPaths ?? []), "coverage."+key])] })} />;
    })}</div>
  </div>;
}

const expenseNames: Record<FinancialExpense["kind"], [string, string]> = {
  bank_or_finance_charge: ["Bank or finance company charge against interest or profit", "সুদ বা মুনাফার বিপরীতে ব্যাংক বা আর্থিক প্রতিষ্ঠানের চার্জ"],
  borrowing_interest: ["Interest paid on money borrowed solely to earn this income", "শুধু এই আয় অর্জনের জন্য নেওয়া ঋণে পরিশোধিত সুদ"],
  direct_expense: ["Other expense incurred solely and directly to earn this income", "শুধু ও সরাসরি এই আয় অর্জনের জন্য অন্যান্য ব্যয়"],
};

function FinancialExpenses({ entry, update, path, t, selected }: {
  entry: Extract<Income, { eligible_treatment_confirmed: unknown }>; update: (entry: Income) => void;
  path: string; t: Text; selected: SelectedYear;
}) {
  const expenses = entry.expenses ?? [];
  const options = (Object.keys(expenseNames) as FinancialExpense["kind"][])
    .filter((kind) => kind !== "bank_or_finance_charge" || entry.kind !== "domestic_dividend")
    .map((kind) => [kind, t(...expenseNames[kind])] as const);
  const change = (next: FinancialExpense[]) => update({ ...entry, expenses: next });
  return <div className={css.stack} data-path={path + ".expenses"}>
    <Description>{t(
      "Enter only allowable expenses for this income under sections 64–65, once each. Exclude income tax, personal or capital expenses, and other disallowed costs. Enter withholding separately under Credits.",
      "ধারা ৬৪–৬৫ অনুযায়ী এই আয়ের জন্য অনুমোদিত ব্যয় একবার করে দিন। আয়কর, ব্যক্তিগত বা মূলধনি ব্যয় এবং অন্যান্য অননুমোদিত খরচ বাদ দিন। উৎসে কাটা কর আলাদাভাবে কর সমন্বয় অংশে দিন।"
    )}</Description>
    <InfoDialog title={t("Official guidance on financial expenses", "আর্থিক পরিসম্পদের ব্যয়ের সরকারি নির্দেশনা")} icon="§">
      <RuleSources rules={selected.rules} ruleId={entry.kind === "domestic_dividend" ? "income.dividend" : "income.ordinary"} t={t} provision="sections 64 and 65" />
    </InfoDialog>
    {expenses.map((expense, i) => <div className={css.detail + " " + css.stack} key={expense.id}>
      <Select label={t("Expense type", "ব্যয়ের ধরন")} path={path + ".expenses." + i + ".kind"} options={options} value={expense.kind} onChange={(kind) => change(replaceAt(expenses, i, { ...expense, kind, qualification: "unknown" }))} />
      <Input money label={t("Expense amount", "ব্যয়ের অঙ্ক")} path={path + ".expenses." + i + ".amount"} value={expense.amount} onChange={(amount) => change(replaceAt(expenses, i, { ...expense, amount }))} />
      {expense.qualification === "unknown" && <p className={css.creditNote}>{t("Confirm deductibility for this expense type. Changing the type requires confirmation again.", "এই ব্যয়ের ধরনের বিয়োজনযোগ্যতা নিশ্চিত করুন। ধরন বদলালে আবার নিশ্চিত করতে হবে।")}</p>}
      <Tri t={t} label={t("Deductible for this source under sections 64–65?", "ধারা ৬৪–৬৫ অনুযায়ী এই উৎস থেকে বিয়োজনযোগ্য?")} path={path + ".expenses." + i + ".qualification"} value={expense.qualification} onChange={(qualification) => change(replaceAt(expenses, i, { ...expense, qualification }))} />
      <Button onClick={() => change(removeAt(expenses, i))}>{t("Remove expense", "ব্যয় সরান")}</Button>
    </div>)}
    <Button disabled={expenses.length >= 12} onClick={() => change([...expenses, { id: newId("expense"), kind: options[0][0], amount: "", qualification: "unknown" }])}>{t("Add financial expense", "আর্থিক ব্যয় যোগ করুন")}</Button>
  </div>;
}

function IncomeFields({ entry, update, path, t, selected }: { entry: Income; update: (entry: Income) => void; path: string; t: Text; selected: SelectedYear }) {
  const common = { t };
  return <div className={css.fields}>
    <Input money label={entry.basis === "gross" ? t("Gross amount before withholding", "উৎসে কর কাটার আগের মোট") : t("Already taxable amount", "আগে হিসাব করা করযোগ্য আয়")} path={path + ".amount"} value={entry.amount} onChange={(amount) => update({ ...entry, amount })} />
    <Input type="date" label={t("Income date (optional for annual totals)", "আয়ের তারিখ (বার্ষিক মোটে ঐচ্ছিক)")} path={path + ".earned_on"} min={selected.identity.income_period_start} max={selected.identity.income_period_end} value={entry.earned_on ?? ""} onChange={(v) => update({ ...entry, earned_on: v || null })} />
    {entry.kind === "private_employment" && <>
      <Select label={t("Salary basis", "বেতনের ভিত্তি")} path={path + ".basis"} value={entry.basis} options={[["gross", t("Gross, including bonuses", "বোনাসসহ মোট")], ["precomputed_taxable", t("Already taxable", "আগে হিসাব করা করযোগ্য")]]} onChange={(basis) => update({ ...entry, basis, excluded_group_insurance_benefit: basis === "gross" ? entry.excluded_group_insurance_benefit : "0" })} />
      {entry.basis === "gross" && <>
        <Input money label={t("Verified exempt group insurance included above", "উপরের মোটে থাকা যাচাইকৃত করমুক্ত গ্রুপ বীমা")} path={path + ".excluded_group_insurance_benefit"} value={entry.excluded_group_insurance_benefit} onChange={(excluded_group_insurance_benefit) => update({ ...entry, excluded_group_insurance_benefit: excluded_group_insurance_benefit || "0" })} />
        <Tri {...common} label={t("All noncash employment benefits valued?", "চাকরির নগদবহির্ভূত সুবিধার মূল্য নির্ধারণ হয়েছে?")} path={path + ".benefits_valuation_complete"} value={entry.benefits_valuation_complete} onChange={(benefits_valuation_complete) => update({ ...entry, benefits_valuation_complete })} />
      </>}
    </>}
    {"ordinary_treatment_confirmed" in entry && <Tri {...common} label={t("Ordinary treatment and taxable amount confirmed?", "সাধারণ করের নিয়ম ও করযোগ্য অঙ্ক নিশ্চিত?")} path={path + ".ordinary_treatment_confirmed"} value={entry.ordinary_treatment_confirmed} onChange={(ordinary_treatment_confirmed) => update({ ...entry, ordinary_treatment_confirmed })} />}
    {entry.kind === "ordinary_business" && <>
      <Input money label={t("Gross receipts before business deductions", "ব্যবসার খরচ বাদ দেওয়ার আগের মোট প্রাপ্তি")} path={path + ".gross_receipts"} value={entry.gross_receipts ?? ""} onChange={(v) => update({ ...entry, gross_receipts: v || null })} />
      <Select label={t("Business regime", "ব্যবসার করের ধরন")} path={path + ".business_type"} value={entry.business_type} onChange={(business_type) => update({ ...entry, business_type })} options={[["unknown", t("Not sure", "নিশ্চিত নই")], ["ordinary", t("Ordinary", "সাধারণ")], ["special_sector", t("Special sector", "বিশেষ খাত")]]} />
    </>}
    {"eligible_treatment_confirmed" in entry && <>
      <Tri {...common} label={t("Gross income and tax treatment confirmed?", "মোট আয় ও করের নিয়ম নিশ্চিত?")} path={path + ".eligible_treatment_confirmed"} value={entry.eligible_treatment_confirmed} onChange={(eligible_treatment_confirmed) => update({ ...entry, eligible_treatment_confirmed })} />
      <FinancialExpenses entry={entry} update={update} path={path} t={t} selected={selected} />
    </>}
    {entry.kind === "listed_gain" && <>
      <Select label={t("Instrument sold", "বিক্রি করা সম্পদ")} path={path + ".instrument"} value={entry.instrument} options={[["unknown", t("Not sure", "নিশ্চিত নই")], ["listed_share", t("Listed share", "তালিকাভুক্ত শেয়ার")], ["eligible_listed_fund", t("Eligible listed fund", "যোগ্য তালিকাভুক্ত ফান্ড")], ["other", t("Other", "অন্যান্য")]]} onChange={(instrument) => update({ ...entry, instrument })} />
      <Tri {...common} label={t("Gain realized through a sale?", "বিক্রির মাধ্যমে লাভ হয়েছে?")} path={path + ".realized"} value={entry.realized} onChange={(realized) => update({ ...entry, realized })} />
      <Tri {...common} label={t("Qualifying disposal confirmed?", "বিক্রির যোগ্যতা নিশ্চিত?")} path={path + ".qualifying_disposal_confirmed"} value={entry.qualifying_disposal_confirmed} onChange={(qualifying_disposal_confirmed) => update({ ...entry, qualifying_disposal_confirmed })} />
      <Tri {...common} label={t("Sponsor, director or placement holder?", "স্পনসর, পরিচালক বা প্লেসমেন্টধারী?")} path={path + ".sponsor_director_or_placement_holder"} value={entry.sponsor_director_or_placement_holder} onChange={(sponsor_director_or_placement_holder) => update({ ...entry, sponsor_director_or_placement_holder })} />
      {entry.instrument === "eligible_listed_fund" && <Tri {...common} label={t("Special rate on gains above the exemption verified?", "করমুক্ত সীমার বেশি লাভের বিশেষ হার যাচাই করা হয়েছে?")} path={path + ".fund_excess_special_rate_confirmed"} value={entry.fund_excess_special_rate_confirmed} onChange={(fund_excess_special_rate_confirmed) => update({ ...entry, fund_excess_special_rate_confirmed })} />}
    </>}
  </div>;
}
export function IncomeStep({ facts, change, selected, locale, focusPath }: FormProps) {
  const t = translator(locale);
  const [kind, setKind] = useState<Income["kind"]>("private_employment");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    const index = focusPath?.match(/^income\.(\d+)/)?.[1];
    const id = index === undefined ? undefined : facts.income[Number(index)]?.id;
    if (id) setCollapsed((current) => current.includes(id) ? current.filter((item) => item !== id) : current);
  }, [focusPath, facts.income]);
  const commonSources = ["private_employment", "ordinary_business", "bank_interest", "ordinary_other"] as const;
  const indexed = facts.income.map((entry, i) => ({ entry, kind: entry.kind, index: i }));
  type IncomeSlot = { entry: Income | undefined; kind: Income["kind"]; index: number };
  const slots = [
    ...commonSources.flatMap<IncomeSlot>((kind) => {
      const entries = indexed.filter((item) => item.kind === kind);
      return entries.length ? entries : [{ kind, entry: undefined, index: -1 }];
    }),
    ...indexed.filter((item) => !commonSources.some((kind) => kind === item.kind)),
  ];
  const icons: Partial<Record<Income["kind"], string>> = { private_employment: "💼", ordinary_business: "🏢", bank_interest: "🏦", domestic_dividend: "💸", listed_gain: "📈", ordinary_rent: "🏠" };
  return <div className={css.stack}>
    <div className="wealth-tax-workspace-head wealth-tax-workspace-head--income"><h2 id="tax-v2-form-heading" tabIndex={-1}>{t("How do you earn money?", "আপনার আয়ের উৎস কী?")}</h2>
    <Description>{t("Use the full income period. Include bonuses with salary and enter withholding separately. For rent or business, enter ordinary taxable income you have already calculated.", "পুরো আয়কালের তথ্য দিন। বেতনের সঙ্গে বোনাস দিন এবং উৎসে কর আলাদা রাখুন। ভাড়া বা ব্যবসার ক্ষেত্রে আগে হিসাব করা সাধারণ করযোগ্য আয় দিন।")}</Description></div>
    <div className="wealth-tax-card-grid wealth-tax-card-grid--income">
    {slots.map(({ entry, kind, index: i }) => {
      const id = entry?.id ?? (kind === "private_employment" ? quickSalary : kind === "ordinary_other" ? quickOther : "common-" + kind);
      const open = !collapsed.includes(id);
      const displayed = entry ?? incomeEntry(kind, id, "0");
      const path = entry ? "income." + i : "new-income." + kind;
      return <article key={id} aria-label={t(...incomeNames[kind])} className={`wealth-tax-select-card wealth-tax-income-card ${entry ? "wealth-tax-select-card-active" : ""}`} data-path={entry ? "income." + i : undefined}>
      <button type="button" aria-expanded={open} className="wealth-tax-income-card-toggle" onClick={() => {
        setCollapsed(open ? [...collapsed, id] : collapsed.filter((item) => item !== id));
      }}><span className="wealth-tax-income-card-icon" aria-hidden="true">{icons[kind] ?? "✨"}</span><h3 className="wealth-tax-income-card-title">{t(...incomeNames[kind])}</h3><span className="wealth-tax-select-check" aria-hidden="true">{open ? "−" : "+"}</span></button>
      <div className={`wealth-tax-income-card-body${open ? " is-open" : ""}`}>
      <div className={css.stack}>
      {reviewOnlyIncome.has(kind) && <p className={css.notice}>{t("This source needs separate tax review. Entering an amount will pause the annual estimate; this planner cannot calculate this source yet.", "এই উৎসের জন্য আলাদা কর পর্যালোচনা প্রয়োজন। অঙ্ক দিলে বার্ষিক হিসাব থামবে; পরিকল্পক এখনো এই উৎসের কর হিসাব করতে পারে না।")}</p>}
      <IncomeFields entry={displayed} selected={selected} t={t} path={path} update={(row) => change({ income: entry ? replaceAt(facts.income, i, row) : [...facts.income, row] })} />
      {entry && <div>
        <Button disabled={facts.credits.some((credit) => credit.income_id === entry.id)} onClick={() => change({ income: removeAt(facts.income, i) })}>{t("Remove source", "উৎস সরান")}</Button></div>}
      {entry && facts.credits.some((credit) => credit.income_id === entry.id) && <p className={css.muted}>{t("Remove or reassign the linked credit first.", "আগে এই উৎসের কর সমন্বয় সরান বা অন্য উৎসে দিন।")}</p>}
      </div></div>
    </article>;
    })}
    </div>
    <div className={css.sourceAdd}><Select label={t("Source to add", "যোগ করার উৎস")} value={kind} options={incomeOptions(t)} onChange={setKind} />
      <Button disabled={facts.income.length >= 100} onClick={() => change({ income: [...facts.income, incomeEntry(kind, newId("income"))] })}>{t("Add income", "আয় যোগ করুন")}</Button></div>
    {reviewOnlyIncome.has(kind) && <p role="status" className={css.notice}>{t("Separate review required: this source is not calculated by the planner. Adding it will pause your estimate until it is reviewed or removed.", "আলাদা পর্যালোচনা প্রয়োজন: পরিকল্পক এই উৎসের কর হিসাব করে না। এটি যোগ করলে পর্যালোচনা বা সরানো পর্যন্ত হিসাব থামবে।")}</p>}
  </div>;
}

function categoryOptions(selected: SelectedYear, locale: AppLocale, current?: string, scenario = false) {
  const t = translator(locale);
  return [...selected.rules.investment_presentation]
    .filter((item) => item.category === current || (item.visible && (!scenario || selected.investment_policies.some((p) => p.category === item.category && p.policy !== "excluded" && p.policy !== "needs_review"))))
    .sort((a, b) => a.order - b.order)
    .map((item) => [item.category, (locale === "bn" ? item.label_bn : item.label_en) + (item.visible ? "" : t(" (retained entry)", " (আগের তথ্য)"))] as const);
}
export function InvestmentFields({ entry, path, selected, locale, update, scenario = false }: {
  entry: Investment; path: string; selected: SelectedYear; locale: AppLocale; update: (value: Investment) => void; scenario?: boolean;
}) {
  const t = translator(locale);
  const policy = selected.investment_policies.find((item) => item.category === entry.category);
  const cap = policy?.cap_group === "dps" ? selected.rules.dps_cap : policy?.cap_group === "government_securities" ? selected.rules.government_securities_cap : null;
  const insurance = entry.category === "life_insurance" || entry.category === "deferred_annuity";
  const split = entry.recognized_pf_contributions;
  return <div className={css.fields}>
    <Select label={t("Investment category", "বিনিয়োগের ধরন")} path={path + ".category"} value={entry.category} options={categoryOptions(selected, locale, entry.category, scenario)} onChange={(key) => update(investmentEntry(key, entry.id, entry.amount, entry.contributed_on))} />
    <Input money label={t("Contribution amount", "জমার পরিমাণ")} path={path + ".amount"} value={entry.amount} onChange={(amount) => update({ ...entry, amount })} help={cap ? t("Shared annual cap: ", "সম্মিলিত বার্ষিক সীমা: ") + bdt(cap, locale) : undefined} />
    <Input type="date" label={t("Contribution date", "জমার তারিখ")} path={path + ".contributed_on"} min={selected.identity.income_period_start} max={selected.identity.income_period_end} value={entry.contributed_on} onChange={(contributed_on) => update({ ...entry, contributed_on })} />
    <Tri t={t} label={t("Meets the rules for this category?", "এই শ্রেণির নিয়ম পূরণ করে?")} path={path + ".qualification"} value={entry.qualification} onChange={(qualification) => update({ ...entry, qualification })} />
    {(entry.category === "fund_unit_etf" || entry.category === "listed_security") && <Tri t={t} label={t("New contribution in this income period?", "এই আয়কালে নতুন বিনিয়োগ?")} path={path + ".new_investment"} value={entry.new_investment ?? "unknown"} onChange={(new_investment) => update({ ...entry, new_investment })} />}
    {!scenario && <Tri t={t} label={t("Encashed before the required maturity?", "নির্ধারিত মেয়াদের আগে ভাঙানো হয়েছে?")} path={path + ".premature_encashment"} value={entry.premature_encashment ?? "no"} onChange={(premature_encashment) => update({ ...entry, premature_encashment })} />}
    {insurance && <>
      <Select label={t("Insured person", "বীমাকৃত ব্যক্তি")} path={path + ".insured_relationship"} value={entry.insured_relationship ?? "unknown"} options={[["unknown", t("Not sure", "নিশ্চিত নই")], ["self", t("Self", "নিজে")], ["spouse", t("Spouse", "স্বামী বা স্ত্রী")], ["minor_child", t("Minor child", "অপ্রাপ্তবয়স্ক সন্তান")], ["other", t("Other", "অন্যান্য")]]} onChange={(insured_relationship) => update({ ...entry, insured_relationship })} />
      <Tri t={t} label={t("Paid and payable in Bangladesh?", "বাংলাদেশে দেওয়া ও প্রদেয়?")} path={path + ".paid_and_payable_in_bangladesh"} value={entry.paid_and_payable_in_bangladesh ?? "unknown"} onChange={(paid_and_payable_in_bangladesh) => update({ ...entry, paid_and_payable_in_bangladesh })} />
    </>}
    {entry.category === "life_insurance" && <>
      <Input money label={t("Actual sum assured, excluding bonus", "বোনাস ছাড়া প্রকৃত বীমাকৃত অঙ্ক")} path={path + ".actual_sum_assured_excluding_bonus"} value={entry.actual_sum_assured_excluding_bonus ?? ""} onChange={(v) => update({ ...entry, actual_sum_assured_excluding_bonus: v || null })} />
      <Input label={t("Policy nickname (e.g. policy-a)", "পলিসির ছোট নাম (যেমন policy-a)")} help={t("Use the same nickname for premiums on one policy. Avoid the real policy number.", "এক পলিসির সব প্রিমিয়ামে একই নাম দিন। আসল নম্বর দেবেন না।")} path={path + ".insurance_policy_id"} maxLength={80} value={entry.insurance_policy_id ?? ""} onChange={(v) => update({ ...entry, insurance_policy_id: v || null })} />
    </>}
    {entry.category === "recognized_pf" && <>
      <Check label={t("Enter annual employee and employer amounts", "কর্মী ও নিয়োগকর্তার বার্ষিক জমা আলাদা দিন")} checked={!!split} onChange={(checked) => update({ ...entry, certified_eligible_amount: null, recognized_pf_contributions: checked ? { fund_id: "", employee_annual: "", employer_annual: "" } : null })} />
      {split ? <>
        <Input label={t("Fund nickname", "তহবিলের ছোট নাম")} path={path + ".recognized_pf_contributions.fund_id"} value={split.fund_id} onChange={(fund_id) => update({ ...entry, recognized_pf_contributions: { ...split, fund_id } })} />
        <Input money label={t("Employee annual amount", "কর্মীর বার্ষিক জমা")} path={path + ".recognized_pf_contributions.employee_annual"} value={split.employee_annual} onChange={(employee_annual) => update({ ...entry, recognized_pf_contributions: { ...split, employee_annual } })} />
        <Input money label={t("Employer annual amount", "নিয়োগকর্তার বার্ষিক জমা")} path={path + ".recognized_pf_contributions.employer_annual"} value={split.employer_annual} onChange={(employer_annual) => update({ ...entry, recognized_pf_contributions: { ...split, employer_annual } })} />
      </> : <Input money label={t("Certified eligible amount", "সনদে উল্লেখিত যোগ্য অঙ্ক")} path={path + ".certified_eligible_amount"} value={entry.certified_eligible_amount ?? ""} onChange={(v) => update({ ...entry, certified_eligible_amount: v || null })} />}
    </>}
    {(entry.category === "approved_donation" || entry.category === "zakat") && <Select label={t("Approved recipient", "অনুমোদিত প্রাপক")} path={path + ".approval_id"} value={entry.approval_id ?? ""} onChange={(v) => update({ ...entry, approval_id: v || null })} options={[["", t("Choose a recipient", "প্রাপক বেছে নিন")], ...selected.rules.donation_approvals.filter((a) => a.category === entry.category).map((a) => [a.id, locale === "bn" ? a.label_bn : a.label_en] as const)]} />}
  </div>;
}
export function InvestmentsStep({ facts, change, selected, locale }: FormProps) {
  const t = translator(locale), categories = categoryOptions(selected, locale);
  const [showTotal, setShowTotal] = useState(facts.investmentMode === "aggregate" && hasMoney(facts.aggregate));
  const totalSelected = facts.investmentMode === "aggregate" && (showTotal || hasMoney(facts.aggregate));
  const verified = facts.investmentMode === "itemized";
  const amounts = facts.categoryAmounts ?? {};
  const editorRoot = useRef<HTMLDivElement>(null);
  const previousIds = useRef(new Set(facts.investments.map((entry) => entry.id)));
  const previousDonationIds = useRef(new Set(facts.deductions.map((entry) => entry.id)));
  useEffect(() => {
    const added = facts.deductions.find((entry) => !previousDonationIds.current.has(entry.id));
    previousDonationIds.current = new Set(facts.deductions.map((entry) => entry.id));
    if (!added) return;
    const index = facts.deductions.findIndex((entry) => entry.id === added.id);
    const frame = requestAnimationFrame(() => editorRoot.current?.querySelector<HTMLInputElement>(`[data-path="income_deductions.${index}.amount"] input`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [facts.deductions]);
  useEffect(() => {
    const added = facts.investments.find((entry) => !previousIds.current.has(entry.id));
    previousIds.current = new Set(facts.investments.map((entry) => entry.id));
    if (!added) return;
    const index = facts.investments.findIndex((entry) => entry.id === added.id);
    const frame = requestAnimationFrame(() => {
      editorRoot.current?.querySelector<HTMLInputElement>(`[data-path="investments.entries.${index}.amount"] input`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [facts.investments]);
  function chooseAmounts() { setShowTotal(false); change({ investmentMode: "categories" }); }
  return <div className={css.investmentLayout} ref={editorRoot}>
    <div className={css.headingRow}><h2 id="tax-v2-form-heading" tabIndex={-1}>{t("Investments and deductions", "বিনিয়োগ ও আয় থেকে বাদ")}</h2><Description>{t("For annual planning, enter eligible yearly amounts directly. DPS and government-security shared caps are applied automatically. For insurance, PF and approved donations, use the eligible portion after their conditions. Verification details are optional here and required for a filing balance.", "বার্ষিক পরিকল্পনায় সরাসরি যোগ্য বার্ষিক অঙ্ক দিন। ডিপিএস ও সরকারি সিকিউরিটিজের সম্মিলিত সীমা স্বয়ংক্রিয়ভাবে প্রযোজ্য হবে। বীমা, পিএফ ও অনুমোদিত অনুদানে শর্তের পর যোগ্য অংশ দিন। এখানে যাচাইয়ের বিবরণ ঐচ্ছিক; দাখিলের বাকি করের জন্য প্রয়োজন।")}</Description></div>
    <div className={css.investmentMethods} role="group" aria-label={t("Investment entry method", "বিনিয়োগ দেওয়ার পদ্ধতি")}>
      <button type="button" aria-pressed={!totalSelected} onClick={chooseAmounts}>{t("By category · simple amounts", "শ্রেণি অনুযায়ী সহজ অঙ্ক")}</button>
      <button type="button" aria-pressed={totalSelected} onClick={() => { setShowTotal(true); change({ investmentMode: "aggregate" }); }}>{t("One eligible total", "একটি যোগ্য মোট")}</button>

    </div>
    <p className={css.investmentCaption}>{totalSelected ? t("Use one total already eligible after all category caps. Category entries are kept separately and are not added again.", "শ্রেণির সব সীমার পর যোগ্য মোট দিন। শ্রেণির অঙ্ক আলাদা রাখা হয়, আবার যোগ হয় না।") : verified ? t("These individual payment details are used for this estimate. Your simple category amounts remain saved separately.", "এই হিসাবে পৃথক পরিশোধের বিবরণ ব্যবহার হচ্ছে। সহজ শ্রেণিভিত্তিক অঙ্ক আলাদাভাবে রাখা আছে।") : t("Enter yearly eligible amounts. Shared caps apply automatically; no payment dates are needed for this planning estimate.", "বার্ষিক যোগ্য অঙ্ক দিন। সম্মিলিত সীমা স্বয়ংক্রিয়ভাবে প্রযোজ্য; এই পরিকল্পনায় পরিশোধের তারিখ লাগবে না।")}</p>
    {totalSelected ? <Aggregate facts={facts} change={change} t={t} /> : <div className={css.amountTiles} aria-label={t("Investment categories", "বিনিয়োগের শ্রেণি")}>
      {categories.filter(([category]) => selected.investment_policies.some((policy) => policy.category === category && policy.policy !== "excluded" && policy.policy !== "needs_review")).map(([category, label]) => {
        const policy = selected.investment_policies.find((item) => item.category === category)!;
        const cap = policy.cap_group === "dps" ? selected.rules.dps_cap : policy.cap_group === "government_securities" ? selected.rules.government_securities_cap : null;
        const icon = category.includes("insurance") ? "🛡️" : category.includes("pf") || category.includes("pension") ? "🧾" : category === "dps" ? "🏦" : category.includes("government") || category === "savings_certificate" ? "🇧🇩" : category.includes("security") || category.includes("fund") ? "📊" : category.includes("donation") || category === "zakat" ? "🤲" : "💰";
        return <article key={category} aria-label={label} className={css.amountTile + (hasMoney(amounts[category] ?? "") ? " " + css.amountTileActive : "")}>
          <div className={css.amountTileHead}><span className="wealth-tax-investment-icon" aria-hidden="true">{icon}</span><h3>{label}</h3></div>
          <Input money placeholder="0" label={t("Annual eligible amount", "বার্ষিক যোগ্য অঙ্ক")} ariaLabel={label + " · " + t("Annual eligible amount", "বার্ষিক যোগ্য অঙ্ক")} path={"planning-investments." + category} value={amounts[category] ?? ""} onChange={(amount) => { setShowTotal(false); change({ investmentMode: "categories", categoryAmounts: { ...amounts, [category]: amount } }); }} tooltipLabel={label + t(" eligibility", " যোগ্যতা")} tooltip={cap ? t("Shared yearly cap: ", "সম্মিলিত বার্ষিক সীমা: ") + bdt(cap, locale) : t("Enter the eligible portion after the category's legal conditions, for the active income period. This is a planning assumption, not a verified filing claim.", "সক্রিয় আয়কালের জন্য শ্রেণির আইনি শর্তের পর যোগ্য অংশ দিন। এটি পরিকল্পনার ধারণা, যাচাইকৃত রিটার্ন দাবি নয়।")} />
          {cap && <span className={css.tileCap}>{t("Shared cap ", "সম্মিলিত সীমা ")}{bdt(cap, locale)}</span>}
        </article>;
      })}
    </div>}
    <InfoDialog title={t("Verify individual contributions for filing", "রিটার্নের জন্য পৃথক জমা যাচাই করুন")} compact>

      <div className="wealth-tax-investment-list">
      {facts.investments.map((entry, i) => <article className={"wealth-tax-investment-tile wealth-tax-investment-tile-active " + css.stack} key={entry.id} data-path={"investments.entries." + i}>
        <InvestmentFields entry={entry} path={"investments.entries." + i} selected={selected} locale={locale} update={(value) => change({ investmentMode: "itemized", investments: replaceAt(facts.investments, i, value) })} />
        <div><Button onClick={() => change({ investments: removeAt(facts.investments, i) })}>{t("Remove contribution", "জমা সরান")}</Button></div>
      </article>)}
      </div>
      <div><Button disabled={!categories.length || facts.investments.length >= 100} onClick={() => change({ investmentMode: "itemized", investments: [...facts.investments, investmentEntry(categories[0][0], newId("investment"))] })}>{t("Add contribution", "জমা যোগ করুন")}</Button></div>
    </InfoDialog>
    <div className={css.headingRow}><h3>{t("CZM donation deduction", "সিজেডএম অনুদান: আয় থেকে বাদ")}</h3><Description>{t("Enter eligible bank transfers here. Do not also include them in investments.", "যোগ্য ব্যাংক ট্রান্সফার এখানে দিন। একই অঙ্ক বিনিয়োগেও দেবেন না।")}</Description></div>
    {facts.deductions.length > 0 && <Tri t={t} label={t(...coverageNames.other_part2_donation_claims)} path="coverage.other_part2_donation_claims" value={facts.coverage.other_part2_donation_claims} onChange={(other_part2_donation_claims) => change({ coverage: { ...facts.coverage, other_part2_donation_claims } })} />}
    {facts.deductions.map((entry, i) => {
      const path = "income_deductions." + i;
      const update = (patch: Partial<typeof entry>) => change({ deductions: replaceAt(facts.deductions, i, { ...entry, ...patch }) });
      return <article key={entry.id} className={css.card + " " + css.stack} data-path={path}>
        {entry.paid_on && (entry.paid_on < selected.identity.income_period_start || entry.paid_on > selected.identity.income_period_end) && <p role="status" className={css.notice}>{t("Excluded from this estimate: the payment date must be within ", "এই হিসাব থেকে বাদ: পরিশোধের তারিখ হতে হবে ")}{selected.identity.income_period_start} — {selected.identity.income_period_end}{t(". Change the date only if your payment record supports it.", " এর মধ্যে। পরিশোধের নথি অনুযায়ী সঠিক তারিখ দিন।")}</p>}
        {(!validMoney(entry.amount) || !entry.paid_on) && <p className={css.creditNote}>{t("Complete the donation amount and payment date, or remove this entry, to refresh your estimate and simulator.", "হিসাব ও সিমুলেটর হালনাগাদ করতে অনুদানের অঙ্ক ও পরিশোধের তারিখ দিন, অথবা এই অনুদান সরান।")}</p>}
        <div className={css.fields}>
          <Input money label={t("Donation amount", "অনুদানের অঙ্ক")} path={path + ".amount"} value={entry.amount} onChange={(amount) => update({ amount })} />
          <Input type="date" label={t("Paid on", "পরিশোধের তারিখ")} path={path + ".paid_on"} value={entry.paid_on} onChange={(paid_on) => update({ paid_on })} />
          <Tri t={t} label={t("Qualifying bank transfer?", "যোগ্য ব্যাংক ট্রান্সফার?")} path={path + ".qualified_bank_transfer"} value={entry.qualified_bank_transfer} onChange={(qualified_bank_transfer) => update({ qualified_bank_transfer })} />
        </div><div><Button onClick={() => change({ deductions: removeAt(facts.deductions, i) })}>{t("Remove donation", "অনুদান সরান")}</Button></div>
      </article>;
    })}
    <div><Button disabled={facts.deductions.some((entry) => !validMoney(entry.amount) || !entry.paid_on) || facts.deductions.length >= 100} onClick={() => change({ deductions: [...facts.deductions, { id: newId("deduction"), kind: "czm_donation", amount: "", paid_on: "", qualified_bank_transfer: "unknown" }] })}>{t("Add CZM donation", "সিজেডএম অনুদান যোগ করুন")}</Button></div>
  </div>;
}
export function CreditsStep({ facts, change, selected, locale, onEditStep }: FormProps) {
  const t = translator(locale), filing = facts.filing;
  const profileLabels = [
    facts.profile.residence === "resident" ? t("Resident", "নিবাসী") : facts.profile.residence === "non_resident" ? t("Non-resident", "অনিবাসী") : t("Residence unconfirmed", "নিবাস নিশ্চিত নয়"),
    facts.profile.entity === "individual" ? t("Individual", "ব্যক্তি") : facts.profile.entity.toUpperCase(),
    ...(Object.keys(qualifications) as (keyof typeof qualifications)[]).filter((key) => facts.profile[key]).map((key) => t(qualifications[key][0], qualifications[key][1])),
    ...(facts.profile.senior_qualified_for_year === "yes" ? [t("Senior Citizen", "প্রবীণ করদাতা")] : facts.profile.senior_qualified_for_year === "unknown" ? [t("Age qualification unconfirmed", "বয়সের যোগ্যতা নিশ্চিত নয়")] : []),
    ...(facts.profile.eligible_disabled_dependents > 0 ? [facts.profile.eligible_disabled_dependents + t(" dependent claims", " নির্ভরশীলের দাবি")] : []),
  ];
  return <div className={css.stack + " " + css.reviewLayout}>
    {!selected.identity.supports_settlement && <p role="status" className={css.notice}>{t("Annual planning only: the active rules do not support a filing balance or refund estimate. Tax payments do not reduce annual liability; new payment entry is unavailable here. Any previously entered records are preserved.", "শুধু বার্ষিক কর পরিকল্পনা: সক্রিয় নিয়মে দাখিলের বাকি কর বা ফেরতযোগ্য করের হিসাব নেই। কর পরিশোধ বার্ষিক করদায় কমায় না; এখানে নতুন পরিশোধ যোগ করা যাবে না। আগে দেওয়া তথ্য সংরক্ষিত আছে।")}</p>}
    <div className={css.headingRow}><h2 id="tax-v2-form-heading" tabIndex={-1}>{t("Credits and filing review", "কর সমন্বয় ও রিটার্ন পর্যালোচনা")}</h2><Description>{t("Enter actual withholding or advance payments from your records. Credits reduce a supported filing balance, not annual tax. Unknown credits are not treated as zero.", "নথি থেকে প্রকৃত উৎসে কর বা অগ্রিম কর দিন। কর সমন্বয় প্রযোজ্য দাখিলের বাকি কর কমায়, বার্ষিক কর নয়। অজানা কর সমন্বয়কে শূন্য ধরা হয় না।")}</Description></div>
    <div className="wealth-tax-review-grid">
      {[
        [0, t("Tax Profile", "করদাতার পরিচয়"), profileLabels.join(" · ")],
        [1, t("Income Sources", "আয়ের উৎস"), facts.income.every((entry) => validMoney(entry.amount)) ? bdt(sumMoney(facts.income.map((entry) => entry.amount)), locale) : t("Incomplete amounts", "অঙ্ক অসম্পূর্ণ")],
        [2, t("Tax Saving Investments", "করসাশ্রয়ী বিনিয়োগ"), facts.investmentMode === "categories" ? Object.values(facts.categoryAmounts ?? {}).every((amount) => !amount || validMoney(amount)) ? bdt(sumMoney(Object.values(facts.categoryAmounts ?? {}).filter(validMoney)), locale) : t("Incomplete amounts", "অঙ্ক অসম্পূর্ণ") : facts.investmentMode === "aggregate" ? validMoney(facts.aggregate || "0") ? bdt(facts.aggregate || "0", locale) : "—" : facts.investments.every((entry) => validMoney(entry.amount)) ? bdt(sumMoney(facts.investments.map((entry) => entry.amount)), locale) : t("Incomplete amounts", "অঙ্ক অসম্পূর্ণ")],
      ].map(([step, title, value]) => <article className="wealth-tax-review-card" key={step}><span>{title}</span><strong>{value}</strong><button type="button" className="wealth-inline-link wealth-tax-link-button" aria-label={t("Edit ", "সম্পাদনা ") + title} onClick={() => onEditStep?.(Number(step))}>{t("Edit", "সম্পাদনা")}</button></article>)}
    </div>
    <div className={css.creditToolbar}>
    <Select label={t("Credit information", "কর সমন্বয়ের তথ্য")} path="credits_completeness" value={facts.creditStatus} onChange={(creditStatus) => change({ creditStatus })} options={[["unknown", t("Incomplete or unknown", "অসম্পূর্ণ বা অজানা")], ["confirmed_none", t("Confirmed no credits", "কর সমন্বয় নেই বলে নিশ্চিত")], ["complete", t("All credits entered", "সব কর সমন্বয় দেওয়া হয়েছে")]]} />
    <Button disabled={!selected.identity.supports_settlement || facts.credits.length >= 100} onClick={() => change({ creditStatus: facts.creditStatus === "confirmed_none" ? "unknown" : facts.creditStatus, credits: [...facts.credits, { id: newId("credit"), kind: "withholding", amount: "", paid_on: "", assessment_year: selected.identity.assessment_year, qualifying_claim_confirmed: "unknown" }] })}>{t("Add tax payment", "কর পরিশোধ যোগ করুন")}</Button>
    </div>
    {facts.credits.map((credit, i) => {
      const path = "credits." + i;
      const update = (patch: Partial<Credit>) => change({ credits: replaceAt(facts.credits, i, { ...credit, ...patch }) });
      return <article key={credit.id} className={css.card + " " + css.stack} data-path={path}>
        <div className={css.fields}>
          <Select label={t("Payment type", "কর পরিশোধের ধরন")} path={path + ".kind"} value={credit.kind} options={[["withholding", t("Withholding", "উৎসে কর")], ["ordinary_advance", t("Ordinary advance tax", "সাধারণ অগ্রিম কর")], ["final_or_restricted", t("Final or restricted", "চূড়ান্ত বা সীমিত")], ["unclassified", t("Not sure", "নিশ্চিত নই")]]} onChange={(kind) => update({ kind, income_id: kind === "withholding" ? credit.income_id : null })} />
          {credit.kind === "withholding" && <Select label={t("Linked income source", "সংশ্লিষ্ট আয়ের উৎস")} path={path + ".income_id"} value={credit.income_id ?? ""} options={[["", t("Choose a source", "উৎস বেছে নিন")], ...facts.income.map((entry, index) => [entry.id, (index + 1) + ". " + t(...incomeNames[entry.kind])] as const)]} onChange={(v) => update({ income_id: v || null })} />}
          <Input money label={t("Tax paid", "পরিশোধিত কর")} path={path + ".amount"} value={credit.amount} onChange={(amount) => update({ amount })} />
          <Input type="date" label={t("Payment date", "পরিশোধের তারিখ")} path={path + ".paid_on"} value={credit.paid_on} onChange={(paid_on) => update({ paid_on })} />
          <Tri t={t} label={t("Claim for this assessment year confirmed?", "এই করবর্ষের দাবি নিশ্চিত?")} path={path + ".qualifying_claim_confirmed"} value={credit.qualifying_claim_confirmed} onChange={(qualifying_claim_confirmed) => update({ qualifying_claim_confirmed })} />
        </div><div><Button onClick={() => change({ credits: removeAt(facts.credits, i) })}>{t("Remove payment", "পরিশোধ সরান")}</Button></div>
      </article>;
    })}
    {selected.identity.supports_settlement ? <>
      <Check label={t("Estimate the balance at filing", "রিটার্ন দাখিলের সময় বাকি কর হিসাব করুন")} checked={!!filing} onChange={(checked) => change({ filing: checked ? { filing_date: "", return_from_abroad_exception: "unknown", extension_or_other_exception: "unknown" } : null })} />
      {filing && <div className={css.fields}>
        <Input type="date" label={t("Planned filing date", "সম্ভাব্য রিটার্ন দাখিলের তারিখ")} path="filing.filing_date" value={filing.filing_date} onChange={(filing_date) => change({ filing: { ...filing, filing_date } })} />
        <Tri t={t} label={t("Is this your first return?", "এটি কি আপনার প্রথম রিটার্ন?")} path="profile.first_return" value={facts.profile.first_return} onChange={(first_return) => change({ profile: { ...facts.profile, first_return } })} />
        <Tri t={t} label={t("Return from abroad exception applies?", "বিদেশ থেকে ফেরার ব্যতিক্রম প্রযোজ্য?")} path="filing.return_from_abroad_exception" value={filing.return_from_abroad_exception} onChange={(return_from_abroad_exception) => change({ filing: { ...filing, return_from_abroad_exception } })} />
        <Tri t={t} label={t("Extension or another filing exception applies?", "সময় বাড়ানো বা অন্য ব্যতিক্রম প্রযোজ্য?")} path="filing.extension_or_other_exception" value={filing.extension_or_other_exception} onChange={(extension_or_other_exception) => change({ filing: { ...filing, extension_or_other_exception } })} />
      </div>}
    </> : <p className={css.creditNote}>{t("Annual tax planning · filing balance is unavailable under the active rules.", "বার্ষিক কর পরিকল্পনা · সক্রিয় নিয়মে দাখিলের বাকি কর পাওয়া যাচ্ছে না।")}</p>}
  </div>;
}

export function ScenarioForm({ facts, change, selected, locale, asOf, calculate, disabled, base, result, pending = false, invalid = false }: FormProps & { asOf: string; calculate: () => void; disabled: boolean; base?: TaxBreakdown; result?: TaxResult; pending?: boolean; invalid?: boolean; onReviewFact?: (path:string)=>void }) {
  const t = translator(locale), scenario = facts.scenario;
  const [discoverSlider, setDiscoverSlider] = useState(false);
  const { income_period_start: start, income_period_end: end, income_period_status: status } = selected.identity;
  const date = asOf < start ? start : asOf > end ? end : asOf;
  const categories = categoryOptions(selected, locale, undefined, true);
  const canCheckCategory = facts.investmentMode === "itemized" || (facts.investmentMode === "aggregate" ? !hasMoney(facts.aggregate) : !Object.values(facts.categoryAmounts ?? {}).some(hasMoney));
  const conditional = () => ({ mode: "confirmed_eligible_total", amount: "0", contributed_on: date, confirmed_for_year: true } as const);
  const statutoryMaximum = usableBase(base) ? Math.max(0, Number(base?.rebate.additional_eligible_investment_for_statutory_limit ?? 0)) : 0;
  const enteredAmount = scenario?.mode === "confirmed_eligible_total" ? Number(scenario.amount || 0) : 0;
  const sliderAmount = Number.isFinite(enteredAmount) && enteredAmount >= 0 ? enteredAmount : 0;
  // Keep a retained/custom proposal represented honestly if income changes its usable cap.
  const maximum = Math.max(statutoryMaximum, sliderAmount);
  const projected = result?.scenario?.breakdown;
  const active = projected ?? base;
  const percent = rebateProgress(active);
  const complete = rebateComplete(active);
  const zeroTax = usableBase(active) && Number(active?.annual_liability) === 0;
  const remaining = complete ? "0" : active?.rebate.additional_eligible_investment_for_lowest_usable_liability;
  const display = (value: string | null | undefined) => value == null || !usableBase(base) ? "—" : bdt(value, locale);
  const sliderReady = !disabled && usableBase(base) && !rebateComplete(base) && maximum > 0;
  const sliderRatio = maximum > 0 ? Math.min(1, sliderAmount / maximum) : 0;
  const totalInvestment = result?.scenario && base ? sumMoney([base.eligible_investment, result.scenario.eligible_increment]) : !scenario ? base?.eligible_investment : null;
  const markers = [0, maximum / 3, maximum * 2 / 3, maximum];
  useEffect(() => {
    if (!sliderReady || typeof window.matchMedia !== "function") return;
    const key = "wealth-tax-slider-discovery-v2";
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "seen");
      setDiscoverSlider(true);
    } catch { /* The slider remains usable when session storage is unavailable. */ }
  }, [sliderReady]);
  return <section className="wealth-tax-play wealth-tax-play-compact wealth-panel" data-guide="tax-planner-rebate" data-path="scenario" id="tax-planner-play-explore" tabIndex={-1}>
    <div className="wealth-tax-play-head"><h2>{t("What If I Invest More?", "আরও Invest করলে কী হতে পারে?")}</h2></div>
    <div className="wealth-tax-play-layout wealth-tax-play-layout-compact">
      <aside className="wealth-tax-play-aside">
        <SavingsJar fillPercent={usableBase(base) ? percent : undefined} />
        <div className="wealth-tax-play-aside-investment">
          <div className="wealth-tax-play-aside-row wealth-tax-play-aside-row--current"><span>{t("Current Eligible Investment", "এখনকার যোগ্য বিনিয়োগ")}</span><strong>{display(base?.eligible_investment)}</strong></div>
          <div className="wealth-tax-play-aside-row wealth-tax-play-aside-row--target"><span>{complete ? projected ? t("Scenario Eligible Investment", "সম্ভাব্য যোগ্য বিনিয়োগ") : t("Eligible Investment", "যোগ্য বিনিয়োগ") : t("Target Investment", "লক্ষ্যের বিনিয়োগ")}</span><strong>{display(requiredInvestment(active))}</strong></div>
          {complete && <p className="wealth-tax-target-achieved">✓ {active?.annual_liability && hasMoney(active.annual_liability) ? t("Target Achieved", "লক্ষ্য পূরণ") : t("No Additional Saving Needed", "আর অতিরিক্ত সাশ্রয় প্রয়োজন নেই")}</p>}
        </div>
      </aside>
      <div className="wealth-tax-play-main">
        <div className="wealth-tax-play-planning">
          <p className="wealth-tax-play-hero-pct">{complete ? t("No further annual tax saving", "আর অতিরিক্ত বার্ষিক করসাশ্রয় নেই") : projected ? t("Scenario rebate utilization", "সম্ভাব্য রেয়াতের ব্যবহার") : t("Rebate utilization", "রেয়াতের ব্যবহার")}{!complete && " " + (percent === undefined ? "—" : percent + "%")}</p>
          <p className="wealth-tax-play-hero-context">{projected ? t("After the additional contribution in this scenario", "এই সম্ভাব্য হিসাবের অতিরিক্ত জমার পরে") : t("Based on the current eligible investments", "বর্তমান যোগ্য বিনিয়োগ অনুযায়ী")}</p>
          <div className="wealth-tax-progress-track wealth-tax-progress-track--hero" role="progressbar" aria-label={t("Usable tax saving progress", "ব্যবহারযোগ্য করসাশ্রয়ের অগ্রগতি")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={complete ? t("No further annual tax saving", "আর অতিরিক্ত বার্ষিক করসাশ্রয় নেই") : percent === undefined ? t("Unavailable", "পাওয়া যাচ্ছে না") : percent + "%"}><span style={{ width: (percent ?? 0) + "%" }} /></div>
          <div className="wealth-tax-play-recommendation" role="status">
            {complete ? zeroTax ? <p>✓ {t("No tax saving needed — your estimated annual tax is zero.", "করসাশ্রয়ের প্রয়োজন নেই — আপনার আনুমানিক বার্ষিক কর শূন্য।")}</p> : <p>✓ {t("Usable target complete. ", "ব্যবহারযোগ্য লক্ষ্য পূরণ। ")}{projected ? t("Scenario annual tax saving ", "সম্ভাব্য বার্ষিক করসাশ্রয় ") : t("Usable tax reduction ", "ব্যবহারযোগ্য কর হ্রাস ")}<strong className="wealth-tax-play-recommendation-save">{display(projected ? result?.scenario?.annual_saving : base?.rebate.effective_tax_reduction)}</strong></p>
              : usableBase(active) && remaining != null ? <p>{t("An additional eligible contribution of ", "আরও যোগ্য জমা ")}<strong className="wealth-tax-play-recommendation-invest">{display(remaining)}</strong>{t(" could reduce annual tax by ", " বার্ষিক কর কমাতে পারে ")}<strong className="wealth-tax-play-recommendation-save">{display(active?.rebate.potential_additional_tax_saving)}</strong></p> : <p>{t("Review the relevant facts to compare eligible contributions.", "যোগ্য জমা তুলনায় প্রাসঙ্গিক তথ্য যাচাই করুন।")}</p>}
          </div>
          <div className="wealth-tax-play-context"><div className="wealth-tax-play-context-chips">
            <span className="wealth-tax-play-rebate-chip"><span className="wealth-tax-play-rebate-chip-label">{t("Current Statutory Rebate", "এখনকার আইনি রেয়াত")}</span><strong>{display(base?.rebate.entitlement)}</strong></span>
            <span className="wealth-tax-play-rebate-chip wealth-tax-play-rebate-chip--max"><span className="wealth-tax-play-rebate-chip-label">{t("Scenario Statutory Rebate", "সম্ভাব্য আইনি রেয়াত")}</span><strong>{display(projected?.rebate.entitlement)}</strong></span>
          </div>{active && <div className="wealth-tax-play-context-meta"><RebateLimiterBadge base={active} locale={locale} /><RebateDetails base={active} rules={selected.rules} locale={locale} /></div>}</div>
          <Description label={t("Why rebate and actual saving differ", "রেয়াত ও প্রকৃত সাশ্রয় আলাদা কেন")} >{t("Statutory rebate is the calculated entitlement before minimum tax. Usable tax reduction is how much it actually lowers annual tax. Additional saving compares the scenario with your current tax, so these amounts can differ.", "আইনি রেয়াত হলো ন্যূনতম কর প্রয়োগের আগের প্রাপ্য রেয়াত। ব্যবহারযোগ্য কর হ্রাস হলো এতে বার্ষিক কর যতটা কমে। অতিরিক্ত সাশ্রয় বর্তমান করের সঙ্গে সম্ভাব্য হিসাবের তুলনা, তাই অঙ্কগুলো আলাদা হতে পারে।")}</Description>
        </div>
        <div className={css.stack}>
    <p className="wealth-muted-copy">{t("Compare a proposed contribution with your projected annual estimate.", "সম্ভাব্য নতুন জমার সঙ্গে আপনার বার্ষিক প্রাক্কলন তুলনা করুন।")}</p>
    <InfoDialog title={t("Fine-tune comparison", "তুলনা সাজিয়ে নিন")} subtitle={t("Date, eligible amount or investment category", "তারিখ, যোগ্য অঙ্ক বা বিনিয়োগের শ্রেণি")} icon="◈">
      <p className={css.dialogIntro}>{t("The slider assumes your extra contribution is eligible after the applicable caps. Compare a different date or check a specific category here.", "স্লাইডারে ধরে নেওয়া হয় অতিরিক্ত জমা প্রযোজ্য সীমার পর যোগ্য। এখানে তারিখ বদলান বা নির্দিষ্ট শ্রেণির যোগ্যতা যাচাই করুন।")}</p>
      {!scenario && <Button onClick={() => change({ scenario: conditional(), scenarioConfirmed: true })}>{t("Customize comparison", "তুলনা সাজান")}</Button>}
    {scenario && <>
      <Select label={t("Scenario basis", "সম্ভাব্য হিসাবের ভিত্তি")} value={scenario.mode} options={[["confirmed_eligible_total", t("Conditional eligible total", "শর্তসাপেক্ষ যোগ্য মোট")], ...(categories.length && canCheckCategory ? [["itemized", t("Check an investment category", "বিনিয়োগের শ্রেণি যাচাই করুন")] as const] : scenario.mode === "itemized" ? [["itemized", t("Category (requires itemized actuals)", "শ্রেণি (আলাদা জমার তথ্য প্রয়োজন)")] as const] : [])]}
        onChange={(mode) => change({ scenario: mode === "itemized" && categories.length ? { mode, entry: investmentEntry(categories[0][0], newId("scenario"), "", date) } : conditional(), scenarioConfirmed: true })} />
      {scenario.mode === "confirmed_eligible_total" ? <>
        <div className={css.fields}>
          <Input money label={t("Hypothetical eligible amount", "সম্ভাব্য যোগ্য জমা")} path="scenario.amount" value={scenario.amount} onChange={(amount) => change({ scenario: { ...scenario, amount }, scenarioConfirmed: true })} />
          <Input type="date" label={t("Hypothetical contribution date", "সম্ভাব্য জমার তারিখ")} path="scenario.contributed_on" min={start} max={end} value={scenario.contributed_on} onChange={(contributed_on) => change({ scenario: { ...scenario, contributed_on }, scenarioConfirmed: true })} />
        </div>

      </> : <InvestmentFields entry={scenario.entry} scenario path="scenario.entry" selected={selected} locale={locale} update={(entry) => change({ scenario: { mode: "itemized", entry } })} />}
      <div><Button primary disabled={disabled} onClick={calculate}>{t("Calculate comparison", "তুলনা হিসাব করুন")}</Button></div>
    </>}
    </InfoDialog>
    {scenario?.mode !== "itemized" && <div className="wealth-tax-slider-block wealth-tax-slider-block--compact">
          <p className="wealth-tax-slider-helper" id="tax-planner-rebate-slider-help">{t("Drag to compare an additional eligible amount under the active rules.", "সক্রিয় নিয়মে অতিরিক্ত যোগ্য অঙ্ক তুলনা করতে স্লাইডার টানুন।")}</p>
          <div className="wealth-tax-slider-summary" aria-live="polite"><span className="wealth-tax-slider-summary-item"><em>{t("Additional Investment", "অতিরিক্ত বিনিয়োগ")}</em><strong>{bdt(scenario?.amount || "0", locale)}</strong></span><span className="wealth-tax-slider-summary-item wealth-tax-slider-summary-item--total"><em>{t("Total Eligible Investment", "মোট যোগ্য বিনিয়োগ")}</em><strong>{display(totalInvestment)}</strong></span></div>
          <div className="wealth-tax-slider-wrap"><div className="wealth-tax-slider-rail" style={{ "--slider-ratio": sliderRatio } as CSSProperties}>
            {sliderAmount > 0 && <><span aria-hidden="true" className="wealth-tax-slider-fill" /><span className="wealth-tax-slider-thumb-value">+{bdt(scenario?.amount || "0", locale)}</span></>}
            <input type="range" className={"wealth-tax-slider" + (discoverSlider ? " wealth-tax-slider--discovery" : "")} aria-label={t("Additional tax-saving investment to simulate", "তুলনার জন্য অতিরিক্ত করসাশ্রয়ী বিনিয়োগ")} aria-describedby="tax-planner-rebate-slider-help" aria-valuetext={bdt(scenario?.amount || "0", locale)}
              min={0} max={maximum || 1} step={0.01} value={Math.min(maximum, sliderAmount)} disabled={!sliderReady}
              onKeyDown={() => setDiscoverSlider(false)} onPointerDown={() => setDiscoverSlider(false)}
              onChange={(event) => { setDiscoverSlider(false); change({ scenario: { ...(scenario?.mode === "confirmed_eligible_total" ? scenario : conditional()), amount: event.target.value }, scenarioConfirmed: true }); }} />
          </div>{maximum > 0 && <div className="wealth-tax-slider-markers" aria-hidden="true">{markers.map((value, i) => <span className={`wealth-tax-slider-marker wealth-tax-slider-marker--${i === 0 ? "start" : i === 3 ? "end" : "middle"}${i === 3 ? " wealth-tax-slider-marker--max" : ""}`} style={{ left: i * 100 / 3 + "%" }} key={i}><span className="wealth-tax-slider-marker-tick" /><span className="wealth-tax-slider-marker-label">{bdt(Math.round(value).toString(), locale)}</span></span>)}</div>}</div>
        </div>}
        </div>
        <div className="wealth-tax-play-metrics wealth-tax-play-metrics-action">
          <div className="wealth-tax-play-metric wealth-tax-metric-current"><span>{t("Current Tax", "এখনকার কর")}</span><strong>{display(base?.annual_liability)}</strong></div>
          <div className="wealth-tax-play-metric wealth-tax-metric-saved"><span>{t("Further Eligible Investment Needed", "আরও যোগ্য বিনিয়োগ প্রয়োজন")}</span><strong>{display(remaining)}</strong></div>
          <div className="wealth-tax-play-metric wealth-tax-metric-unlocked"><span>{result?.scenario ? t("Additional Annual Tax Saving", "অতিরিক্ত বার্ষিক করসাশ্রয়") : t("Potential Additional Annual Tax Saving", "সম্ভাব্য অতিরিক্ত বার্ষিক করসাশ্রয়")}</span><strong>{display(result?.scenario ? result.scenario.annual_saving : base?.rebate.potential_additional_tax_saving)}</strong></div>
        </div>
      </div>
    </div>
  </section>;
}
