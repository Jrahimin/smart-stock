import type { EntryApplicabilityDto, MeasuredDecisionFactsDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { controllingReasonLabel } from "@/lib/market/decision-presentation";
import { getEntryAssessmentLanguage } from "@/lib/market/entry-assessment-language";

type EntryView = { label: string; detail: string | null; helper: string | null; tone: string; ariaLabel?: string };

export function potentialBuyNextStep(
  assessment: EntryApplicabilityDto | null | undefined,
  facts: Pick<MeasuredDecisionFactsDto, "entry_timing" | "trigger_price" | "confirmation_rule"> | null | undefined,
  locale: AppLocale,
  publishedCondition?: string | null,
): { headline: string; nextStep: string; terminal: boolean } {
  const bn = locale === "bn";
  const headline = "Potential Buy";
  const reason = assessment?.reason_code;
  const copy = getEntryAssessmentLanguage(locale);
  if (assessment?.status === "EXPIRED" || assessment?.status === "INVALIDATED") {
    const expired = assessment.status === "EXPIRED";
    return {
      headline: expired ? (bn ? "পরিকল্পনার মেয়াদ শেষ" : "Plan expired") : (bn ? "পরিকল্পনাটি আর বৈধ নয়" : "Plan no longer valid"),
      nextStep: [entryAssessmentPresentation(assessment, locale)?.label, reason === "STOP_BREACHED" ? copy.stopped : null].filter(Boolean).join(". "),
      terminal: true,
    };
  }
  let nextStep: string;
  if (assessment?.status === "APPLICABLE" && reason === "ENTRY_TERMS_MET" && assessment.price_basis === "LAST_CLOSE") {
    nextStep = bn ? "দিনের শেষ দামে শর্ত পূরণ হয়েছিল। পরের কার্যদিবসে আবার দেখুন।" : "Conditions were met at the last close. Recheck next session.";
  } else if (assessment?.status === "APPLICABLE" && reason === "ENTRY_TERMS_MET" && assessment.price_basis === "CURRENT") {
    nextStep = bn ? "কেনার শর্ত পূরণ হয়েছে। যাচাই করা সর্বশেষ দাম নির্ধারিত সীমার মধ্যে আছে।" : "Entry conditions met. The latest verified price is inside the planned range.";
  } else if (assessment?.status === "APPLICABLE" && reason === "ENTRY_TERMS_MET" && assessment.price_basis === "SNAPSHOT" && assessment.batch_fetched_at && Number.isFinite(Date.parse(assessment.batch_fetched_at))) {
    const time = new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(assessment.batch_fetched_at));
    nextStep = bn ? `${time}-এ পাওয়া দামে শর্ত পূরণ হয়েছিল। সর্বশেষ দাম মিলিয়ে নিন।` : `Conditions were met as of the ${time} price snapshot. Check the latest price.`;
  } else if (assessment?.status === "OUTSIDE_ZONE" && reason === "TARGET_REACHED") {
    nextStep = bn ? "দাম পরিকল্পনার লক্ষ্য ছুঁয়েছে। নতুন পরিকল্পনার অপেক্ষা করুন।" : "The price reached the plan’s target. Wait for a new plan.";
  } else if (assessment?.status === "OUTSIDE_ZONE" && reason === "ABOVE_ENTRY_ZONE") {
    nextStep = `${copy.outcomes.ABOVE_ENTRY_ZONE}. ${bn ? "দাম নির্ধারিত সীমার মধ্যে ফিরলে আবার দেখুন।" : "Reassess if price returns to the range."}`;
    if (publishedCondition) nextStep += ` ${publishedCondition}`;
    else if (facts?.confirmation_rule === "COMPLETED_PULLBACK_HOLD") nextStep += bn ? " দিনের শেষে সাপোর্টও ধরে রাখতে হবে।" : " The plan also requires a completed session to hold support.";
  } else if (assessment?.status === "AWAITING_CONFIRMATION" && reason === "ENTRY_SESSION_PENDING") {
    nextStep = bn ? "পরের অনুমোদিত কার্যদিবসে দাম আবার দেখুন।" : "Recheck the price in the next eligible session.";
  } else if (facts?.entry_timing === "BREAKOUT" && facts.trigger_price != null && Number.isFinite(facts.trigger_price) && facts.trigger_price > 0 && (reason === "COMPLETED_BREAKOUT_REQUIRED" || reason === "BELOW_ENTRY_ZONE")) {
    const price = `৳${new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", { maximumFractionDigits: 4 }).format(facts.trigger_price)}`;
    nextStep = reason === "BELOW_ENTRY_ZONE" ? (bn ? `দাম নির্ধারিত সীমার নিচে। পরিকল্পনায় দিন শেষে ${price}-এর ওপরে দাম ও অন্তত স্বাভাবিক লেনদেন দরকার।` : `Price is below the entry range. The plan requires a close above ${price} on at least normal volume.`)
      : (bn ? `লেনদেন অন্তত স্বাভাবিক মাত্রায় থাকলে এবং দিন শেষে দাম ${price}-এর ওপরে থাকলে আবার দেখুন।` : `Wait for a close above ${price} on at least normal volume.`);
  } else if (assessment?.status === "AWAITING_CONFIRMATION" && reason === "COMPLETED_BREAKOUT_REQUIRED") {
    nextStep = bn ? "পরিকল্পনার দামের স্তরের ওপরে দিন শেষ হওয়া ও অন্তত স্বাভাবিক লেনদেনের অপেক্ষা করুন।" : "Wait for a close above the plan’s trigger on at least normal volume.";
  } else if (assessment?.status === "AWAITING_CONFIRMATION" && reason === "COMPLETED_PULLBACK_HOLD_REQUIRED") {
    nextStep = bn ? "দাম নির্ধারিত সীমা ছুঁয়ে দিনের শেষে সাপোর্ট ধরে রাখে কি না দেখুন।" : "Wait for a session that touches the entry range and closes at or above support.";
  } else if (assessment?.status === "OUTSIDE_ZONE" && reason === "BELOW_ENTRY_ZONE") {
    nextStep = bn ? "দাম নির্ধারিত সীমার নিচে। সীমার মধ্যে ফিরলে আবার দেখুন।" : "Price is below the entry range. Reassess if it returns to the range.";
  } else if (assessment?.status === "UNVERIFIED" && (reason === "SESSION_SETTLING" || reason === "PATH_INCOMPLETE" || reason === "COVERAGE_UNKNOWN" || reason === "TERMS_UNKNOWN")) {
    nextStep = reason === "SESSION_SETTLING" ? copy.settlingDetail : reason === "PATH_INCOMPLETE" ? copy.incompletePath
      : reason === "COVERAGE_UNKNOWN" ? copy.missingHistory : copy.missingTerms;
    if (publishedCondition) nextStep += ` ${publishedCondition}`;
  } else if (publishedCondition && (!assessment || assessment.status === "UNVERIFIED")) {
    nextStep = publishedCondition;
  } else {
    nextStep = bn ? "কেনার আগে সর্বশেষ দাম ও পরিকল্পনার শর্ত মিলিয়ে নিন।" : "Check the latest price and plan conditions before considering entry.";
  }
  return { headline, nextStep, terminal: false };
}

