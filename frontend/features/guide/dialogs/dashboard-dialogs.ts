import type { GuideDialog } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export type GuideControls = {
  closeLabel: string;
  skipSectionTitle: string;
  skipConfirmTitle: string;
  skipConfirmMessage: string;
  mobileSkipConfirmMessage: string;
  suppressPrompts: string;
  continue: string;
  dismiss: string;
  previous: string;
  skip: string;
  next: string;
  startMenuTour?: string;
  finish: string;
  dashboardPhase: string;
  menuPhase: string;
  introPhase: string;
};

export type GuideNudgeCopy = {
  eyebrow: string;
  title: string;
  message: string;
  snooze: string;
  dismiss: string;
  accept: string;
};

export type GuideLauncherCopy = {
  ariaLabel: string;
  title: string;
};

const dashboardGuideDialogsBn = {
  welcome: {
    eyebrow: "👋 স্বাগতম",
    message: "সূচক থেকে সিগন্যাল পর্যন্ত, বাজারের সর্বশেষ তথ্য কোথায় পাবেন চলুন দেখে নিই।",
  },
  pulse: {
    eyebrow: "বাজারের সারাংশ",
    message: "DSEX সূচকের মান ও পরিবর্তন দিয়ে শুরু করুন। পাশের তারিখ ও সময় দেখে বুঝবেন তথ্যটি কোন কার্যদিবসের। শুরুর মান, সর্বোচ্চ ও সর্বনিম্ন দেখতে সূচকের বিস্তারিত খুলুন।",
  },
  breadth: {
    eyebrow: "কতগুলো শেয়ার উঠল?",
    message: "দণ্ডটির তিন অংশ দেখায় কতগুলো শেয়ারের দাম বেড়েছে, কমেছে বা একই আছে। সংখ্যাগুলো সূচকের বাইরেও বাজারের চিত্র বুঝতে সাহায্য করে।",
  },
  pulseLink: {
    eyebrow: "মার্কেট পালস",
    message: "কোন খাত এগিয়েছে আর কোন শেয়ারের পরিস্থিতি নজরে রাখা যায়, বিস্তারিত দেখতে মার্কেট পালস খুলুন।",
  },
  map: {
    eyebrow: "খাতের মানচিত্র",
    message: "বাজারমূল্য বা তারল্য অনুযায়ী খাত ও শেয়ার সাজান। সব খাত দেখতে পুরো মানচিত্র খুলুন। দাম ও লেনদেনের মূল্য জানতে শেয়ারের তথ্য দেখুন।",
  },
  tiles: {
    eyebrow: "শেয়ারের দামের পরিবর্তন",
    message: "প্রতিটি ঘরে শেয়ারের প্রতীক ও দামের পরিবর্তন আছে। দাম ও লেনদেনের মূল্য জানতে কার্সর রাখুন, কিবোর্ড দিয়ে ঘর বাছুন বা শেয়ারের তথ্য দেখুন। ঘরটি খুললে শেয়ারের বিস্তারিত পাবেন।",
  },
  discovery: {
    eyebrow: "নজরকাড়া শেয়ার",
    message: "দাম বেড়েছে, কমেছে বা লেনদেনে শীর্ষে—যে তালিকাটি দরকার সেটি খুলুন। মানচিত্রের সাজানোর পদ্ধতি এই তালিকাগুলো বদলায় না।",
  },
  signals: {
    eyebrow: "চূড়ান্ত সিগন্যাল",
    message: "সিদ্ধান্তের তারিখ দেখুন, তারপর প্রথম শেয়ারটির তথ্য বা শর্ত এবং ঝুঁকি পড়ুন। বাকি সিদ্ধান্তগুলো সিগন্যাল সেন্টারে পাবেন।",
  },
  sidebar: {
    eyebrow: "ড্যাশবোর্ড পরিচিতি শেষ",
    message: "এবার আলাদা মেনু পরিচিতি শুরু করে দেখুন, কোথায় শেয়ারের বিস্তারিত, স্ক্যানার, পোর্টফোলিও আর সঞ্চয়ের হিসাব পাবেন।",
  },
} as const satisfies Record<string, GuideDialog>;

