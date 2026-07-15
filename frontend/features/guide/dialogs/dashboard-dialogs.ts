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
    message:
      "চলুন, মাত্র এক মিনিটে আজকের বাজারের গল্পটা দেখে নিই— কোথায় গতি কিংবা দুর্গতি, আর কোথায় সুযোগ।",
  },
  pulse: {
    eyebrow: "📈 বাজারের মুড",
    message:
      "বাজার আজ বেশ আত্মবিশ্বাসী, নাকি একটু সাবধানে চলছে? DSEX, লেনদেন আর অংশগ্রহণ মিলিয়ে এখানেই প্রথম ধারণা পাবেন।",
  },
  breadth: {
    eyebrow: "🌿 ভেতরের আসল চিত্র",
    message:
      "শুধু কয়েকটি শেয়ার উঠলেই বাজার শক্তিশালী হয় না। কতগুলো শেয়ার উঠছে, নামছে বা স্থির আছে—এখানে দেখুন পুরো ছবিটা।",
  },
  signals: {
    eyebrow: "🎯 স্মার্ট সিগন্যাল",
    message:
      "সিগন্যাল সম্ভাবনার দিক দেখায়, নিশ্চয়তা দেয় না। সিদ্ধান্তের আগে কারণ, আত্মবিশ্বাস আর ঝুঁকিটাও দেখে নিন।",
  },
  discovery: {
    eyebrow: "🔍 আজ কারা নজরে?",
    message:
      "আজকের আলোচিত ও নজরকাড়া শেয়ারগুলো এখানে পাবেন। আগ্রহী কোনো শেয়ার খুলে তার ভেতরের গল্পটা দেখে নিন।",
  },
  sidebar: {
    eyebrow: "🚀 এরপর কোথায়?",
    message:
      "বাজারের ছবি দেখা হয়ে গেল! এবার শেয়ার খুঁজতে Stocks, সুযোগ ধরতে Scanner কিংবা নিজের তালিকা দেখতে Watchlist-এ যান।",
  },
} as const satisfies Record<string, GuideDialog>;

const dashboardGuideDialogsEn = {
  welcome: {
    eyebrow: "👋 Welcome",
    message:
      "Let's take one minute to read today's market—where momentum is building, where caution is needed, and where opportunities may be forming.",
  },
  pulse: {
    eyebrow: "📈 Market Mood",
    message:
      "Is the market feeling confident today, or moving carefully? Start with DSEX, turnover, and participation for the first clear picture.",
  },
  breadth: {
    eyebrow: "🌿 What's happening underneath?",
    message:
      "A few rising stocks do not make the whole market strong. See how many stocks are advancing, declining, or staying flat.",
  },
  signals: {
    eyebrow: "🎯 Smart Signals",
    message:
      "Signals point to possibilities, not guarantees. Check the reason, heuristic evidence, and risk before making a decision.",
  },
  discovery: {
    eyebrow: "🔍 Who deserves attention today?",
    message:
      "Find today's active and noteworthy stocks here. Open any stock that interests you and explore the full story behind it.",
  },
  sidebar: {
    eyebrow: "🚀 Where next?",
    message:
      "You've seen the market picture. Now explore Stocks, find opportunities with Scanner, or check your Watchlist.",
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
  watchlist: {
    eyebrow: "⭐ ওয়াচলিস্ট",
    message:
      "যেসব শেয়ার চোখে রাখতে চান, সেগুলো এখানে জমা রাখুন। দাম, ট্রেন্ড বা সিদ্ধান্ত বদলালে দ্রুত নজরে পড়বে।",
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
  watchlist: {
    eyebrow: "⭐ Watchlist",
    message:
      "Save the stocks you want to track. Price, trend, or decision changes stay easy to spot.",
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
  dismiss: "বাদ দিন",
  previous: "তার আগে",
  skip: "বাদ দিন",
  next: "তারপর",
  finish: "শুরু করি",
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
  dismiss: "Skip",
  previous: "Back",
  skip: "Skip",
  next: "Next",
  finish: "Finish",
  dashboardPhase: "Dashboard",
  menuPhase: "Menu",
  introPhase: "Introduction",
};

const mobileIntroDialogsBn = {
  welcome: {
    eyebrow: "👋 স্বাগতম",
    message:
      "স্মার্ট স্টকে স্বাগতম! চলুন, এক মিনিটে কোথায় কী আছে দেখে নিই—তারপর নিজের মতো করে ঘুরে দেখবেন।",
  },
  mainMenu: {
    eyebrow: "📱 সবকিছু এই মেনুতে",
    message:
      "Stocks থেকে Wealth—স্মার্ট স্টকের সব গুরুত্বপূর্ণ জায়গার পথ এখানেই। প্রয়োজন হলে শুধু মেনুটি খুলুন।",
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
      "Welcome to Smart Stock! Let's take one minute to see what's here—then explore at your own pace.",
  },
  mainMenu: {
    eyebrow: "📱 Everything in this menu",
    message:
      "From Stocks to Wealth—the main paths through Smart Stock live here. Open the menu whenever you need them.",
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
