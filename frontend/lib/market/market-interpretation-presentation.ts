import type { BackendMarketInterpretationDto } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export function formatMarketInterpretation(facts: BackendMarketInterpretationDto, locale: AppLocale) {
  const bn = locale === "bn";
  const titles: Record<BackendMarketInterpretationDto["code"], [string, string]> = {
    ALIGNED_UP: ["Index and breadth advance", "সূচক ও শেয়ারের বিস্তার ঊর্ধ্বমুখী"], ALIGNED_DOWN: ["Index and breadth decline", "সূচক ও শেয়ারের বিস্তার নিম্নমুখী"],
    DIVERGENT: ["Index and breadth diverge", "সূচক ও শেয়ারের বিস্তারে ভিন্ন চিত্র"], MIXED: ["Mixed session picture", "সেশনে মিশ্র চিত্র"],
    INDEX_ONLY: ["Index move; breadth unavailable", "সূচকের পরিবর্তন আছে, বিস্তারের তথ্য নেই"], BREADTH_ONLY: ["Breadth available; index incomplete", "শেয়ারের বিস্তার জানা, সূচকের তথ্য অসম্পূর্ণ"], UNAVAILABLE: ["Session evidence unavailable", "সেশনের তথ্য অপর্যাপ্ত"],
  };
  const move = facts.index_change_percent === null ? null : Number(facts.index_change_percent);
  const breadth = facts.breadth;
  const index = move !== null && Number.isFinite(move) ? `DSEX ${move > 0 ? "+" : ""}${move.toFixed(2)}%.` : (bn ? "সূচকের পরিবর্তন জানা নেই।" : "Index change is unavailable.");
  const distribution = breadth.known_count > 0 ? (bn ? `${breadth.advancing}টি বেড়েছে, ${breadth.declining}টি কমেছে।` : `${breadth.advancing} rose and ${breadth.declining} fell.`) : (bn ? "তুলনাযোগ্য শেয়ারের পরিবর্তন জানা নেই।" : "No comparable stock changes are known.");
  const ratio = facts.volume_vs_average === null ? null : Number(facts.volume_vs_average);
  const participation = ratio !== null && Number.isFinite(ratio) ? (bn ? `পরিমাণ আগের ${facts.volume_average_sessions} সেশনের গড়ের ${ratio.toFixed(2)}×।` : `Volume is ${ratio.toFixed(2)}× the prior ${facts.volume_average_sessions}-session average.`) : (bn ? "পরিমাণের তুলনা নেই।" : "Participation comparison is unavailable.");
  return { title: titles[facts.code][bn ? 1 : 0], description: `${index} ${distribution} ${participation}` };
}
