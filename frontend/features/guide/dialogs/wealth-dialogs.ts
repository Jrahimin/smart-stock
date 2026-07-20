import type {
  GuideControls,
  GuideLauncherCopy,
  GuideNudgeCopy,
} from "@/features/guide/dialogs/dashboard-dialogs";
import type { GuideDialog } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthGuideDialogKey =
  | "welcome"
  | "menu"
  | "calculators"
  | "taxPlanner"
  | "otherTools";

const dialogs = {
  en: {
    welcome: {
      eyebrow: "👋 Welcome to Wealth",
      message:
        "Money decisions rarely stop at today. Let’s take a quick look at the tools that help you explore what today’s choices could mean for tomorrow.",
    },
    menu: {
      eyebrow: "🧭 Pick your path",
      message:
        "Think of this menu as your Wealth map. Whether you want to calculate, plan, track, or compare, start with the question on your mind today.",
    },
    calculators: {
      eyebrow: "🧮 Let’s try the numbers",
      message:
        "Wondering how an FDR may grow, where a DPS could take you, or how much Zakat may be due? Open Calculators to explore FDR, DPS, Sanchaypatra, Zakat, and more.",
    },
    taxPlanner: {
      eyebrow: "🧾 Make tax less stressful",
      message:
        "See an estimate of your yearly tax, then explore how eligible savings and rebates may change the final number before the deadline gets too close.",
    },
    otherTools: {
      eyebrow: "✨ See the bigger picture",
      message:
        "Use Snapshot to bring your money into one view, Time Travel to see what may be coming next, and DPS vs FDR to compare two saving paths before choosing.",
    },
  },
  bn: {
    welcome: {
      eyebrow: "👋 Wealth-এ স্বাগতম",
      message:
        "সম্পদের কোনো সিদ্ধান্ত শুধু আজকে থেমে থাকে না। চলুন এক ঝলকে দেখে নিই—আজকের choice ভবিষ্যতে কোথায় নিয়ে যেতে পারে, সেটা বুঝতে Wealth কীভাবে পাশে থাকবে।",
    },
    menu: {
      eyebrow: "🧭 নিজের পথটা বেছে নিন",
      message:
        "এই menu-টাই আপনার Wealth map। হিসাব করতে চান, প্ল্যান সাজাতে চান, নাকি দুইটা অপশন মিলিয়ে দেখতে চান—আজ মাথায় যে প্রশ্নটা আছে, সেখান থেকেই শুরু করুন।",
    },
    calculators: {
      eyebrow: "🧮 সংখ্যাগুলো মিলিয়ে দেখি",
      message:
        "FDR-এ কত হতে পারে, DPS কোথায় নিয়ে যাবে, কিংবা Zakat কত আসতে পারে—Calculators খুলে FDR, DPS, সঞ্চয়পত্র, যাকাত সহ আরো অনেক হিসাব সহজেই দেখে নিন।",
    },
    taxPlanner: {
      eyebrow: "🧾 ট্যাক্স নিয়ে আগেই পরিষ্কার হন",
      message:
        "বছরের ট্যাক্স কত হতে পারে, আগে থেকেই দেখে নিন। তারপর প্রযোজ্য saving আর rebate দিলে final amount কতটা বদলাতে পারে, সেটাও মিলিয়ে দেখুন।",
    },
    otherTools: {
      eyebrow: "✨ পুরো ছবিটা একসাথে দেখুন",
      message:
        "Snapshot-এ আপনার টাকার ছবি গুছিয়ে রাখুন, Time Travel-এ সামনে কী আসছে দেখুন, আর DPS vs FDR-এ দুই সঞ্চয়ের পথ পাশাপাশি মিলিয়ে সিদ্ধান্ত নিন।",
    },
  },
} satisfies Record<
  AppLocale,
  Record<WealthGuideDialogKey, GuideDialog>
>;

const controls = {
  en: {
    closeLabel: "Close Wealth guide",
    skipSectionTitle: "Leave the Wealth tour",
    skipConfirmTitle: "Leave the tour for now?",
    skipConfirmMessage:
      "You can return anytime from the mascot button and explore Wealth again.",
    mobileSkipConfirmMessage:
      "You can return anytime from the mascot button in the header.",
    suppressPrompts: "Do not show this guide automatically again",
    continue: "Keep going",
    dismiss: "Leave tour",
    previous: "Back",
    skip: "Skip",
    next: "Next",
    finish: "Finish",
    dashboardPhase: "Wealth Workspace",
    menuPhase: "Wealth Workspace",
    introPhase: "Wealth Workspace",
  },
  bn: {
    closeLabel: "Wealth guide বন্ধ করুন",
    skipSectionTitle: "Wealth tour থেকে বের হোন",
    skipConfirmTitle: "এখনকার মতো tour বন্ধ করবেন?",
    skipConfirmMessage:
      "চাইলে পরে mascot button থেকে আবার ফিরে এসে Wealth ঘুরে দেখতে পারবেন।",
    mobileSkipConfirmMessage:
      "চাইলে পরে header-এর mascot button থেকে আবার Wealth tour শুরু করতে পারবেন।",
    suppressPrompts: "এই guide আর নিজে থেকে দেখাবেন না",
    continue: "চালিয়ে যান",
    dismiss: "Tour বন্ধ করুন",
    previous: "পেছনে",
    skip: "বাদ দিন",
    next: "পরেরটা",
    finish: "শেষ করি",
    dashboardPhase: "Wealth Workspace",
    menuPhase: "Wealth Workspace",
    introPhase: "Wealth Workspace",
  },
} satisfies Record<AppLocale, GuideControls>;

const nudge = {
  en: {
    eyebrow: "👋 A quick Wealth tour",
    title: "Want a quick look around?",
    message:
      "I’ll show you where to calculate, plan, track, and compare your money choices.",
    snooze: "Maybe later",
    dismiss: "Don’t ask again",
    accept: "Show me around",
  },
  bn: {
    eyebrow: "👋 ছোট্ট একটা Wealth tour",
    title: "একটু ঘুরে দেখবেন?",
    message:
      "কোথায় হিসাব করবেন, প্ল্যান সাজাবেন, track করবেন আর অপশন মিলিয়ে দেখবেন—ঝটপট দেখিয়ে দিচ্ছি।",
    snooze: "পরে দেখব",
    dismiss: "আর মনে করাবেন না",
    accept: "চলুন দেখি",
  },
} satisfies Record<AppLocale, GuideNudgeCopy>;

const launcher = {
  en: {
    ariaLabel: "Start the Wealth Workspace tour",
    title: "Explore Wealth Workspace",
  },
  bn: {
    ariaLabel: "Wealth Workspace tour শুরু করুন",
    title: "Wealth ঘুরে দেখুন",
  },
} satisfies Record<AppLocale, GuideLauncherCopy>;

export function getWealthGuideDialogs(
  locale: AppLocale,
): Record<WealthGuideDialogKey, GuideDialog> {
  return dialogs[locale];
}

export function getWealthGuideControls(
  locale: AppLocale,
): GuideControls {
  return controls[locale];
}

export function getWealthGuideNudgeCopy(
  locale: AppLocale,
): GuideNudgeCopy {
  return nudge[locale];
}

export function getWealthGuideLauncherCopy(
  locale: AppLocale,
): GuideLauncherCopy {
  return launcher[locale];
}
