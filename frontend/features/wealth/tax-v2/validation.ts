import type { AppLocale } from "@/lib/locale/app-locale";
import type { Issue } from "./facts";
import { translator } from "./fields";
import { coverageNames } from "./labels";

export function fieldIssueText(issue: Issue, locale: AppLocale) {
  const t = translator(locale), path = issue.path;
  const index = path.match(/\.(\d+)(?:\.|$)/)?.[1];
  const number = index === undefined ? "" : " " + (Number(index) + 1).toLocaleString(locale === "bn" ? "bn-BD" : "en-US");
  const coverage = path.startsWith("coverage.") ? coverageNames[path.slice(9) as keyof typeof coverageNames] : undefined;
  const subject = coverage ? t(...coverage) : path.startsWith("scenario") ? t("Proposed Investment", "প্রস্তাবিত বিনিয়োগ") : path.startsWith("income_deductions") ? t("Donation deduction", "অনুদানের বিয়োজন") + number : path.startsWith("income.") ? t("Income source", "আয়ের উৎস") + number : path.startsWith("credits") ? t("Tax payment", "কর পরিশোধ") + number : path.startsWith("filing") ? t("Filing details", "দাখিলের তথ্য") : path.startsWith("planning-investments") ? t("Investment category", "বিনিয়োগের শ্রেণি") + " · " + path.split(".").at(-1) : t("Investment or profile fact", "বিনিয়োগ বা পরিচয়ের তথ্য");
  const instruction = issue.code === "retired_category" ? t("This category is absent from the active rules. Keep it inactive to retain its amount and calculate the other categories.", "সক্রিয় নিয়মে এই শ্রেণি নেই। অঙ্ক রেখে অন্য শ্রেণির হিসাব করতে এটি নিষ্ক্রিয় করুন।")
    : issue.code === "scenario_method_conflict" ? t("Use checked records, or compare an eligible total with this entry method.", "যাচাই করা জমার তথ্য ব্যবহার করুন, অথবা এই পদ্ধতিতে যোগ্য মোট তুলনা করুন।")
    : issue.code?.includes("duplicate") ? t("This payment is duplicated. Keep each actual payment once.", "এই পরিশোধ একাধিকবার দেওয়া হয়েছে। প্রতিটি প্রকৃত পরিশোধ একবার রাখুন।")
    : path.includes("date") || path.endsWith("_on") ? t("Enter a valid date. Check the active period shown with the field.", "সঠিক তারিখ দিন। ঘরের সঙ্গে দেখানো সক্রিয় আয়কাল যাচাই করুন।")
    : path.includes("amount") || path.startsWith("planning-investments") || path.endsWith("gross_receipts") || path.includes("insurance_benefit") || path.endsWith("employee_annual") || path.endsWith("employer_annual") || path.endsWith("sum_assured_excluding_bonus") ? t("Enter a non-negative amount in BDT, with at most two decimal places.", "টাকায় শূন্য বা ধনাত্মক অঙ্ক দিন, দশমিকের পরে সর্বোচ্চ দুই ঘর।")
    : path.endsWith("income_id") ? t("Choose the income source linked to this payment.", "এই পরিশোধের সংশ্লিষ্ট আয়ের উৎস বেছে নিন।")
    : t("Review and confirm this required fact.", "এই প্রয়োজনীয় তথ্য যাচাই করে নিশ্চিত করুন।");
  const field = path.split(".").at(-1);
  const fields: Record<string, [string, string]> = {
    amount: ["Amount", "অঙ্ক"], excluded_group_insurance_benefit: ["Exempt group insurance", "করমুক্ত গ্রুপ বীমা"],
    gross_receipts: ["Gross receipts", "মোট প্রাপ্তি"], actual_sum_assured_excluding_bonus: ["Sum assured excluding bonus", "বোনাস ছাড়া বীমাকৃত অঙ্ক"],
    certified_eligible_amount: ["Certified eligible amount", "সনদে উল্লেখিত যোগ্য অঙ্ক"], employee_annual: ["Annual employee contribution", "কর্মীর বার্ষিক জমা"], employer_annual: ["Annual employer contribution", "নিয়োগকর্তার বার্ষিক জমা"],
    contributed_on: ["Contribution date", "জমার তারিখ"], filing_date: ["Filing date", "দাখিলের তারিখ"], paid_on: ["Payment date", "পরিশোধের তারিখ"],
    confirmed_for_year: ["Year eligibility confirmation", "করবর্ষের যোগ্যতা নিশ্চিতকরণ"], income_id: ["Linked income source", "সংশ্লিষ্ট আয়ের উৎস"],
  };
  return subject + (field && fields[field] ? " · " + t(...fields[field]) : "") + ": " + instruction;
}
