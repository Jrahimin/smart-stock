import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { StockDecisionLanguage } from "@/features/stock-workspace/stock-decision-language";

export const dashboardEntryConditions: Record<AppLocale, StockDecisionLanguage["entryConditions"]> = {
  en: {
    breakout_continuation: "Enter only while the breakout holds above the preferred range. Reassess if trading weakens or price crosses the level that invalidates the setup.",
    breakout_trigger_session: "Enter only after the session closes above the trigger with enough trading activity to confirm the move.",
    pullback_zone: "Enter only if price returns to the preferred support or moving-average range and holds there.",
    ready_near_range: "The entry setup is available near the range shown.",
    available_near_range_short: "The entry setup is available near the range shown.",
    close_above_price: ({ price }) => `Enter only after the session closes above ${price} with volume that confirms the move.`,
    close_above_trigger: "Enter only after the session closes above the trigger with volume that confirms the move.",
  },
  bn: {
    breakout_continuation: "দাম নির্ধারিত সীমা পেরিয়ে ওপরে টিকে থাকলেই কেনার কথা ভাবুন। কেনাবেচা দুর্বল হলে বা দাম এমন সীমা পেরোলে যাতে শর্ত আর খাটে না, সিদ্ধান্তটি আবার বিবেচনা করুন।",
    breakout_trigger_session: "নির্ধারিত দামের ওপরে লেনদেন শেষ হলে এবং কেনাবেচার পরিমাণ সেই ওঠাকে সমর্থন করলেই কেনার কথা ভাবুন।",
    pullback_zone: "দাম নির্ধারিত সমর্থনমূল্য বা চলমান এভারেজের কাছে ফিরে এসে সেখানে টিকে থাকলেই কেনার কথা ভাবুন।",
    ready_near_range: "দেখানো সীমার কাছাকাছি দাম থাকলে কেনার শর্ত পূরণ হচ্ছে।",
    available_near_range_short: "দেখানো সীমার কাছাকাছি দাম থাকলে কেনার শর্ত পূরণ হচ্ছে।",
    close_above_price: ({ price }) => `দাম ${price}-এর ওপরে দিন শেষ করলে এবং কেনাবেচার পরিমাণ সেই ওঠাকে সমর্থন করলেই কেনার কথা ভাবুন।`,
    close_above_trigger: "দাম নির্ধারিত সীমার ওপরে দিন শেষ করলে এবং কেনাবেচার পরিমাণ সেই ওঠাকে সমর্থন করলেই কেনার কথা ভাবুন।",
  },
};