/** Present the backend's explicit outcome; never infer permission from a price. */
export function entryAssessmentPresentation(assessment: EntryApplicabilityDto | null | undefined, locale: AppLocale, policyReason?: string | null): EntryView | null {
  const copy = getEntryAssessmentLanguage(locale);
  if (!assessment || ["NOT_APPLICABLE","UNVERIFIED"].includes(assessment.status)) return null;
  const permanent = ["INVALIDATED", "EXPIRED"].includes(assessment.status);
  const outcomes: Record<string, string> = copy.outcomes;
  const base = outcomes[assessment.reason_code];
  if (!base) return null;
  const label = base;
  if (!permanent) {
    if (!["CURRENT","SNAPSHOT","LAST_CLOSE"].includes(assessment.price_basis ?? "")) return null;
  }
  const blocker = assessment.controlling_blocker ? controllingReasonLabel(assessment.controlling_blocker, "", locale) : null;
  const hold = assessment.reason_code === "COMPLETED_PULLBACK_HOLD_REQUIRED" ? (locale === "bn" ? "সম্পূর্ণ session-এ zone ছুঁয়ে support-এর ওপর close দরকার; Entry পরের অনুমোদিত session-এ।" : "A completed session must touch the zone and close at/above support; entry can qualify in a subsequent session.") : null;
  return { label, detail: assessment.reason_code === "STOP_BREACHED" ? copy.stopped : hold || blocker || (policyReason && policyReason !== base ? policyReason : null),
    helper: null, tone: assessment.status.toLowerCase() };
}
