import type { AppLocale } from "@/lib/locale/app-locale";

export function getPremiumCopy(locale: AppLocale) {
  return locale === "bn" ? {
    sectorMap: "Sector map", measured: (n: number, total: number) => `${total}টির মধ্যে ${n}টির পরিবর্তন জানা`,
    pulseEyebrow: "বাজারের গভীরে", wealthEyebrow: "আপনার আগামী দিনের পরিকল্পনা",
    wealth: "সম্পদের পরিকল্পনা", wealthDescription: "সঞ্চয় গড়ুন, বিকল্প তুলনা করুন, করের হিসাব জানুন।",
    workspace: "ওয়েলথ ওয়ার্কস্পেস", why: "কেন গুরুত্বপূর্ণ", methodology: "মানচিত্র কীভাবে পড়বেন",
    method: "টাইলের রং শেয়ারের দামের পরিবর্তন দেখায়; আকার সমান। খাতের গড়ে শুধু একই কার্যদিবসের জানা পরিবর্তন নেওয়া হয়। সবার লেনদেনের মূল্য থাকলে সেই অনুযায়ী ওজন করা হয়, অন্যথায় সমান ওজন নেওয়া হয়। ওপরের শীর্ষ খাত সব সময় যোগ্য শেয়ারের সমান ওজনে নির্ধারিত।",
    current: "এই কার্যদিবস", partial: "এখন পর্যন্ত · আংশিক", average: (n: number) => `${n.toLocaleString("bn-BD")} কার্যদিবসের এভারেজ`,
    ratio: "এভারেজের তুলনায় লেনদেন", unavailable: "তুলনার তথ্য নেই",
    partialNote: "চলমান দিনের আংশিক লেনদেনের সঙ্গে দৈনিক এভারেজের তুলনা; এটি দিনশেষের পূর্বাভাস নয়।",
    averageNote: "সাম্প্রতিক উপলব্ধ দৈনিক তথ্যের এভারেজ; দেখানো কার্যদিবসের তথ্যও অন্তর্ভুক্ত হতে পারে।",
    implication: "দামের গতি ও কেনাবেচা একসঙ্গে মিলিয়ে দেখুন।",
    breadth: (up: number, down: number, change: string, volume: string) => `${up.toLocaleString("bn-BD")}টি শেয়ার বেড়েছে, ${down.toLocaleString("bn-BD")}টি কমেছে; DSEX ${change}। কেনাবেচার পরিমাণ ${volume}।`,
    volumeAverage: (ratio: string) => `এভারেজের ${ratio.replace("x", "×")}`,
  } : {
    sectorMap: "Sector map", measured: (n: number, total: number) => `${n} of ${total} measured`,
    pulseEyebrow: "Inside the market", wealthEyebrow: "Beyond the market",
    wealth: "Explore Wealth", wealthDescription: "Plan savings, compare options, estimate tax.",
    workspace: "Wealth Workspace", why: "Why this matters", methodology: "How to read this map",
    method: "Equal-sized tiles show each stock’s price change. Sector moves use measured returns from the displayed session. They are turnover-weighted when every measured stock has turnover, otherwise equal-weighted. The sector leader above always uses an equal-weight average of eligible stocks.",
    current: "Recorded session", partial: "So far · partial session", average: (n: number) => `${n}-session average`,
    ratio: "of average turnover", unavailable: "Comparison unavailable",
    partialNote: "Partial-session turnover against a daily average; this is not a closing projection.",
    averageNote: "Average of available recent daily records; it may include the displayed session.",
    implication: "Read trading activity alongside price confirmation.",
    breadth: (up: number, down: number, change: string, volume: string) => `${up} stocks rose and ${down} fell as DSEX moved ${change}; share volume was ${volume}.`,
    volumeAverage: (ratio: string) => `${ratio.replace("x", "×")} its recent average`,
  };
}
