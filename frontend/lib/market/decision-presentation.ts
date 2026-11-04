import type { AppLocale } from "@/lib/locale/app-locale";

export function evidenceLabel(status: string | null | undefined, locale: AppLocale = "en"): string {
  const labels: Record<string, [string, string]> = {
    UNAVAILABLE: ["Evidence unavailable", "তথ্য অপর্যাপ্ত"],
    MIXED: ["Mixed evidence", "মিশ্র সংকেত"],
    BULLISH: ["Bullish heuristic evidence", "ঊর্ধ্বমুখী বিশ্লেষণভিত্তিক সংকেত"],
    BEARISH: ["Bearish heuristic evidence", "নিম্নমুখী বিশ্লেষণভিত্তিক সংকেত"],
  };
  return (labels[status ?? "UNAVAILABLE"] ?? labels.UNAVAILABLE)[locale === "bn" ? 1 : 0];
}

export function controllingReasonLabel(code: string | null | undefined, fallback: string, locale: AppLocale): string {
  const labels: Record<string, [string, string]> = {
    data_not_eligible: ["Decision data is unavailable or ineligible.", "সিদ্ধান্তের তথ্য অপর্যাপ্ত বা অযোগ্য।"],
    illiquid: ["Tradability blocks a fresh entry.", "লেনদেনের স্বল্পতার কারণে নতুন entry বন্ধ।"],
    elevated_trading_risk: ["Trading risk blocks a fresh entry.", "ট্রেডিং ঝুঁকির কারণে নতুন entry বন্ধ।"],
    overextended_price: ["Price is too extended for a fresh entry.", "দাম অতিরিক্ত বেড়েছে; নতুন entry-এর জন্য অপেক্ষা করুন।"],
    extended_momentum: ["Momentum is too extended for a fresh entry.", "মোমেন্টাম অতিরিক্ত; নতুন entry-এর জন্য অপেক্ষা করুন।"],
    regime_plan_not_permitted: ["The market regime blocks this entry plan; a watch level alone is not permission to enter.", "বাজারের অবস্থা এই entry plan অনুমোদন করছে না; পর্যবেক্ষণমূলক স্তর ছোঁয়া entry-এর অনুমতি নয়।"],
    entry_plan_not_valid: ["Wait for a confirmed, permitted entry plan.", "নিশ্চিত ও অনুমোদিত entry plan-এর জন্য অপেক্ষা করুন।"],
    no_directional_edge: ["Balanced evidence; no directional edge.", "মিশ্র সংকেত; স্পষ্ট দিকনির্দেশ নেই।"],
  };
  return labels[code ?? ""]?.[locale === "bn" ? 1 : 0] ?? fallback;
}

export function readinessLabel(value: string | null | undefined, locale: AppLocale): string {
  const labels: Record<string, [string, string]> = { READY: ["Ready", "প্রস্তুত"], CONDITIONAL: ["Conditional", "শর্তসাপেক্ষ"], NOT_READY: ["Not ready", "প্রস্তুত নয়"] };
  return (labels[value ?? "NOT_READY"] ?? labels.NOT_READY)[locale === "bn" ? 1 : 0];
}