const copy = {
  en: {
    overview: "Market overview", loading: "Loading the market snapshot…",
    missing: "Unavailable", indexMissing: "Index unavailable", noSnapshot: "No market snapshot yet",
    stale: "Historical snapshot", partial: "Partial snapshot", open: "Market open", preOpen: "Before opening",
    postClose: "Post-close snapshot", closed: "Market closed", syncing: "Updating snapshot", synced: "Synced",
    snapshotTime: "Snapshot time (Dhaka)", syncTime: "Last sync time (Dhaka)",
    breadth: "Market breadth", up: "Up", flat: "Flat", down: "Down", turnover: "Turnover", volume: "Volume",
    shares: "shares", versusAverage: "recent avg", priorAverage: (sessions: number) => `prior ${sessions}-session avg`, noAverage: "Recent average unavailable", sectorLeader: "Sector leader",
    sectorLeaderBasis: "Equal-weight average of eligible stocks",
    vsPrevious: "vs. prior session", indexDetails: "Index details", dayOpen: "Open", dayHigh: "High", dayLow: "Low",
    returns: ["1 month", "6 months", "1 year"], range: "52-week range", pulse: "Open Market Pulse",
    pulseDescription: "See which sectors led and what to watch next.",
    pulseHistorical: "See which sectors led in the recorded session.",
    map: "Sector map", mode: "Sort sector map by", marketCap: "Market cap", liquidity: "Liquidity",
    coverage: (n: number) => `${n} stocks mapped`, mapEmpty: "No stocks are mapped for this snapshot.",
    sectorMove: "Sector moves: weighted by turnover where available",
    mappedEqualWeight: "Equal-weight average",
    mapPreview: (shown: number, total: number) => `Preview · ${shown} of ${total} sectors`,
    mapOrder: "Sort changes the order of sectors and stocks.",
    tileDetails: "Inspect a stock", pickStock: "Choose a ticker", stockDetailLink: "Open stock details",
    price: "Price", liquidityScore: "Liquidity score", showFullMap: "Show full map", showLess: "Show less",
    movers: "Market movers", gainers: "Gainers", losers: "Losers", turnoverLeaders: "Turnover leaders",
    moversEmpty: "No stocks in this list for the current snapshot.", stock: "Stock", change: "Change",
    signals: "Smart Signals", signalCenter: "Open Signal Center", decision: "Decision", condition: "Condition", risk: "Risk",
    signalsEmpty: "No signals to show for the latest finalized session.", signalsUpdating: "Finalized signals are being prepared.",
    signalsUnavailable: "Signals are temporarily unavailable.", conditionUnavailable: "Condition unavailable",
    evidence: "Stock evidence", evidenceUnavailable: "No stock evidence available",
    sharedWait: "Why Wait: the available data doesn’t support a new buy or sell decision.",
    sharedStaleWait: "Why Wait: these stocks need more recent or complete data.",
    actions: { POTENTIAL_BUY: "Potential Buy", HOLD: "Hold", WAIT: "Wait", SELL: "Sell" },
    risks: { LOW: "Low risk", MEDIUM: "Medium risk", HIGH: "High risk" },
    timeline: "Market timeline", timelineEmpty: "No market alerts for this snapshot.",
    timelineError: "Market alerts couldn’t load. Use Refresh to try again.",
    timelineCached: "Showing saved alerts; the latest request failed.",
    snapshotUpdate: "Generated snapshot update", moverEvent: "Session mover", marketAlert: "Generated market alert", sourceLink: "Source",
    insightsTitle: "Insights", marketInterpretation: "Market interpretation", tradingActivity: "Turnover",
    insightsEmpty: "Market interpretation is not available for this snapshot.",
    insightsError: "Market insights couldn’t load. Use Refresh to try again.",
    intradayInterpretation: "Intraday reading; the session is still open.",
    serviceError: "Some market sections couldn’t load. Use Refresh to try again.",
  },
  bn: {
    overview: "বাজারের সারাংশ", loading: "বাজারের সর্বশেষ তথ্য আসছে…",
    missing: "তথ্য নেই", indexMissing: "সূচকের তথ্য নেই", noSnapshot: "বাজারের তথ্য এখনও আসেনি",
    stale: "পুরোনো বাজারের তথ্য", partial: "বাজারের আংশিক তথ্য", open: "লেনদেন চলছে", preOpen: "লেনদেন শুরুর আগে",
    postClose: "লেনদেন শেষে", closed: "বাজার বন্ধ", syncing: "তথ্য হালনাগাদ হচ্ছে", synced: "হালনাগাদ",
    snapshotTime: "বাজারচিত্রের সময় (ঢাকা)", syncTime: "শেষ হালনাগাদের সময় (ঢাকা)",
    breadth: "শেয়ারের ওঠানামা", up: "বেড়েছে", flat: "অপরিবর্তিত", down: "কমেছে", turnover: "লেনদেনের মূল্য", volume: "কেনাবেচার পরিমাণ",
    shares: "শেয়ার", versusAverage: "সাম্প্রতিক এভারেজ", priorAverage: (sessions: number) => `আগের ${sessions} সেশনের গড়`, noAverage: "সাম্প্রতিক এভারেজের তথ্য নেই", sectorLeader: "শীর্ষ খাত",
    sectorLeaderBasis: "যোগ্য শেয়ারগুলোর সমান ওজনে এভারেজ",
    vsPrevious: "আগের কার্যদিবসের তুলনায়", indexDetails: "সূচকের বিস্তারিত", dayOpen: "শুরুর মান", dayHigh: "সর্বোচ্চ", dayLow: "সর্বনিম্ন",
    returns: ["1 মাস", "6 মাস", "1 বছর"], range: "52 সপ্তাহের সীমা", pulse: "মার্কেট পালস দেখুন",
    pulseDescription: "কোন খাত এগিয়ে ছিল আর এরপর কী নজরে রাখবেন, দেখুন।",
    pulseHistorical: "ওই কার্যদিবসে কোন খাত এগিয়ে ছিল দেখুন।",
    map: "খাতের মানচিত্র", mode: "খাতের মানচিত্র সাজানোর ভিত্তি", marketCap: "বাজারমূল্য", liquidity: "তারল্য",
    coverage: (n: number) => `মানচিত্রে ${n}টি শেয়ার`, mapEmpty: "এই বাজারচিত্রে মানচিত্রে দেখানোর মতো শেয়ার নেই।",
    sectorMove: "খাতের পরিবর্তন: তথ্য থাকলে লেনদেনের মূল্য অনুযায়ী ওজন",
    mappedEqualWeight: "সমান ওজনে এভারেজ",
    mapPreview: (shown: number, total: number) => `ঝলক · ${total}টি খাতের মধ্যে ${shown}টি`,
    mapOrder: "সাজানোর ধরন বদলালে খাত ও শেয়ারের ক্রম বদলায়।",
    tileDetails: "শেয়ারের তথ্য দেখুন", pickStock: "একটি প্রতীক বাছুন", stockDetailLink: "শেয়ারের বিস্তারিত খুলুন",
    price: "দাম", liquidityScore: "তারল্যের score", showFullMap: "পুরো মানচিত্র দেখুন", showLess: "সংক্ষিপ্ত মানচিত্র দেখুন",
    movers: "নজরকাড়া শেয়ার", gainers: "দাম বেড়েছে", losers: "দাম কমেছে", turnoverLeaders: "লেনদেনে শীর্ষে",
    moversEmpty: "এই বাজারচিত্রে তালিকাটি খালি।", stock: "শেয়ার", change: "পরিবর্তন",
    signals: "স্মার্ট signal", signalCenter: "signal সেন্টার দেখুন", decision: "সিদ্ধান্ত", condition: "শর্ত", risk: "ঝুঁকি",
    signalsEmpty: "সর্বশেষ চূড়ান্ত কার্যদিবসের কোনো signal নেই।", signalsUpdating: "চূড়ান্ত signal প্রস্তুত হচ্ছে।",
    signalsUnavailable: "signal এখন পাওয়া যাচ্ছে না।", conditionUnavailable: "শর্তের তথ্য নেই",
    evidence: "শেয়ারের তথ্য", evidenceUnavailable: "শেয়ারটির বিশ্লেষণের তথ্য নেই",
    sharedWait: "কেন অপেক্ষা: যে তথ্য আছে, তা দিয়ে কেনা বা বেচার নতুন সিদ্ধান্ত দেওয়া যাচ্ছে না।",
    sharedStaleWait: "কেন অপেক্ষা: এই শেয়ারগুলোর আরও সাম্প্রতিক বা পূর্ণাঙ্গ তথ্য দরকার।",
    actions: { POTENTIAL_BUY: "Potential Buy", HOLD: "Hold", WAIT: "Wait", SELL: "Sell" },
    risks: { LOW: "কম ঝুঁকি", MEDIUM: "মাঝারি ঝুঁকি", HIGH: "বেশি ঝুঁকি" },
    timeline: "বাজারের ঘটনাক্রম", timelineEmpty: "এই বাজারচিত্রের কোনো সতর্কবার্তা নেই।",
    timelineError: "বাজারের সতর্কবার্তা আসেনি। রিফ্রেশ করে আবার চেষ্টা করুন।",
    timelineCached: "আগের সতর্কবার্তা দেখানো হচ্ছে। সর্বশেষ অনুরোধটি ব্যর্থ হয়েছে।",
    snapshotUpdate: "বাজারের তথ্য থেকে তৈরি হালনাগাদ", moverEvent: "কার্যদিবসের শীর্ষ পরিবর্তন", marketAlert: "তথ্য থেকে তৈরি সতর্কবার্তা", sourceLink: "তথ্যের উৎস",
    insightsTitle: "Insights", marketInterpretation: "বাজার কী বলছে", tradingActivity: "লেনদেনের মূল্য",
    insightsEmpty: "এই বাজারচিত্রের ব্যাখ্যা পাওয়া যায়নি।",
    insightsError: "বাজারের ব্যাখ্যা আসেনি। রিফ্রেশ করে আবার চেষ্টা করুন।",
    intradayInterpretation: "চলতি কার্যদিবসের চিত্র। লেনদেন এখনও চলছে।",
    serviceError: "বাজারের কিছু তথ্য আসেনি। আবার চেষ্টা করতে রিফ্রেশ করুন।",
  },
};

