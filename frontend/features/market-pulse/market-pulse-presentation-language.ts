import type { AppLocale } from "@/lib/locale/app-locale";

const language = {
  en: {
    status: { OPEN: "Market open", PRE_OPEN: "Pre-open", POST_CLOSE: "Market closed", HOLIDAY: "Market closed" },
    statusUnavailable: "Session status unavailable", analysis: "Analysis", analysisAndClose: "Analysis and closing prices", closingPrice: "Closing price",
    forNewBuyers: "For new buyers", nextTrigger: "Next setup trigger",
    watch: (level: string) => `Watch ${level} · confirmation required`,
    fallbackReason: "Review the dated setup and its current blocker.",
    trendEvidence: (trend: string) => `Published trend: ${trend}`,
    resistanceEvidence: (price: string) => `Published resistance: ${price}`,
    focusReasons: {
      "Potential Buy Setup": "A published entry plan is available; the current price check controls entry.",
      "New BUY Setup": "The published entry plan changed in this completed session.",
      "Momentum Building": "Trend and momentum draw attention; review the current blocker.",
      "Volume Breakout": "Relative volume draws attention; price confirmation is still required.",
      "Signal Upgrade": "The published action improved from the previous completed session.",
      "Watch Closely": "Monitor the published levels and the current risk.",
    },
    alertTitles: { "unusual-volume": "Unusual volume", "momentum-reversal": "Momentum recovery", "liquidity-surge": "High session turnover", "sector-rotation": "Sector winners in focus", "pulse-score-jump": "Attention score increased" },
    alertExplanations: {
      "unusual-volume": (metric: string) => `Shares traded at ${metric.replace(/x normal$/, "×")} the previous 20-session median.`,
      "momentum-reversal": (metric: string) => `Session change: ${metric}. Trend confirmation is pending.`,
      "liquidity-surge": (metric: string) => `Session turnover: BDT ${metric}.`,
      "sector-rotation": (metric: string) => `${metric}. This covers selected advancing stocks.`,
      "pulse-score-jump": (metric: string) => `Attention score change: ${metric}.`,
    },
    sessionAlert: "Session alert",
    earlierPrices: (quoteDate: string, analysisDate: string) => `Showing ${quoteDate} prices; today's prices are not in yet. Analysis ${analysisDate}.`,
    priceReview: "Some prices need review. Check source details before entry.",
    dimensions: { sentiment: "Sentiment", participation: "Trading participation", momentum: "Stocks in uptrend", leadership: "Sector leadership" },
    breadth: (up: number, down: number, flat: number) => `${up} stocks rose, ${down} fell and ${flat} were unchanged.`,
    sectorBasis: "Equal-weight sector price change", sameSessionReturn: "Same-session sector return", priceLeader: "Session price leader", volumeLeader: "Volume versus prior 20-session median",
  },
  bn: {
    status: { OPEN: "লেনদেন চলছে", PRE_OPEN: "লেনদেন শুরুর আগে", POST_CLOSE: "লেনদেন শেষে", HOLIDAY: "বাজার বন্ধ" },
    statusUnavailable: "সেশনের অবস্থা জানা যায়নি", analysis: "বিশ্লেষণ", analysisAndClose: "বিশ্লেষণ ও সমাপনী দর", closingPrice: "সমাপনী দর",
    forNewBuyers: "নতুন ক্রেতার জন্য", nextTrigger: "Entry condition",
    watch: (level: string) => `Watch level ${level} · confirmation প্রয়োজন`,
    fallbackReason: "প্রকাশিত setup ও বর্তমান বাধা পর্যালোচনা করুন।",
    trendEvidence: (trend: string) => `প্রকাশিত trend: ${trend}`,
    resistanceEvidence: (price: string) => `প্রকাশিত resistance: ${price}`,
    focusReasons: {
      "Potential Buy Setup": "প্রকাশিত entry plan আছে; বর্তমান price check অনুযায়ী entry বিবেচনা করুন।",
      "New BUY Setup": "এই সম্পূর্ণ session-এ প্রকাশিত entry plan বদলেছে।",
      "Momentum Building": "Trend ও momentum নজর কেড়েছে; বর্তমান বাধাটি দেখুন।",
      "Volume Breakout": "Relative volume নজর কেড়েছে; price confirmation এখনও প্রয়োজন।",
      "Signal Upgrade": "আগের সম্পূর্ণ session-এর তুলনায় প্রকাশিত action উন্নত হয়েছে।",
      "Watch Closely": "প্রকাশিত level ও বর্তমান ঝুঁকি নজরে রাখুন।",
    },
    alertTitles: { "unusual-volume": "অস্বাভাবিক লেনদেন", "momentum-reversal": "দাম ঘুরে দাঁড়াচ্ছে", "liquidity-surge": "লেনদেনের মূল্য বেশি", "sector-rotation": "খাতের এগিয়ে থাকা শেয়ার", "pulse-score-jump": "নজরদারি স্কোর বেড়েছে" },
    alertExplanations: {
      "unusual-volume": (metric: string) => {
        const ratio = /^(\d+(?:\.\d+)?)x normal$/.exec(metric)?.[1];
        return ratio ? `লেনদেনের পরিমাণ আগের ২০ সেশনের মধ্যকের ${ratio} গুণ।` : `আগের ২০ সেশনের মধ্যকের তুলনায় লেনদেনের পরিমাণ ${metric}।`;
      },
      "momentum-reversal": (metric: string) => `এই সেশনে দামের পরিবর্তন ${metric}। ঊর্ধ্বমুখী ধারা এখনও নিশ্চিত হয়নি।`,
      "liquidity-surge": (metric: string) => `এই সেশনে লেনদেনের মূল্য ৳${metric}।`,
      "sector-rotation": (metric: string) => {
        const winners = /^(\d+) winners only$/.exec(metric)?.[1];
        return winners ? `শুধু দাম বেড়েছে এমন ${winners}টি শেয়ার ধরা হয়েছে।` : metric;
      },
      "pulse-score-jump": (metric: string) => `নজরদারি স্কোরের পরিবর্তন ${metric}।`,
    },
    sessionAlert: "Session alert",
    earlierPrices: (quoteDate: string, analysisDate: string) => `${quoteDate}-এর দাম দেখানো হচ্ছে; আজকের দাম আসেনি। বিশ্লেষণ ${analysisDate}।`,
    priceReview: "কিছু দামের তথ্য যাচাই করা দরকার। Entry-এর আগে source details দেখুন।",
    dimensions: { sentiment: "বাজারের ঝোঁক", participation: "লেনদেনে অংশগ্রহণ", momentum: "ঊর্ধ্বমুখী শেয়ার", leadership: "খাতে অগ্রগতি" },
    breadth: (up: number, down: number, flat: number) => `${up.toLocaleString("bn-BD")}টি শেয়ারের দর বেড়েছে, ${down.toLocaleString("bn-BD")}টির কমেছে। ${flat.toLocaleString("bn-BD")}টির দর একই আছে।`,
    sectorBasis: "প্রতিটি শেয়ারকে সমান ওজন দিয়ে খাতের দামের পরিবর্তন", sameSessionReturn: "এই সেশনে খাতের দামের পরিবর্তন", priceLeader: "দামের পরিবর্তনে এগিয়ে", volumeLeader: "আগের ২০ সেশনের মধ্যকের তুলনায় লেনদেনের পরিমাণ",
  },
};

export const getPulsePresentationLanguage = (locale: AppLocale) => language[locale];
