import type { AppLocale } from "@/lib/locale/app-locale";
import type { BackendTraderDecisionSummaryDto } from "@/lib/api/backend-api-types";

export function riskValueLabel(label: string | null | undefined, locale: AppLocale): string {
  const values: Record<string, [string, string]> = { LOW: ["Low", "কম"], MEDIUM: ["Medium", "মাঝারি"], HIGH: ["High", "উচ্চ"], SPECULATIVE: ["Speculative", "জল্পনামূলক"], UNKNOWN: ["Unknown", "অজানা"] };
  return (values[label ?? "UNKNOWN"] ?? values.UNKNOWN)[locale === "bn" ? 1 : 0];
}

export function evidenceLabel(status: string | null | undefined, locale: AppLocale = "en"): string {
  const labels: Record<string, [string, string]> = {
    UNAVAILABLE: ["Evidence unavailable", "তথ্য অপর্যাপ্ত"],
    MIXED: ["Mixed evidence", "মিশ্র সংকেত"],
    BULLISH: ["Bullish heuristic evidence", "ঊর্ধ্বমুখী বিশ্লেষণভিত্তিক সংকেত"],
    BEARISH: ["Bearish heuristic evidence", "নিম্নমুখী বিশ্লেষণভিত্তিক সংকেত"],
  };
  return (labels[status ?? "UNAVAILABLE"] ?? labels.UNAVAILABLE)[locale === "bn" ? 1 : 0];
}

/** Formats the summary's chosen facts; does not select or score a different explanation. */
export function selectedDecisionExplanation(decision: Pick<BackendTraderDecisionSummaryDto, "measured_support_component" | "opposing_component" | "opposing_constraint_code" | "primary_reason_code"> | null | undefined, locale: AppLocale) {
  const labels: Record<string, [string, string]> = { trend: ["Trend", "প্রবণতা"], momentum: ["Momentum", "মোমেন্টাম"], volume: ["Volume", "লেনদেনের পরিমাণ"], price_position: ["Price position", "দামের অবস্থান"], liquidity: ["Liquidity", "তারল্য"], risk_adjustment: ["Legacy risk adjustment", "পুরোনো ঝুঁকির সমন্বয়"] };
  const name = (key: string) => labels[key]?.[locale === "bn" ? 1 : 0] ?? (locale === "bn" ? "পরিমাপ করা উপাদান" : "Measured factor");
  const support = decision?.measured_support_component;
  const opposing = decision?.opposing_component;
  return {
    support: support ? (locale === "bn" ? `${name(support.key)} থেকে ${(support.score * support.weight).toFixed(1)} অবদান পয়েন্ট।` : `${name(support.key)} contributes ${(support.score * support.weight).toFixed(1)} setup points.`) : null,
    limitation: decision?.opposing_constraint_code && decision.opposing_constraint_code !== decision.primary_reason_code
      ? controllingReasonLabel(decision.opposing_constraint_code, locale === "bn" ? "প্রকাশিত সিদ্ধান্তে অতিরিক্ত সীমাবদ্ধতা রয়েছে।" : "An additional published constraint limits this setup.", locale)
      : opposing ? (locale === "bn" ? `সীমাবদ্ধ উপাদান: ${name(opposing.key)} · ${opposing.score}/100।` : `Limiting setup factor: ${name(opposing.key)} · ${opposing.score}/100.`) : null,
  };
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
    constructive_watch: ["The dated structure is constructive; holders may hold while prospective entrants wait.", "প্রকাশিত দামের গঠন অনুকূল; হাতে থাকলে ধরে রাখতে পারেন, নতুন এন্ট্রির জন্য অপেক্ষা করুন।"],
    near_resistance: ["The dated setup is near resistance; a confirmed price break is required.", "প্রকাশিত setup resistance-এর কাছে; নিশ্চিত price break প্রয়োজন।"],
    bullish_setup_valid_entry: ["The dated evidence supports the plan; current entry depends on the assessment above.", "প্রকাশিত তথ্য পরিকল্পনাকে সমর্থন করে; বর্তমান এন্ট্রির অবস্থা উপরের যাচাইয়ে দেখুন।"],
    bullish_setup_pullback: ["The dated plan requires a pullback into its preferred zone and support to hold.", "প্রকাশিত পরিকল্পনায় নির্ধারিত pullback সীমায় দর ফেরা ও support টিকে থাকা প্রয়োজন।"],
    bullish_setup_breakout: ["The dated plan requires completed-session close and volume confirmation, then a permitted entry session.", "প্রকাশিত পরিকল্পনায় সম্পূর্ণ সেশনের close ও volume নিশ্চিত হওয়ার পর অনুমোদিত entry session প্রয়োজন।"],
    bullish_setup_continuation: ["The dated plan follows a confirmed breakout; monitor its published management conditions.", "প্রকাশিত পরিকল্পনা নিশ্চিত breakout অনুসরণ করে; প্রকাশিত ব্যবস্থাপনার শর্ত নজরে রাখুন।"],
    bearish_market_regime: ["The dated market regime limits new long exposure.", "প্রকাশিত বাজারের অবস্থা নতুন long অবস্থান সীমিত করে।"],
    support_break: ["The dated analysis observed a support break.", "প্রকাশিত বিশ্লেষণে support ভাঙতে দেখা গেছে।"],
    lower_structure: ["Lower highs and lower lows limit a fresh entry.", "ক্রমে কম সর্বোচ্চ ও সর্বনিম্ন দরের কারণে নতুন এন্ট্রি সীমিত।"],
    fresh_entry_risk_block: ["Published trading risk or tradability blocks a fresh entry.", "প্রকাশিত ট্রেডিং ঝুঁকি বা লেনদেনের সীমার কারণে নতুন এন্ট্রি বন্ধ।"],
    bullish_setup_downgraded: ["A published constraint blocks a fresh entry despite constructive evidence.", "অনুকূল সংকেত থাকলেও প্রকাশিত সীমাবদ্ধতার কারণে নতুন এন্ট্রি বন্ধ।"],
    bullish_setup_ready: ["The dated evidence supports the plan; see the checked entry assessment.", "প্রকাশিত তথ্য পরিকল্পনাকে সমর্থন করে; এন্ট্রির যাচাই দেখুন।"],
    reward_risk_below_minimum: ["Planned reward per unit of risk is below the policy minimum.", "পরিকল্পিত লাভ-ঝুঁকির অনুপাত নীতির ন্যূনতম সীমার নিচে।"],
    bearish_directional_evidence: ["The dated trend and momentum evidence is bearish.", "প্রকাশিত trend ও momentum-এর সংকেত নিম্নমুখী।"],
  };
  return labels[code ?? ""]?.[locale === "bn" ? 1 : 0] ?? fallback;
}

