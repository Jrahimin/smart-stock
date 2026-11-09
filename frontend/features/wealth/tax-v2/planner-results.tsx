import type { AppLocale } from "@/lib/locale/app-locale";
import type { Guidance, RulePack, TaxResult } from "./contracts";
import { hasMoney } from "./facts";
import { bdt, Button, dateLabel, Rows, translator } from "./fields";
import { coverageNames, incomeNames } from "./planner-form";
import { RuleSources } from "./rule-sources";
import { AssumptionNotes, EstimateState, sumMoney, TaxSnapshot, type EstimatePresentation } from "./planner-template";
import { InfoDialog } from "./info-dialog";
import css from "./tax.module.css";
import { guidanceText } from "./guidance";
export { guidanceText } from "./guidance";


export function PlannerResults({ result, rules, locale, onEdit, conditional = false, presentation, onExploreSavings }: { result: TaxResult; rules: RulePack; locale: AppLocale; onEdit: (path: string) => void; conditional?: boolean; presentation?: EstimatePresentation; onExploreSavings?: () => void }) {
  const t = translator(locale), m = (v: string | null) => v === null ? "—" : bdt(v, locale);
  const { base } = result;
  const available = base.annual_status === "complete" && base.annual_liability !== null;
  const settlement = available && base.settlement_status === "complete" && base.estimated_payable !== null;
  const category = (key: string) => {
    const row = rules.investment_presentation.find((item) => item.category === key);
    return row ? locale === "bn" ? row.label_bn : row.label_en : t("Confirmed eligible total", "যোগ্য বিনিয়োগের নিশ্চিত মোট");
  };
  const notes = (items: Guidance[], edit = false) => <ul className={css.list}>{items.map((item, i) =>
    <li key={i} className={css.card + " " + css.stack}><span>{guidanceText(item, locale)}</span>
      {item.values.length > 0 && <span className={css.muted}>{item.values.map(([, value]) => m(value)).join(" · ")}</span>}
      {edit && item.field_path && <div><Button onClick={() => onEdit(item.field_path!)}>{t("Edit facts", "তথ্য বদলান")}</Button></div>}
      {rules.rule_references.some((rule) => rule.id === item.rule_id && rule.references.length > 0) && <details className={css.noteSources}>
        <summary>{t("Official source", "সরকারি উৎস")}</summary>
        <div className={css.stack}><RuleSources rules={rules} ruleId={item.rule_id} t={t} /></div>
      </details>}
    </li>)}</ul>;
  const reasonList = (codes: string[]) => codes.map((message_id) => guidanceText({ message_id, field_path: null }, locale)).join(" ");
  return <div className="wealth-tax-results">
    <TaxSnapshot result={result} locale={locale} conditional={conditional} rules={rules} presentation={presentation} onExploreSavings={onExploreSavings} />
    {!available && <p className={css.notice}>{base.annual_status === "unsupported" ? t("This situation needs separate tax review. Keep genuine income and facts in your entries; this planner cannot finish this calculation.", "এই পরিস্থিতির জন্য আলাদা কর পর্যালোচনা প্রয়োজন। প্রকৃত আয় ও তথ্য রেখে দিন; পরিকল্পক এই হিসাব সম্পূর্ণ করতে পারে না।") : t("Annual liability needs information or review. Check the affected facts below.", "বার্ষিক করের জন্য তথ্য বা যাচাই প্রয়োজন। নিচে সংশ্লিষ্ট তথ্য দেখুন।")}</p>}
    {base.settlement_status === "not_available_for_year" ? <p className={css.creditNote}>{t("Annual Tax excludes payment reconciliation under the active rules.", "সক্রিয় নিয়মে বার্ষিক করের হিসাবে পরিশোধের সমন্বয় নেই।")}</p> : <div className={css.filingBalance}>
      <h3>{t("Estimated balance at filing", "দাখিলের সময় আনুমানিক বাকি কর")}</h3>
      {settlement ? <p className={css.amount}>{m(base.estimated_payable)}</p> : <p className={css.muted}>
        {base.settlement_status === "not_requested" ? t("An annual estimate does not include the filing balance. Add filing details and confirm your credits.", "বার্ষিক হিসাবে দাখিলের বাকি কর থাকে না। দাখিলের তথ্য দিন এবং কর সমন্বয় নিশ্চিত করুন।")
          : t("A filing balance cannot be estimated until the relevant facts are reviewed.", "প্রাসঙ্গিক তথ্য যাচাই না করা পর্যন্ত দাখিলের বাকি কর হিসাব করা যাবে না।")}
      </p>}
      {settlement && base.excess_credits && hasMoney(base.excess_credits) && <p>{t("Excess eligible credits (not a refund approval): ", "অতিরিক্ত যোগ্য কর সমন্বয় (ফেরতের অনুমোদন নয়): ")}{m(base.excess_credits)}</p>}
    </div>}
    {base.missing_facts.length > 0 && <div className={css.stack}><h3>{t("What to review", "যা যাচাই করবেন")}</h3>{notes(base.missing_facts, true)}</div>}
    <div data-tax-calculation-details><InfoDialog title={t("Calculation details and sources", "হিসাবের বিবরণ ও উৎস")} subtitle={t("Follow the numbers · explore the official rules", "ধাপে ধাপে হিসাব · সরকারি নিয়ম দেখুন")} icon="▤">
    <EstimateState locale={locale} {...presentation} />
    <AssumptionNotes result={result} locale={locale} defaults={presentation?.defaults} />
    <div className={css.explainHero}><span aria-hidden="true">✦</span><div><h3>{t("Your tax, one step at a time", "আপনার কর, ধাপে ধাপে")}</h3><p>{t("Income → tax bands → investment rebate → minimum tax. Open a card to see what counted and why.", "আয় → করের ধাপ → বিনিয়োগ রেয়াত → ন্যূনতম কর। কীভাবে হিসাব হয়েছে জানতে কার্ড খুলুন।")}</p></div></div>
    <div className={css.explainMetrics}><div><small>{t("Income before allowance", "করমুক্ত সীমার আগে আয়")}</small><strong>{m(sumMoney([base.ordinary_income, base.special_rate_income]))}</strong></div><div><small>{t("Usable tax reduction", "ব্যবহারযোগ্য কর হ্রাস")}</small><strong>{m(base.rebate.effective_tax_reduction)}</strong></div><div><small>{t("Annual liability", "বার্ষিক করদায়")}</small><strong>{m(base.annual_liability)}</strong></div></div>
    <details className={css.detail}>
      <summary>{t("Income, allowance and tax bands", "আয়, করমুক্ত সীমা ও করের ধাপ")}</summary>
      {!available && <p className={css.muted}>{t("These are individual components. They do not add up to a verified liability.", "এগুলো আলাদা অংশ। এগুলো দিয়ে যাচাইকৃত মোট করদায় নির্ধারণ করা যায় না।")}</p>}
      <Rows items={[
        [t("Ordinary income after deductions", "বিয়োজনের পর সাধারণ আয়"), m(base.ordinary_income)],
        [t("Special-rate income", "বিশেষ হারের আয়"), m(base.special_rate_income)],
        [t("Personal tax-free threshold", "ব্যক্তিগত করমুক্ত সীমা"), m(base.allowance)],
        [t("Dependent addition", "নির্ভরশীলের জন্য অতিরিক্ত সীমা"), m(base.dependent_allowance)],
        [t("Ordinary income above threshold", "সীমার বেশি সাধারণ আয়"), m(base.ordinary_income_above_allowance)],
        [t("Ordinary tax", "সাধারণ কর"), m(base.ordinary_tax)],
        [t("Separate-rate tax", "আলাদা হারের কর"), m(base.special_tax)],
      ]} />
      {base.income.map((row) => <div className={css.detail} key={row.id}><h3>{incomeNames[row.kind as keyof typeof incomeNames] ? t(...incomeNames[row.kind as keyof typeof incomeNames]) : t("Income source", "আয়ের উৎস")}</h3>
        <Rows items={[[t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Excluded", "বাদ"), m(row.excluded_amount)], [
          ["bank_interest", "fdr_profit", "dps_profit", "savings_certificate_profit", "domestic_dividend"].includes(row.kind)
            ? t("Eligible financial expenses", "যোগ্য আর্থিক ব্যয়") : t("Deducted", "বিয়োজন"), m(row.deductible_amount)
        ], [t("Taxable", "করযোগ্য"), m(row.taxable_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
      <Rows items={base.slabs.map((row) => [row.rate + "% · " + m(row.taxable_amount), m(row.tax)])} />
    </details>
    <details className={css.detail}><summary>{t("Investments, deductions and rebate", "বিনিয়োগ, বিয়োজন ও রেয়াত")}</summary>
      <Rows items={[
        [t("Rebate income base", "রেয়াতের আয়ের ভিত্তি"), m(base.rebate_income_base)],
        [t("Eligible investments", "যোগ্য বিনিয়োগ"), m(base.eligible_investment)],
        [t("Income-based limit", "আয়ভিত্তিক সীমা"), m(base.rebate.income_limit)],
        [t("Investment-based limit", "বিনিয়োগভিত্তিক সীমা"), m(base.rebate.investment_limit)],
        [t("Statutory cap", "আইনি সীমা"), m(base.rebate.statutory_cap)],
        [t("Statutory rebate entitlement", "আইন অনুযায়ী প্রাপ্য রেয়াত"), m(base.rebate.entitlement)],
        [t("Reduction in this estimate", "এই হিসাবে কর কমেছে"), m(base.rebate.effective_tax_reduction)],
        ...(base.minimum_tax_binding ? [[t("Minimum tax top-up", "ন্যূনতম করের জন্য যোগ"), m(base.minimum_tax_top_up)] as const] : []),
      ]} />
      {base.investments.map((row) => <div className={css.detail} key={row.id}><h3>{category(row.category)}</h3>
        <Rows items={[[row.category === "dps" ? t("DPS amount you entered", "আপনার দেওয়া DPS-এর অঙ্ক") : t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Counted toward the rebate", "রেয়াতের হিসাবে ধরা হয়েছে"), m(row.eligible_amount)], [t("Excluded", "বাদ"), m(row.excluded_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
      {base.income_deductions.map((row) => <div className={css.detail} key={row.id}><h3>{t("CZM deduction", "সিজেডএম বিয়োজন")}</h3><Rows items={[[t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Allowed", "গ্রহণযোগ্য"), m(row.allowed_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
    </details>
    {(base.settlement_status !== "not_available_for_year" || base.credits.length > 0) && <details className={css.detail}><summary>{t("Credits and filing adjustment", "কর সমন্বয় ও দাখিল সমন্বয়")}</summary>
      <Rows items={[[t("Eligible credits entered", "দেওয়া যোগ্য কর সমন্বয়"), m(base.allowed_credits)], [t("Restricted or excluded credits", "সীমিত বা বাদ দেওয়া কর সমন্বয়"), m(base.restricted_credits)], [t("Balance before adjustment", "সমন্বয়ের আগে বাকি কর"), m(base.section_173_balance)], [t("Filing adjustment", "দাখিল সমন্বয়"), m(base.filing_adjustment)]]} />
      {base.credits.map((row, index) => <div className={css.detail} key={row.id}><h3>{t("Payment ", "পরিশোধ ")}{index + 1}</h3>
        <Rows items={[[t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Allowed", "গ্রহণযোগ্য"), m(row.allowed_amount)], [t("Restricted", "সীমিত"), m(row.restricted_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
    </details>}
    {available && base.rebate.potential_additional_tax_saving && hasMoney(base.rebate.potential_additional_tax_saving) && <p className={css.muted}>
      {t("Conditional eligible amount to reach the lowest usable liability: ", "ব্যবহারযোগ্য সর্বনিম্ন করদায়ে পৌঁছাতে শর্তসাপেক্ষ যোগ্য অঙ্ক: ")}{m(base.rebate.additional_eligible_investment_for_lowest_usable_liability)}
      {" · "}{t("Potential annual reduction: ", "সম্ভাব্য বার্ষিক কর হ্রাস: ")}{m(base.rebate.potential_additional_tax_saving)}
    </p>}
    {(base.assumptions.length > 0 || base.exclusions.length > 0 || base.guidance.length > 0) && <details className={css.detail}>
      <summary>{t("Assumptions, exclusions and sources", "ধারণা, বাদ দেওয়া তথ্য ও উৎস")}</summary>{notes([...base.assumptions, ...base.exclusions, ...base.guidance])}
    </details>}
    <details className={css.detail}><summary>{t("Revision details", "সংস্করণের বিবরণ")}</summary>
      <p className={css.muted}>{t("Rules reviewed on ", "নিয়ম যাচাইয়ের তারিখ ")}{dateLabel(result.rules_reviewed_on, locale)}</p>
      <p className={css.pre}>{result.revision_id} · {result.content_hash}</p>
    </details>
    </InfoDialog></div>
  </div>;
}

