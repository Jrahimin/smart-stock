import type { AppLocale } from "@/lib/locale/app-locale";
import { openTaxPlannerGuide } from "@/features/guide/components/tax-planner-guide-launcher";
import type { RulePack, YearSummary } from "./contracts";
import { bdt, Button, dateLabel, Rows, translator } from "./fields";
import { RuleSources, sourceHref } from "./rule-sources";
import css from "./tax.module.css";

export function PlannerGuide({ rules, identity, locale, onStartTour }: { rules: RulePack; identity: YearSummary; locale: AppLocale; onStartTour?: () => void }) {
  const t = translator(locale), m = (v: string) => bdt(v, locale);
  return <section className={css.panel + " " + css.stack} aria-labelledby="tax-v2-help-title">
    <div className={css.row}><h2 id="tax-v2-help-title">{t("Tax planner guide", "কর পরিকল্পনার নির্দেশিকা")}</h2>
      <Button onClick={() => { onStartTour?.(); requestAnimationFrame(openTaxPlannerGuide); }}>{t("Start five-step tour", "পাঁচ ধাপের পরিচিতি শুরু করুন")}</Button></div>
    <div className={css.explainHero}><span aria-hidden="true">✧</span><div><h3>{t("A little clarity goes a long way", "সহজ করে জানুন, নিশ্চিন্তে পরিকল্পনা করুন")}</h3><p>{t("Explore a topic, check the official source, then return to your plan. Your numbers stay right where you left them.", "বিষয় বেছে জানুন, সরকারি উৎস মিলিয়ে নিন, তারপর হিসাবে ফিরুন। আপনার দেওয়া অঙ্ক আগের জায়গাতেই থাকবে।")}</p></div></div>
    <div className={css.explainMetrics}><div><small>{t("General threshold", "সাধারণ করমুক্ত সীমা")}</small><strong>{m(rules.thresholds.general)}</strong></div><div><small>{t("Investment rebate rate", "বিনিয়োগে রেয়াতের হার")}</small><strong>{rules.rebate.investment_rate}%</strong></div><div><small>{t("Ordinary minimum tax", "সাধারণ ন্যূনতম কর")}</small><strong>{m(rules.minimum_tax.ordinary)}</strong></div></div>
    <p className={css.muted}>{t("Rules reviewed on ", "নিয়ম যাচাইয়ের তারিখ ")}{dateLabel(rules.reviewed_on, locale)}</p>
    <details className={css.detail}>
      <summary>{t("Rules for this year", "এই করবর্ষের নিয়ম")}</summary>
      <Rows items={[
        [t("General tax-free threshold", "সাধারণ করমুক্ত সীমা"), m(rules.thresholds.general)],
        [t("Salary exemption cap", "বেতনের করমুক্ত অংশের সর্বোচ্চ সীমা"), m(rules.employment_exemption_cap)],
        [t("Rebate limits", "রেয়াতের সীমা"), rules.rebate.income_rate + "% · " + rules.rebate.investment_rate + "% · " + m(rules.rebate.statutory_cap)],
        [t("Ordinary minimum / eligible new taxpayer minimum", "সাধারণ ন্যূনতম কর / যোগ্য নতুন করদাতার ন্যূনতম কর"), m(rules.minimum_tax.ordinary) + " / " + m(rules.minimum_tax.eligible_new_taxpayer)],
        [t("Domestic dividend special rate", "দেশীয় লভ্যাংশে বিশেষ হার"), rules.dividend_rate + "%"],
      ]} />
      <p>{t("The personal threshold sets the ordinary zero-rate band. It is not subtracted from the rebate income base. The rebate applies the lowest relevant income, investment and statutory limits. The minimum can still limit the tax reduction.", "ব্যক্তিগত সীমা সাধারণ করের শূন্য হারের অংশ নির্ধারণ করে। রেয়াতের আয়ের ভিত্তি থেকে এই সীমা বাদ যায় না। আয়, বিনিয়োগ ও আইনি সীমার মধ্যে প্রযোজ্য সর্বনিম্নটি রেয়াত নির্ধারণ করে। ন্যূনতম করের কারণে কর হ্রাস সীমিত হতে পারে।")}</p>
      <p>{t("Confirm eligibility for the new taxpayer minimum using this year's official rules. First-return timing is a separate question. A new TIN or first use of this planner does not establish eligibility.", "এই করবর্ষের সরকারি নিয়ম দেখে নতুন করদাতার ন্যূনতম করের যোগ্যতা নিশ্চিত করুন। প্রথম রিটার্নের সময় আলাদা বিষয়। নতুন টিআইএন বা প্রথমবার এই হিসাব ব্যবহার যোগ্যতার প্রমাণ নয়।")}</p>
    </details>
    <details className={css.detail}>
      <summary>{t("Eligible payments and shared caps", "যোগ্য পরিশোধ ও সম্মিলিত সীমা")}</summary>
      <p>{t("For annual planning, choose the relevant Investment categories and enter their eligible yearly amounts. Shared DPS and government-security limits apply automatically. For insurance, provident funds and approved donations, enter the eligible portion after their conditions; the planner does not verify documents from an amount alone. One eligible total, category amounts and checked contribution records are alternative methods. Only the selected method counts; inactive amounts and dates are retained. Check a contribution to verify conditions, dates and approved recipients, including for an annual-only year. Ordinary Zakat is not automatically eligible.", "বার্ষিক পরিকল্পনায় প্রাসঙ্গিক Investment-এর শ্রেণি বেছে যোগ্য বার্ষিক অঙ্ক দিন। ডিপিএস ও সরকারি সিকিউরিটিজের সম্মিলিত সীমা স্বয়ংক্রিয়ভাবে প্রযোজ্য। বীমা, ভবিষ্য তহবিল ও অনুমোদিত অনুদানে শর্তের পর যোগ্য অংশ দিন; শুধু অঙ্ক থেকে নথি যাচাই হয় না। একটি যোগ্য মোট, শ্রেণির অঙ্ক ও যাচাই করা পৃথক জমা বিকল্প পদ্ধতি। শুধু বাছাই করা পদ্ধতি হিসাবে ধরা হয়; অন্য অঙ্ক ও তারিখ রাখা থাকে। বার্ষিক হিসাবেও পৃথক জমার শর্ত, তারিখ ও অনুমোদিত প্রাপক যাচাই করতে পারেন। সাধারণ Zakat স্বয়ংক্রিয়ভাবে যোগ্য নয়।")}</p>
      <Rows items={[[t("DPS shared cap", "ডিপিএসের সম্মিলিত সীমা"), m(rules.dps_cap)], [t("Government securities shared cap", "সরকারি সিকিউরিটিজের সম্মিলিত সীমা"), m(rules.government_securities_cap)], [t("Life premium limit as a share of actual sum assured", "প্রকৃত বীমাকৃত অঙ্কের অনুপাতে জীবন বীমা প্রিমিয়ামের সীমা"), rules.life_insurance_sum_assured_rate + "%"]]} />
      <p>{t("New eligible listed investments may qualify; existing holdings and ordinary deposit principal do not. Review the category, date and allowed amount before using a confirmed total. Enter qualified CZM bank transfers as a deduction separately.", "নতুন যোগ্য তালিকাভুক্ত বিনিয়োগ গণ্য হতে পারে; আগের বিনিয়োগ ও সাধারণ আমানতের মূলধন গণ্য নয়। নিশ্চিত মোট দেওয়ার আগে শ্রেণি, তারিখ ও যোগ্য অঙ্ক দেখুন। যোগ্য সিজেডএম ব্যাংক ট্রান্সফার আলাদা বিয়োজন হিসেবে দিন।")}</p>
    </details>
    <details className={css.detail}>
      <summary>{t("Annual liability and filing balance", "বার্ষিক করদায় ও দাখিলের বাকি কর")}</summary>
      <p>{t("Enter gross interest or dividends before withholding. Add tax actually paid under Credits. First-return timing and new taxpayer minimum eligibility are separate questions. Special regimes, uncertain credits, or filing exceptions may require review.", "উৎসে কর কাটার আগে মোট সুদ বা লভ্যাংশ দিন। প্রকৃত পরিশোধিত কর সমন্বয় অংশে দিন। প্রথম রিটার্নের সময় এবং নতুন করদাতার ন্যূনতম করের যোগ্যতা আলাদা। বিশেষ নিয়ম, অনিশ্চিত কর সমন্বয় বা দাখিল ব্যতিক্রম যাচাই করতে হতে পারে।")}</p>
      <p>{t("Enter eligible financial expenses separately under the income source. Keep withholding out of expenses. Verify deductions against sections 64–65; uncertain eligibility or a financial loss needs review.", "যোগ্য আর্থিক ব্যয় সংশ্লিষ্ট আয়ের সঙ্গে আলাদাভাবে দিন। ব্যয়ে উৎসে কাটা কর রাখবেন না। ধারা ৬৪–৬৫ অনুযায়ী বিয়োজন যাচাই করুন; যোগ্যতা অনিশ্চিত হলে বা আর্থিক ক্ষতি থাকলে পর্যালোচনা প্রয়োজন।")}</p>
      <div className={css.stack}><RuleSources rules={rules} ruleId="income.ordinary" t={t} provision="sections 64 and 65" /></div>
      <p>{t("Quick and Detailed share the same conditional annual estimate: unanswered special-case questions are assumed not to apply, with the regular taxpayer minimum. Your answers remain unconfirmed until you verify them. Explicit special cases and unresolved category eligibility still require review. Filing balances require verified scope, salary valuation and credit details.", "দ্রুত ও বিস্তারিত অংশে একই শর্তসাপেক্ষ বার্ষিক হিসাব থাকে: উত্তর না দেওয়া বিশেষ পরিস্থিতি প্রযোজ্য নয় এবং সাধারণ ন্যূনতম কর ধরা হয়। যাচাই না করা পর্যন্ত আপনার উত্তর অনিশ্চিতই থাকে। প্রযোজ্য বিশেষ পরিস্থিতি ও শ্রেণির অজানা যোগ্যতা যাচাই প্রয়োজন। দাখিলের বাকি করের জন্য প্রযোজ্যতা, বেতনের মূল্যায়ন ও কর সমন্বয় যাচাই করতে হবে।")}</p>
      {rules.filing_windows.length > 0 && <Rows items={rules.filing_windows.map((win) => [
        dateLabel(win.start, locale) + " – " + dateLabel(win.end, locale),
        win.policy === "neutral" ? t("No adjustment", "সমন্বয় নেই") : win.rate + "% · " + (win.policy === "incentive" ? t("incentive, maximum ", "প্রণোদনা, সর্বোচ্চ ") : t("addition, minimum ", "অতিরিক্ত কর, সর্বনিম্ন ")) + m(win.limit),
      ])} />}
    </details>
    <details className={css.detail}>
      <summary>{t("Year dates and investment comparisons", "করবর্ষের তারিখ ও বিনিয়োগের তুলনা")}</summary>
      <p>{dateLabel(identity.income_period_start, locale)} – {dateLabel(identity.income_period_end, locale)}</p>
      <p>{t("Enter your full-year income and compare additional eligible investments using the active rules. The administrator handles rule updates.", "আপনার বার্ষিক আয় দিন এবং সক্রিয় নিয়মে অতিরিক্ত যোগ্য বিনিয়োগের প্রভাব দেখুন। নিয়ম হালনাগাদ করেন প্রশাসক।")}</p>
    </details>
    <details className={css.detail}>
      <summary>{t("Records and official sources", "নথি ও সরকারি উৎস")}</summary>
      <p>{t("Consult salary statements, interest and dividend certificates, investment and premium records, and tax payment records. No upload is needed. Check the official rules for unsupported income or filing cases.", "বেতনের বিবরণী, সুদ ও লভ্যাংশের সনদ, বিনিয়োগ ও প্রিমিয়ামের নথি এবং কর পরিশোধের নথি দেখুন। আপলোডের প্রয়োজন নেই। সমর্থিত নয় এমন আয় বা রিটার্নের জন্য সরকারি নিয়ম দেখুন।")}</p>
      <ul className={css.sourceCards}>{rules.sources.map((source) => <li key={source.id}><span className={css.sourceMark} aria-hidden="true">PDF ↗</span><a href={sourceHref(source)} target="_blank" rel="noreferrer">{source.public_edition ?? t("Official PDF", "সরকারি পিডিএফ")}</a>
        {" · "}{t("Evidence edition", "যাচাইকৃত সংস্করণ")}: {source.edition}</li>)}</ul>
    </details>
    <a href="https://etaxnbr.gov.bd/" target="_blank" rel="noreferrer">{t("Open NBR e-Return", "এনবিআর ই-রিটার্ন খুলুন")}</a>
  </section>;
}