export function readinessLabel(value: string | null | undefined, locale: AppLocale): string {
  const labels: Record<string, [string, string]> = { READY: ["Ready", "প্রস্তুত"], CONDITIONAL: ["Conditional", "শর্তসাপেক্ষ"], NOT_READY: ["Not ready", "প্রস্তুত নয়"] };
  return (labels[value ?? "NOT_READY"] ?? labels.NOT_READY)[locale === "bn" ? 1 : 0];
}

/** Holder context uses the same localized reason source with only audience-specific overrides. */
export function holderReasonLabel(code: string | null | undefined, fallback: string, locale: AppLocale) {
  const overrides: Record<string, [string, string]> = {
    constructive_watch: ["The dated price structure remains constructive.", "প্রকাশিত দামের গঠন অনুকূল আছে।"],
    lower_structure: ["The dated price structure is weakening.", "প্রকাশিত দামের গঠন দুর্বল হচ্ছে।"],
    bearish_market_regime: ["The dated market regime limits long exposure.", "প্রকাশিত বাজার পরিস্থিতি ক্রয় অবস্থান সীমিত রাখার পক্ষে।"],
    fresh_entry_risk_block: ["Published trading risk or tradability constraints require review.", "প্রকাশিত ট্রেডিং ঝুঁকি বা লেনদেনের সীমাবদ্ধতা পর্যালোচনা করা দরকার।"],
    elevated_trading_risk: ["Published trading risk is elevated.", "প্রকাশিত ট্রেডিং ঝুঁকি বেশি।"],
    illiquid: ["Published tradability is limited; review the holder instruction.", "প্রকাশিত লেনদেনের সক্ষমতা সীমিত; হোল্ডার নির্দেশনা পর্যালোচনা করুন।"],
  };
  return overrides[code ?? ""]?.[locale === "bn" ? 1 : 0] ?? controllingReasonLabel(code, fallback, locale);
}

/** Full dated plan guidance remains on Detail; compact lists retain actual blockers. */
export function isDatedPlanGuidance(code: string | null | undefined) {
  return ["bullish_setup_valid_entry", "bullish_setup_ready", "bullish_setup_pullback", "bullish_setup_breakout", "bullish_setup_continuation"].includes(code ?? "");
}