export const getTerminalCopy = (locale: AppLocale) => copy[locale];
export type TerminalCopy = ReturnType<typeof getTerminalCopy>;

export function breadthContrast({ breadth, pulse }: MarketDashboardModel, locale: AppLocale) {
  if (pulse.indexTradeDate && pulse.indexTradeDate !== pulse.latestTradeDate) return null;
  if (!pulse.indexAvailable || pulse.indexChangePercent === null || breadth.total <= 0) return null;
  if (pulse.indexChangePercent > 0 && breadth.declining > breadth.advancing) {
    return locale === "bn" ? "তবু DSEX সূচক বেড়েছে।" : "DSEX still rose.";
  }
  if (pulse.indexChangePercent < 0 && breadth.advancing > breadth.declining) {
    return locale === "bn" ? "তবু DSEX সূচক কমেছে।" : "DSEX still fell.";
  }
  return null;
}

export function marketHeadline(model: MarketDashboardModel, locale: AppLocale): string {
  const code = model.insights.find((item) => item.interpretation)?.interpretation?.code;
  const labels: Record<string, [string, string]> = {
    ALIGNED_UP: ["More stocks rose", "বেশি শেয়ারের দাম বেড়েছে"], ALIGNED_DOWN: ["More stocks fell", "বেশি শেয়ারের দাম কমেছে"],
    DIVERGENT: ["A divided session", "সেশনে ভিন্ন চিত্র"], MIXED: ["A mixed session", "সেশনে মিশ্র চিত্র"],
    INDEX_ONLY: ["The latest index move", "সূচকের সর্বশেষ পরিবর্তন"], BREADTH_ONLY: ["The latest market breadth", "শেয়ারের সর্বশেষ বিস্তার"],
  };
  return labels[code ?? ""]?.[locale === "bn" ? 1 : 0] ?? (locale === "bn" ? "সেশনের বাজারচিত্র" : "The session at a glance");
}

