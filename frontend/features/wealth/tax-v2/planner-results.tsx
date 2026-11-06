import type { AppLocale } from "@/lib/locale/app-locale";
import type { Guidance, RulePack, TaxResult } from "./contracts";
import { hasMoney } from "./facts";
import { bdt, Button, dateLabel, Rows, translator } from "./fields";
import { coverageNames, incomeNames } from "./planner-form";
import { RuleSources } from "./rule-sources";
import { sumMoney, TaxSnapshot } from "./planner-template";
import { InfoDialog } from "./info-dialog";
import css from "./tax.module.css";

const messages: Record<string, [string, string]> = {
  resident_individual_scope_needed: ["This planner covers supported resident individual cases.", "এই পরিকল্পক নিবাসী ব্যক্তির সমর্থিত পরিস্থিতি হিসাব করে।"],
  senior_qualification_needed: ["Confirm whether the senior threshold applies for this year.", "এই করবর্ষে প্রবীণ করমুক্ত সীমা প্রযোজ্য কি না নিশ্চিত করুন।"],
  dependent_claim_confirmation_needed: ["Confirm there is no duplicate dependent claim.", "নির্ভরশীলের জন্য দ্বৈত দাবি নেই বলে নিশ্চিত করুন।"],
  dependent_duplicate_claim_excluded: ["The duplicate dependent claim was excluded.", "নির্ভরশীলের দ্বৈত দাবি বাদ দেওয়া হয়েছে।"],
  user_confirmed_eligible_investment_total: ["Treats your entered eligible total as a planning assumption.", "আপনার দেওয়া যোগ্য মোট ধরে পরিকল্পনার হিসাব হয়েছে।"],
  new_taxpayer_floor_confirmation_needed: ["Verify eligibility for the new taxpayer minimum.", "নতুন করদাতার ন্যূনতম করের যোগ্যতা যাচাই করুন।"],
  conditional_minimum_tax: ["The applicable minimum depends on new taxpayer eligibility.", "ন্যূনতম কর নতুন করদাতার যোগ্যতার ওপর নির্ভর করে।"],
  minimum_tax_binding: ["The applicable minimum limits the usable rebate.", "প্রযোজ্য ন্যূনতম করের কারণে ব্যবহারযোগ্য রেয়াত সীমিত।"],
  credits_completeness_needed: ["Confirm whether all credits are entered or there are none.", "সব কর সমন্বয় দেওয়া হয়েছে বা কোনো সমন্বয় নেই বলে নিশ্চিত করুন।"],
  credit_for_another_assessment_year: ["A payment for another assessment year was excluded.", "অন্য করবর্ষের পরিশোধ বাদ দেওয়া হয়েছে।"],
  credit_source_restriction_review: ["The source or credit restriction needs review.", "উৎস বা কর সমন্বয়ের সীমাবদ্ধতা যাচাই প্রয়োজন।"],
  credit_payment_date_review: ["Verify that this payment date qualifies for the selected return.", "নির্বাচিত রিটার্নের জন্য পরিশোধের তারিখটি যোগ্য কি না যাচাই করুন।"],
  credit_claim_confirmation_needed: ["Confirm this claim against your tax payment record.", "কর পরিশোধের নথি থেকে এই দাবি নিশ্চিত করুন।"],
  filing_date_outside_supported_windows: ["This date is outside the supported filing windows.", "তারিখটি সমর্থিত রিটার্ন দাখিলের সময়ের বাইরে।"],
  nonpositive_balance_window_review: ["A zero or excess-credit balance in this filing window needs review.", "এই দাখিল সময়ে শূন্য বাকি বা অতিরিক্ত কর সমন্বয় যাচাই করতে হবে।"],
  first_return_review: ["Confirm whether first-return treatment applies.", "প্রথম রিটার্নের বিশেষ নিয়ম প্রযোজ্য কি না নিশ্চিত করুন।"],
  return_from_abroad_exception_review: ["Confirm the return-from-abroad exception.", "বিদেশ থেকে ফেরার ব্যতিক্রম যাচাই করুন।"],
  extension_or_other_exception_review: ["Confirm any extension or other filing exception.", "সময় বৃদ্ধি বা অন্য দাখিল ব্যতিক্রম যাচাই করুন।"],
  scenario_confirmed_increment_after_caps: ["Uses your confirmed hypothetical amount after caps.", "সীমা প্রয়োগের পর আপনার নিশ্চিত সম্ভাব্য অঙ্ক ব্যবহার করা হয়েছে।"],
  scenario_scope_review: ["Complete the affected facts before comparing annual liabilities.", "বার্ষিক কর তুলনা করার আগে প্রাসঙ্গিক তথ্য সম্পূর্ণ করুন।"],
  no_eligible_increment: ["No additional contribution qualifies in this scenario.", "এই সম্ভাব্য হিসাবে অতিরিক্ত জমা যোগ্য নয়।"],
  no_additional_usable_rebate: ["The additional contribution does not reduce estimated annual tax.", "অতিরিক্ত জমায় প্রাক্কলিত বার্ষিক কর কমছে না।"],
  income_outside_period: ["Income outside the selected period was excluded.", "নির্বাচিত আয়কালের বাইরের আয় বাদ দেওয়া হয়েছে।"],
  mixed_private_salary_bases: ["Review the mix of gross and already taxable private salary.", "মোট ও আগে হিসাব করা করযোগ্য বেতন একসঙ্গে দেওয়া হয়েছে কি না দেখুন।"],
  precomputed_taxable_income: ["Uses the taxable amount you supplied.", "আপনার দেওয়া করযোগ্য অঙ্ক ব্যবহার করা হয়েছে।"],
  precomputed_ordinary_treatment_unconfirmed: ["Confirm the ordinary tax treatment of the supplied taxable amount.", "দেওয়া করযোগ্য অঙ্কে সাধারণ করের নিয়ম প্রযোজ্য বলে নিশ্চিত করুন।"],
  employment_benefit_valuation_needed: ["Confirm that noncash employment benefits have been valued.", "চাকরির নগদবহির্ভূত সুবিধার মূল্য নির্ধারণ হয়েছে কি না নিশ্চিত করুন।"],
  business_turnover_or_regime_review: ["Review gross receipts and any turnover minimum or special business regime.", "মোট প্রাপ্তি, টার্নওভারভিত্তিক ন্যূনতম কর বা বিশেষ ব্যবসার নিয়ম যাচাই করুন।"],
  financial_income_treatment_unconfirmed: ["Confirm the gross amount and its tax treatment.", "মোট অঙ্ক এবং প্রযোজ্য করের নিয়ম নিশ্চিত করুন।"],
  financial_expense_not_eligible: ["This financial expense was excluded because it does not qualify.", "যোগ্য নয় বলে এই আর্থিক ব্যয় বাদ দেওয়া হয়েছে।"],
  financial_expense_qualification_needed: ["Confirm whether this expense qualifies for this source.", "এই উৎসের জন্য ব্যয়টি বিয়োজনযোগ্য কি না নিশ্চিত করুন।"],
  financial_expense_loss_review: ["Expenses exceed this source's gross income. Review the loss and any offset before filing.", "ব্যয় এই উৎসের মোট আয়ের বেশি। রিটার্নের আগে ক্ষতি ও সম্ভাব্য সমন্বয় যাচাই করুন।"],
  unrealized_gain_excluded: ["Unrealized gains were excluded.", "বিক্রি না করা সম্পদের লাভ বাদ দেওয়া হয়েছে।"],
  listed_disposal_qualification_needed: ["Check that this listed disposal qualifies.", "তালিকাভুক্ত সম্পদের এই বিক্রি যোগ্য কি না দেখুন।"],
  fund_gain_excess_rate_review: ["Confirm the rate on fund gains above the exemption.", "করমুক্ত সীমার বেশি ফান্ডের লাভে প্রযোজ্য হার নিশ্চিত করুন।"],
  deduction_outside_period: ["A donation outside the selected period was excluded.", "নির্বাচিত আয়কালের বাইরের অনুদান বাদ দেওয়া হয়েছে।"],
  czm_qualified_transfer_needed: ["Confirm that the CZM donation was a qualifying bank transfer.", "সিজেডএম অনুদান যোগ্য ব্যাংক ট্রান্সফার ছিল বলে নিশ্চিত করুন।"],
  czm_unqualified_transfer: ["The CZM payment does not qualify for this deduction.", "সিজেডএম পরিশোধটি আয় থেকে বাদ দেওয়ার যোগ্য নয়।"],
  part2_other_donation_claims_review: ["Review all claims that share the Part 2 donation limit.", "দ্বিতীয় অংশের সম্মিলিত অনুদান সীমার সব দাবি যাচাই করুন।"],
  part2_donation_limit_exceeded: ["The donation exceeds the supported aggregate income limit and needs review.", "অনুদান আয়ের সম্মিলিত সীমার বেশি; যাচাই প্রয়োজন।"],
  czm_special_income_allocation_needed: ["Review the deduction where ordinary and special income interact.", "সাধারণ ও বিশেষ আয় একসঙ্গে থাকলে এই বিয়োজন যাচাই করুন।"],
  czm_exceeds_ordinary_income: ["The deduction exceeds ordinary income.", "বাদ দেওয়ার অঙ্ক সাধারণ আয়ের চেয়ে বেশি।"],
  premature_encashment_review: ["Review whether early encashment affects current or earlier rebate.", "মেয়াদের আগে ভাঙালে বর্তমান বা আগের রেয়াতে প্রভাব পড়ে কি না দেখুন।"],
  contribution_outside_period: ["A contribution outside the active income period was excluded.", "সক্রিয় আয়কালের বাইরের জমা বাদ দেওয়া হয়েছে।"],
  investment_ineligible: ["This payment is excluded from eligible investments.", "এই পরিশোধ যোগ্য বিনিয়োগ থেকে বাদ দেওয়া হয়েছে।"],
  investment_qualification_needed: ["Confirm the investment meets its category rules.", "বিনিয়োগটি তার শ্রেণির নিয়ম পূরণ করে কি না নিশ্চিত করুন।"],
  new_investment_confirmation_needed: ["Confirm that this is a new investment in the selected period.", "নির্বাচিত আয়কালে এটি নতুন বিনিয়োগ বলে নিশ্চিত করুন।"],
  existing_holding_excluded: ["Existing holdings were excluded from new investment.", "আগের বিনিয়োগ নতুন বিনিয়োগ হিসেবে ধরা হয়নি।"],
  investment_shared_cap: ["A shared category limit reduced the eligible amount.", "শ্রেণির সম্মিলিত সীমায় যোগ্য অঙ্ক কমেছে।"],
  planning_category_eligible_amount: ["Annual category amounts are assumed eligible after category conditions. Shared caps are applied by the planner; payment dates and evidence are not verified.", "শ্রেণির শর্তের পর বার্ষিক অঙ্ক যোগ্য ধরা হয়েছে। সম্মিলিত সীমা পরিকল্পক প্রয়োগ করেছে; পরিশোধের তারিখ ও প্রমাণ যাচাই হয়নি।"],
  planning_investments_need_filing_verification: ["Verify individual investment payments before estimating a filing balance. Amount-only planning entries are not verified filing claims.", "দাখিলের বাকি করের আগে পৃথক বিনিয়োগ পরিশোধ যাচাই করুন। শুধু অঙ্ক দেওয়া পরিকল্পনার তথ্য যাচাইকৃত রিটার্ন দাবি নয়।"],
  insurance_relationship_or_payment_ineligible: ["The insured relationship or payment location is ineligible.", "বীমাকৃত ব্যক্তির সম্পর্ক বা পরিশোধের স্থান যোগ্য নয়।"],
  insurance_relationship_or_payment_needed: ["Verify the insured relationship and where payment is made.", "বীমাকৃত ব্যক্তির সম্পর্ক ও পরিশোধের স্থান যাচাই করুন।"],
  insurance_sum_assured_or_policy_needed: ["Enter the sum assured and a policy nickname.", "বীমাকৃত অঙ্ক ও পলিসির ছোট নাম দিন।"],
  insurance_sum_assured_cap: ["The sum assured limits the eligible premium.", "বীমাকৃত অঙ্কের কারণে যোগ্য প্রিমিয়াম সীমিত।"],
  recognized_pf_certified_eligibility: ["Uses the certified eligible provident fund amount.", "সনদে উল্লেখিত যোগ্য ভবিষ্য তহবিলের অঙ্ক ব্যবহার করা হয়েছে।"],
  recognized_pf_eligibility_limit: ["The provident fund eligibility limit reduced the eligible amount.", "ভবিষ্য তহবিলের যোগ্যতা সীমায় যোগ্য অঙ্ক কমেছে।"],
  recognized_pf_certified_or_split_needed: ["Enter the certified amount or annual employee and employer contributions.", "সনদে উল্লেখিত অঙ্ক অথবা কর্মী ও নিয়োগকর্তার বার্ষিক জমা দিন।"],
  donation_recipient_approval_needed: ["Select the verified approved recipient.", "যাচাইকৃত অনুমোদিত প্রাপক বেছে নিন।"],
  donation_outside_approval_period: ["The payment falls outside the recipient's approval period.", "পরিশোধের তারিখ প্রাপকের অনুমোদিত সময়ের বাইরে।"],
};
export function guidanceText(item: Pick<Guidance, "message_id" | "field_path">, locale: AppLocale) {
  const t = translator(locale), key = item.message_id;
  if (messages[key]) return t(...messages[key]);
  if (key.startsWith("coverage_")) {
    const field = item.field_path?.split(".").at(-1) as keyof typeof coverageNames | undefined;
    if (field && coverageNames[field]) return t("Review: ", "যাচাই করুন: ") + t(...coverageNames[field]);
  }
  if (key.startsWith("income_review_")) {
    const kind = key.slice("income_review_".length) as keyof typeof incomeNames;
    if (incomeNames[kind]) return t("This source needs separate review: ", "এই উৎস আলাদা যাচাই প্রয়োজন: ") + t(...incomeNames[kind]);
  }
  return t("Review this item against the applicable official rule.", "প্রযোজ্য সরকারি নিয়ম অনুযায়ী এই তথ্য যাচাই করুন।");
}

