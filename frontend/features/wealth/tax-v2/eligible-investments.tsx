import type { AppLocale } from "@/lib/locale/app-locale";
import type { Policy, RulePack } from "./contracts";
import { bdt, translator } from "./fields";
import { InfoDialog } from "./info-dialog";
import { RuleSources } from "./rule-sources";
import css from "./tax.module.css";

export function EligibleInvestments({ rules, policies, locale }: { rules: RulePack; policies: Policy[]; locale: AppLocale }) {
  const t = translator(locale);
  const rows = [...rules.investment_presentation].sort((a, b) => a.order - b.order)
    .map((item) => ({ ...item, policy: policies.find((policy) => policy.category === item.category) }))
    .filter((item) => item.policy && item.policy.policy !== "needs_review");
  function description(policy: Policy, category: string) {
    if (policy.cap_group === "dps") return t("Qualifying DPS contributions share an annual cap of ", "যোগ্য সব ডিপিএস জমার সম্মিলিত বার্ষিক সীমা ") + bdt(rules.dps_cap, locale);
    if (policy.cap_group === "government_securities") return t("Qualifying government securities and savings certificates share a cap of ", "যোগ্য সরকারি সিকিউরিটিজ ও সঞ্চয়পত্রের সম্মিলিত সীমা ") + bdt(rules.government_securities_cap, locale);
    if (policy.policy === "new_purchase") return t("New eligible purchases during the income period; existing holdings alone do not qualify.", "আয়কালে নতুন যোগ্য ক্রয়; শুধু পুরোনো বিনিয়োগ ধরে রাখলে যোগ্য হয় না।");
    if (category === "life_insurance") return t("Eligible premiums, limited to ", "যোগ্য প্রিমিয়ামের সীমা ") + rules.life_insurance_sum_assured_rate + t("% of actual sum assured, excluding bonus, per policy. Relationship and payment conditions apply.", "% প্রকৃত বীমা অঙ্কের, বোনাস ছাড়া, প্রতি পলিসিতে। সম্পর্ক ও পরিশোধের শর্ত প্রযোজ্য।");
    if (policy.policy === "annuity") return t("Qualifying deferred annuity payments for an eligible insured person, paid and payable in Bangladesh.", "যোগ্য বীমাকৃত ব্যক্তির জন্য বাংলাদেশে পরিশোধিত ও প্রদেয় যোগ্য ডেফার্ড অ্যানুইটি।");
    if (policy.policy === "recognized_pf") return t("Use the certified eligible amount or the verified employee/employer contribution split.", "সনদে দেওয়া যোগ্য অঙ্ক অথবা যাচাইকৃত কর্মী ও নিয়োগকর্তার জমার বিভাজন দিন।");
    if (policy.policy === "approved_recipient") return t("Only qualifying payments to an approved recipient within its approval dates. Check the approval in Detailed.", "অনুমোদনের মেয়াদে অনুমোদিত প্রাপকের যোগ্য জমা। বিস্তারিত অংশে অনুমোদন মিলিয়ে নিন।");
    return t("Qualifying contributions to the recognized or approved scheme. Keep the payment record and check category conditions in Detailed.", "স্বীকৃত বা অনুমোদিত প্রকল্পে যোগ্য জমা। পরিশোধের প্রমাণ রাখুন এবং বিস্তারিত অংশে শ্রেণির শর্ত মিলিয়ে নিন।");
  }
  return <InfoDialog title={t("What investments qualify?", "কোন বিনিয়োগে রেয়াত পাবেন?")} compact icon="✧">
    <div className={css.explainHero}><span aria-hidden="true">🌱</span><div><h3>{t("Make each eligible taka count", "যোগ্য প্রতি টাকায় সাশ্রয়ের সুযোগ")}</h3><p>{t("Eligibility comes first. Your actual tax saving also depends on income, rebate limits and minimum tax.", "আগে যোগ্যতা মিলিয়ে নিন। প্রকৃত সাশ্রয় আয়, রেয়াতের সীমা ও ন্যূনতম করের ওপরও নির্ভর করে।")}</p></div></div>
    <div className={css.explainMetrics}>
      <div><small>{t("Eligible investment rate", "যোগ্য বিনিয়োগের হার")}</small><strong>{rules.rebate.investment_rate}%</strong></div>
      <div><small>{t("Income-based rebate limit", "আয়ভিত্তিক রেয়াতের সীমা")}</small><strong>{rules.rebate.income_rate}%</strong></div>
      <div><small>{t("Maximum statutory rebate", "সর্বোচ্চ আইনি রেয়াত")}</small><strong>{bdt(rules.rebate.statutory_cap, locale)}</strong></div>
    </div>
    <div className={css.eligibilityGrid}>{rows.filter((item) => item.policy!.policy !== "excluded").map((item) => <article key={item.category} className={css.eligibilityCard}>
      <span className={css.eligibilityMark} aria-hidden="true">{item.policy!.policy === "insurance" ? "🛡️" : item.policy!.policy === "approved_recipient" ? "🤲" : item.policy!.cap_group ? "🏦" : "✦"}</span>
      <div><h3>{locale === "bn" ? item.label_bn : item.label_en}</h3><p>{description(item.policy!, item.category)}</p></div>
    </article>)}</div>
    <aside className={css.dialogIntro}><strong>{t("Not every saving is a rebate investment", "সব সঞ্চয়ে রেয়াত হয় না")}</strong><p>{rows.filter((item) => item.policy!.policy === "excluded").map((item) => locale === "bn" ? item.label_bn : item.label_en).join(" · ") || t("Ordinary savings and FDR principal do not qualify as rebate investments.", "সাধারণ সঞ্চয় ও এফডিআরের মূলধন রেয়াতের বিনিয়োগ হিসেবে যোগ্য নয়।")}</p></aside>
    <details className={css.detail}><summary>{t("Check the official rules", "সরকারি নিয়ম মিলিয়ে নিন")}</summary><RuleSources rules={rules} ruleId="rebate.general" t={t} /></details>
  </InfoDialog>;
}