const dashboardGuideDialogsEn = {
  welcome: {
    eyebrow: "👋 Welcome",
    message: "Take a quick tour of the latest market snapshot, from DSEX to finalized signals.",
  },
  pulse: {
    eyebrow: "Read the market",
    message: "Start with DSEX and its move. The session and date tell you when the numbers are from. Open Index details for the day’s range and longer-term returns.",
  },
  breadth: {
    eyebrow: "Look beyond the index",
    message: "Each part of this bar shows how many stocks rose, stayed flat, or fell. Use the counts to see how widely the market moved.",
  },
  pulseLink: {
    eyebrow: "Open Market Pulse",
    message: "Open Market Pulse to see which sectors led and which setups are worth watching.",
  },
  map: {
    eyebrow: "Explore the sector map",
    message: "Market cap and liquidity reorder the sectors and their tiles. Open the full map to see every sector, or use Inspect a stock to check price and turnover.",
  },
  tiles: {
    eyebrow: "Read the stock tiles",
    message: "Each tile shows a ticker and its price change. Hover or focus for price and turnover, or use Inspect a stock on touch. Open a tile for the stock’s workspace.",
  },
  discovery: {
    eyebrow: "Switch between mover lists",
    message: "See gainers, losers, or the stocks with the highest turnover. Changing the map’s sort order leaves these lists as they are.",
  },
  signals: {
    eyebrow: "Read the finalized signals",
    message: "Check the decision date, then read the first stock’s evidence or condition and its risk. Find the full list in Signal Center.",
  },
  sidebar: {
    eyebrow: "Dashboard tour complete",
    message: "Start the separate menu tour to see where to research stocks, open Scanner, manage your portfolio, and explore Wealth.",
  },
} as const satisfies Record<string, GuideDialog>;

const sidebarGuideDialogsBn = {
  dashboard: {
    eyebrow: "🏠 ড্যাশবোর্ড",
    message:
      "প্রতিদিনের বাজারযাত্রা এখান থেকেই শুরু করুন। বাজারের মুড, গতি, ঝুঁকি আর নজরকাড়া শেয়ার—সব এক নজরে।",
  },
  stocks: {
    eyebrow: "📈 স্টকস",
    message:
      "কোনো শেয়ার নিয়ে কৌতূহল? খুঁজে বের করুন, তারপর চার্ট, ফান্ডামেন্টাল, সিগন্যাল আর বিশ্লেষণ একসাথে দেখুন।",
  },
  marketPulse: {
    eyebrow: "🔥 মার্কেট পালস",
    message:
      "আজ বাজারের আলোচনায় কী আছে? ট্রেন্ড, গুরুত্বপূর্ণ পরিবর্তন, ফোকাস স্টক আর সতর্কতার খবর এখানেই মিলবে।",
  },
  scanner: {
    eyebrow: "🔍 স্ক্যানার",
    message:
      "শত শত শেয়ার একে একে ঘাঁটার দরকার নেই। আপনার শর্ত দিন—সম্ভাবনাময় স্টকগুলো স্ক্যানার সামনে এনে দেবে।",
  },
  signals: {
    eyebrow: "🎯 সিগন্যালস",
    message:
      "শুধু POTENTIAL BUY, WAIT বা SELL দেখেই থামবেন না। সিদ্ধান্তটি কেন এসেছে এবং ঝুঁকি কোথায়—সেটাও বুঝে নিন।",
  },
  portfolio: {
    eyebrow: "আমার পোর্টফোলিও",
    message:
      "নিজের বিনিয়োগ আর নজরে রাখা শেয়ারগুলো একসঙ্গে দেখুন। দাম ও সিগন্যাল বদলালে এখান থেকে খোঁজ নিতে পারবেন।",
  },
  wealthWorkspace: {
    eyebrow: "💰 ওয়েলথ",
    message:
      "টাকা শুধু বিনিয়োগ নয়, পরিকল্পনাও। FDR, DPS, ট্যাক্স, যাকাত ও ভবিষ্যতের বিভিন্ন সিদ্ধান্ত এখানে হিসাব করে দেখুন।",
  },
} as const satisfies Record<string, GuideDialog>;