export function PlannerResults({ result, rules, locale, onEdit, conditional = false }: { result: TaxResult; rules: RulePack; locale: AppLocale; onEdit: (path: string) => void; conditional?: boolean }) {
  const t = translator(locale), m = (v: string | null) => v === null ? "—" : bdt(v, locale);
  const { base, scenario } = result;
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
  return <section aria-labelledby="tax-v2-result-title" className="wealth-tax-results">
    <TaxSnapshot result={result} locale={locale} conditional={conditional} rules={rules} />
    {!available && <p className={css.notice}>{t("Annual liability is incomplete. Review the facts below.", "বার্ষিক করদায়ের হিসাব অসম্পূর্ণ। নিচের তথ্য যাচাই করুন।")}</p>}
    <div className={css.filingBalance}>
      <h3>{t("Estimated balance at filing", "দাখিলের সময় আনুমানিক বাকি কর")}</h3>
      {settlement ? <p className={css.amount}>{m(base.estimated_payable)}</p> : <p className={css.muted}>
        {base.settlement_status === "not_available_for_year" ? t("Filing calculations are unavailable for this year.", "এই করবর্ষে দাখিলের হিসাব পাওয়া যাচ্ছে না।")
          : base.settlement_status === "not_requested" ? t("An annual estimate does not include the filing balance. Add filing details and confirm your credits.", "বার্ষিক হিসাবে দাখিলের বাকি কর থাকে না। দাখিলের তথ্য দিন এবং কর সমন্বয় নিশ্চিত করুন।")
          : t("A filing balance cannot be estimated until the relevant facts are reviewed.", "প্রাসঙ্গিক তথ্য যাচাই না করা পর্যন্ত দাখিলের বাকি কর হিসাব করা যাবে না।")}
      </p>}
      {settlement && base.excess_credits && hasMoney(base.excess_credits) && <p>{t("Excess eligible credits (not a refund approval): ", "অতিরিক্ত যোগ্য কর সমন্বয় (ফেরতের অনুমোদন নয়): ")}{m(base.excess_credits)}</p>}
    </div>
    {base.missing_facts.length > 0 && <div className={css.stack}><h3>{t("What to review", "যা যাচাই করবেন")}</h3>{notes(base.missing_facts, true)}</div>}
    <InfoDialog title={t("Calculation details and sources", "হিসাবের বিবরণ ও উৎস")} subtitle={t("Follow the numbers · explore the official rules", "ধাপে ধাপে হিসাব · সরকারি নিয়ম দেখুন")} icon="▤">
    {conditional && <p className={css.dialogIntro}>{t("Conditional annual estimate: unanswered special cases are assumed not to apply, the regular minimum is used, and the gross salary example includes taxable noncash benefits. These assumptions do not confirm your saved facts or establish a filing balance.", "শর্তসাপেক্ষ বার্ষিক হিসাব: উত্তর না দেওয়া বিশেষ পরিস্থিতি প্রযোজ্য নয়, সাধারণ ন্যূনতম কর এবং মোট বেতনের নমুনায় করযোগ্য নগদবহির্ভূত সুবিধা অন্তর্ভুক্ত ধরা হয়েছে। এতে সংরক্ষিত তথ্য নিশ্চিত হয় না বা দাখিলের বাকি কর নির্ধারিত হয় না।")}</p>}
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
        <Rows items={[[t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Eligible", "যোগ্য"), m(row.eligible_amount)], [t("Excluded", "বাদ"), m(row.excluded_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
      {base.income_deductions.map((row) => <div className={css.detail} key={row.id}><h3>{t("CZM deduction", "সিজেডএম বিয়োজন")}</h3><Rows items={[[t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Allowed", "গ্রহণযোগ্য"), m(row.allowed_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
    </details>
    <details className={css.detail}><summary>{t("Credits and filing adjustment", "কর সমন্বয় ও দাখিল সমন্বয়")}</summary>
      <Rows items={[[t("Eligible credits entered", "দেওয়া যোগ্য কর সমন্বয়"), m(base.allowed_credits)], [t("Restricted or excluded credits", "সীমিত বা বাদ দেওয়া কর সমন্বয়"), m(base.restricted_credits)], [t("Balance before adjustment", "সমন্বয়ের আগে বাকি কর"), m(base.section_173_balance)], [t("Filing adjustment", "দাখিল সমন্বয়"), m(base.filing_adjustment)]]} />
      {base.credits.map((row, index) => <div className={css.detail} key={row.id}><h3>{t("Payment ", "পরিশোধ ")}{index + 1}</h3>
        <Rows items={[[t("Entered", "দেওয়া হয়েছে"), m(row.entered_amount)], [t("Allowed", "গ্রহণযোগ্য"), m(row.allowed_amount)], [t("Restricted", "সীমিত"), m(row.restricted_amount)]]} />
        {row.reason_codes.length > 0 && <p className={css.muted}>{reasonList(row.reason_codes)}</p>}</div>)}
    </details>
    {available && base.rebate.potential_additional_tax_saving && hasMoney(base.rebate.potential_additional_tax_saving) && <p className={css.muted}>
      {t("Conditional eligible amount to reach the lowest usable liability: ", "ব্যবহারযোগ্য সর্বনিম্ন করদায়ে পৌঁছাতে শর্তসাপেক্ষ যোগ্য অঙ্ক: ")}{m(base.rebate.additional_eligible_investment_for_lowest_usable_liability)}
      {" · "}{t("Potential annual reduction: ", "সম্ভাব্য বার্ষিক কর হ্রাস: ")}{m(base.rebate.potential_additional_tax_saving)}
    </p>}
    {scenario && <div className={css.card + " " + css.stack}>
      <h3>{t("Scenario comparison", "সম্ভাব্য হিসাবের তুলনা")}</h3>
      <Rows items={[[t("Eligible additional amount", "যোগ্য অতিরিক্ত অঙ্ক"), m(scenario.eligible_increment)], [t("Base annual liability", "মূল বার্ষিক করদায়"), m(base.annual_liability)],
        [t("Scenario annual liability", "সম্ভাব্য বার্ষিক করদায়"), m(scenario.breakdown.annual_liability)], [t("Usable annual savings", "ব্যবহারযোগ্য বার্ষিক সাশ্রয়"), m(scenario.annual_saving)],
        ...(scenario.settlement_saving !== null ? [[t("Estimated filing balance difference", "দাখিলের আনুমানিক বাকি করের পার্থক্য"), m(scenario.settlement_saving)] as const] : [])]} />
      {scenario.limiting_reason && <p>{guidanceText({ message_id: scenario.limiting_reason, field_path: null }, locale)}</p>}
      {scenario.breakdown.missing_facts.length > 0 && notes(scenario.breakdown.missing_facts, true)}
    </div>}
    {(base.assumptions.length > 0 || base.exclusions.length > 0 || base.guidance.length > 0) && <details className={css.detail}>
      <summary>{t("Assumptions, exclusions and sources", "ধারণা, বাদ দেওয়া তথ্য ও উৎস")}</summary>{notes([...base.assumptions, ...base.exclusions, ...base.guidance])}
    </details>}
    <details className={css.detail}><summary>{t("Revision details", "সংস্করণের বিবরণ")}</summary>
      <p className={css.muted}>{t("Rules reviewed on ", "নিয়ম যাচাইয়ের তারিখ ")}{dateLabel(result.rules_reviewed_on, locale)}</p>
      <p className={css.pre}>{result.revision_id} · {result.content_hash}</p>
    </details>
    </InfoDialog>
  </section>;
}