const dseSectorNames: Record<string, string> = {
  bank: "Bank", banks: "Bank", textile: "Textile", "mutual funds": "Mutual Funds", "mutual fund": "Mutual Funds",
  ceramics: "Ceramics", "ceramic sector": "Ceramics", engineering: "Engineering", insurance: "Insurance",
  "general insurance": "General Insurance", "life insurance": "Life Insurance", "fuel & power": "Fuel & Power",
  "pharmaceuticals & chemicals": "Pharmaceuticals & Chemicals", "food & allied": "Food & Allied",
  "financial institutions": "Financial Institutions", telecommunication: "Telecommunication", cement: "Cement",
  it: "IT Sector", "it sector": "IT Sector", miscellaneous: "Miscellaneous", services: "Services & Real Estate",
  "services & real estate": "Services & Real Estate", jute: "Jute", paper: "Paper & Printing", "paper & printing": "Paper & Printing",
  "tannery industries": "Tannery Industries", "travel & leisure": "Travel & Leisure", "travel and leisure": "Travel & Leisure",
  "corporate bond": "Corporate Bond", "treasury bond": "Treasury Bond", unclassified: "Unclassified",
};

export function sectorName(value: string, _locale: AppLocale) {
  return dseSectorNames[value.trim().toLowerCase()] ?? value.trim();
}