const sidebarGuideDialogsEn = {
  dashboard: {
    eyebrow: "🏠 Dashboard",
    message:
      "Start each market day here. Mood, momentum, risk, and noteworthy stocks—all in one view.",
  },
  stocks: {
    eyebrow: "📈 Stocks",
    message:
      "Curious about a stock? Search it, then review charts, fundamentals, signals, and analysis together.",
  },
  marketPulse: {
    eyebrow: "🔥 Market Pulse",
    message:
      "What's driving today's conversation? Trends, key changes, focus stocks, and caution points live here.",
  },
  scanner: {
    eyebrow: "🔍 Scanner",
    message:
      "You do not need to scan hundreds of stocks one by one. Set your filters and let Scanner surface candidates.",
  },
  signals: {
    eyebrow: "🎯 Signals",
    message:
      "Do not stop at POTENTIAL BUY, WAIT, or SELL. Understand the condition and where the risk sits.",
  },
  portfolio: {
    eyebrow: "My Portfolio",
    message:
      "Review your holdings and the stocks you’re watching. Use this workspace to follow changes in prices and signals.",
  },
  wealthWorkspace: {
    eyebrow: "💰 Wealth",
    message:
      "Money is not only investing—it is planning too. Model FDR, DPS, tax, zakat, and future decisions here.",
  },
} as const satisfies Record<string, GuideDialog>;

const guideControlsBn: GuideControls = {
  closeLabel: "গাইড বন্ধ করুন",
  skipSectionTitle: "গাইড বন্ধ করুন",
  skipConfirmTitle: "এখনই গাইড বাদ দেবেন?",
  skipConfirmMessage: "এখন বন্ধ করলে পরে ড্যাশবোর্ডের ট্যুর বাটন থেকে আবার দেখতে পারবেন।",
  mobileSkipConfirmMessage: "এখন বন্ধ করলে পরে হেডারের ম্যাসকট বাটন থেকে আবার দেখতে পারবেন।",
  suppressPrompts: "ভবিষ্যতে স্বয়ংক্রিয়ভাবে এই গাইড দেখাবেন না",
  continue: "চালিয়ে যান",
  dismiss: "গাইড বন্ধ করুন",
  previous: "পেছনে",
  skip: "বাদ দিন",
  next: "পরেরটা",
  startMenuTour: "মেনু পরিচিতি শুরু",
  finish: "শেষ করি",
  dashboardPhase: "ড্যাশবোর্ড",
  menuPhase: "মেনু",
  introPhase: "পরিচিতি",
};

const guideControlsEn: GuideControls = {
  closeLabel: "Close guide",
  skipSectionTitle: "Close guide",
  skipConfirmTitle: "Skip the guide now?",
  skipConfirmMessage: "You can replay this tour anytime from the dashboard guide button.",
  mobileSkipConfirmMessage: "You can replay this tour anytime from the header mascot button.",
  suppressPrompts: "Do not show this guide automatically in the future",
  continue: "Keep going",
  dismiss: "Leave tour",
  previous: "Back",
  skip: "Skip",
  next: "Next",
  startMenuTour: "Start menu tour",
  finish: "Finish",
  dashboardPhase: "Dashboard",
  menuPhase: "Menu",
  introPhase: "Introduction",
};

const mobileIntroDialogsBn = {
  welcome: {
    eyebrow: "👋 স্বাগতম",
    message:
      "স্বাগতম! বাজারের সারাংশ, সিগন্যাল আর মূল মেনু কোথায় পাবেন, চলুন দেখে নিই।",
  },
  mainMenu: {
    eyebrow: "📱 সবকিছু এই মেনুতে",
    message:
      "শেয়ার, সিগন্যাল আর সঞ্চয়ের টুল এখানে পাবেন। বাজারের সারাংশে ফিরতে ড্যাশবোর্ড বেছে নিন।",
  },
  wealth: {
    eyebrow: "💰 ভবিষ্যতের হিসাব",
    message:
      "সঞ্চয়, ট্যাক্স, যাকাত কিংবা ভবিষ্যতের লক্ষ্য—টাকার সিদ্ধান্তগুলো একটু বুঝে নিতে Wealth আপনার পাশে আছে।",
  },
  trading: {
    eyebrow: "📊 বাজারের টুলবক্স",
    message:
      "শেয়ার খোঁজা, সুযোগ স্ক্যান করা, সিগন্যাল বোঝা আর পছন্দের স্টকে নজর রাখা—ট্রেডিংয়ের দরকারি সব টুল এখানে।",
  },
  finish: {
    eyebrow: "✨ এবার আপনার পালা",
    message:
      "পরিচিতি শেষ! এখন নিজের মতো করে ঘুরে দেখুন। আবার দরকার হলে হেডারের ম্যাসকট বাটনে চাপ দিলেই আমি হাজির।",
  },
} as const satisfies Record<string, GuideDialog>;

const mobileIntroDialogsEn = {
  welcome: {
    eyebrow: "👋 Welcome",
    message:
      "Welcome! Here’s where to find the market snapshot, signals, and main menu.",
  },
  mainMenu: {
    eyebrow: "📱 Everything in this menu",
    message:
      "Use the menu to find stocks, signals, and Wealth tools. Choose Dashboard to return to the market snapshot.",
  },
  wealth: {
    eyebrow: "💰 Plan ahead",
    message:
      "Savings, tax, zakat, or future goals—Wealth helps you think through money decisions with clearer numbers.",
  },
  trading: {
    eyebrow: "📊 Market toolbox",
    message:
      "Search stocks, scan opportunities, read signals, and track favorites—trading essentials are grouped here.",
  },
  finish: {
    eyebrow: "✨ Your turn",
    message:
      "Intro complete! Explore on your own now. Tap the header mascot anytime if you want the tour again.",
  },
} as const satisfies Record<string, GuideDialog>;

const guideNudgeBn: GuideNudgeCopy = {
  eyebrow: "👋 ছোট্ট পরিচিতি",
  title: "এক মিনিটে স্মার্ট স্টক ঘুরে দেখবেন?",
  message: "মূল মেনু, Wealth আর ট্রেডিংয়ের দরকারি জায়গাগুলো খুব দ্রুত দেখিয়ে দিচ্ছি।",
  snooze: "এখন নয়",
  dismiss: "আর জিজ্ঞেস করবেন না",
  accept: "হ্যাঁ, শুরু করি",
};

const guideNudgeEn: GuideNudgeCopy = {
  eyebrow: "👋 Quick intro",
  title: "Take a one-minute tour of Smart Stock?",
  message: "I'll quickly show the main menu, Wealth, and the key trading areas.",
  snooze: "Not now",
  dismiss: "Don't ask again",
  accept: "Yes, start",
};

const guideLauncherBn: GuideLauncherCopy = {
  ariaLabel: "গাইড ট্যুর শুরু করুন",
  title: "ট্যুর গাইড",
};

const guideLauncherEn: GuideLauncherCopy = {
  ariaLabel: "Start guide tour",
  title: "Tour guide",
};

export function getDashboardGuideDialogs(locale: AppLocale) {
  return locale === "bn" ? dashboardGuideDialogsBn : dashboardGuideDialogsEn;
}

export function getSidebarGuideDialogs(locale: AppLocale) {
  return locale === "bn" ? sidebarGuideDialogsBn : sidebarGuideDialogsEn;
}

export function getGuideControls(locale: AppLocale): GuideControls {
  return locale === "bn" ? guideControlsBn : guideControlsEn;
}

export function getMobileIntroDialogs(locale: AppLocale) {
  return locale === "bn" ? mobileIntroDialogsBn : mobileIntroDialogsEn;
}

export function getGuideNudgeCopy(locale: AppLocale): GuideNudgeCopy {
  return locale === "bn" ? guideNudgeBn : guideNudgeEn;
}

export function getGuideLauncherCopy(locale: AppLocale): GuideLauncherCopy {
  return locale === "bn" ? guideLauncherBn : guideLauncherEn;
}

export type DashboardGuideDialogs = typeof dashboardGuideDialogsBn;
export type SidebarGuideDialogs = typeof sidebarGuideDialogsBn;
export type MobileIntroDialogs = typeof mobileIntroDialogsBn;
