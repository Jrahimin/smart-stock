import type {
  GuideControls,
  GuideLauncherCopy,
  GuideNudgeCopy,
} from "@/features/guide/dialogs/dashboard-dialogs";
import type { GuideDialog } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

type TaxPlannerGuideDialogKey = "welcome" | "quick" | "detailed" | "rebate" | "finish";

const dialogs = {
  en: {
    welcome: {
      eyebrow: "👋 A calmer tax season",
      message: "Let’s turn this year’s numbers into a clear starting point—before tax season gets noisy.",
    },
    quick: {
      eyebrow: "⚡ Start with the big picture",
      message: "Just need a first picture? These three yearly numbers give you a useful starting estimate.",
    },
    detailed: {
      eyebrow: "✦ When the year has more detail",
      message: "Need the estimate to match your year more closely? Detailed Planner adds the context, one short stop at a time.",
    },
    rebate: {
      eyebrow: "🌱 See the possible difference",
      message: "See how a possible eligible investment may change rebate and final tax—before any decision.",
    },
    finish: {
      eyebrow: "✨ Your path is clear",
      message: "Start quick, go detailed when needed, then explore the rebate picture. You’re ready to take it from here.",
    },
  },
  bn: {
    welcome: {
      eyebrow: "👋 Tax season, একটু শান্তভাবে",
      message: "চলুন, বছরের অঙ্কটা আগে থেকেই পরিষ্কার করি—শেষ মুহূর্তের চাপের আগেই।",
    },
    quick: {
      eyebrow: "⚡ আগে এক ঝলক",
      message: "এক ঝলক দেখতে চান? এই তিনটি yearly number-ই শুরু করার মতো estimate দেখাবে।",
    },
    detailed: {
      eyebrow: "✦ এবার একটু গভীরে",
      message: "হিসাবটা আপনার বছরের সঙ্গে আরও মিলিয়ে দেখতে চান? Detailed Planner-এ দরকারি তথ্যগুলো ধাপে ধাপে যোগ হবে।",
    },
    rebate: {
      eyebrow: "🌱 সম্ভাবনাটা মিলিয়ে দেখি",
      message: "এখানে আগে থেকেই দেখতে পারবেন—eligible investment বদলালে rebate আর final tax কীভাবে বদলাতে পারে।",
    },
    finish: {
      eyebrow: "✨ এবার আপনার পালা",
      message: "আগে Quick, দরকার হলে Detailed, তারপর rebate-এর ছবিটা দেখুন। এবার নিজের মতো করে explore করুন।",
    },
  },
} satisfies Record<AppLocale, Record<TaxPlannerGuideDialogKey, GuideDialog>>;

const controls = {
  en: {
    closeLabel: "Close Tax Planner guide", skipSectionTitle: "Leave the Tax Planner tour", skipConfirmTitle: "Leave the tour for now?", skipConfirmMessage: "You can replay this Tax Planner tour anytime from the mascot button.", mobileSkipConfirmMessage: "You can replay this Tax Planner tour anytime from the header mascot button.", suppressPrompts: "Do not show this guide automatically again", continue: "Keep going", dismiss: "Leave tour", previous: "Back", skip: "Skip", next: "Next", finish: "Finish", dashboardPhase: "Tax Planner", menuPhase: "Tax Planner", introPhase: "Tax Planner",
  },
  bn: {
    closeLabel: "Tax Planner guide বন্ধ করুন", skipSectionTitle: "Tax Planner tour থেকে বের হোন", skipConfirmTitle: "এখনকার মতো tour বন্ধ করবেন?", skipConfirmMessage: "পরে mascot button থেকে আবার Tax Planner tour দেখতে পারবেন।", mobileSkipConfirmMessage: "পরে header-এর mascot button থেকে আবার Tax Planner tour শুরু করতে পারবেন।", suppressPrompts: "এই guide আর নিজে থেকে দেখাবেন না", continue: "চালিয়ে যান", dismiss: "Tour বন্ধ করুন", previous: "পেছনে", skip: "বাদ দিন", next: "পরেরটা", finish: "শেষ করি", dashboardPhase: "Tax Planner", menuPhase: "Tax Planner", introPhase: "Tax Planner",
  },
} satisfies Record<AppLocale, GuideControls>;

const nudge = {
  en: { eyebrow: "👋 A quick Tax Planner tour", title: "Want a calmer first look at tax?", message: "I’ll show the quick estimate, the detailed route, and a safe way to preview rebate possibilities.", snooze: "Maybe later", dismiss: "Don’t ask again", accept: "Show me" },
  bn: { eyebrow: "👋 ছোট্ট Tax Planner tour", title: "Tax-এর অঙ্কটা আগে থেকে দেখবেন?", message: "Quick estimate, Detailed Planner আর rebate-এর সম্ভাবনা—ঝটপট পথটা দেখিয়ে দিচ্ছি।", snooze: "পরে দেখব", dismiss: "আর মনে করাবেন না", accept: "চলুন দেখি" },
} satisfies Record<AppLocale, GuideNudgeCopy>;

const launcher = {
  en: { ariaLabel: "Start Tax Planner guide", title: "Tax Planner tour" },
  bn: { ariaLabel: "Tax Planner guide শুরু করুন", title: "Tax Planner tour" },
} satisfies Record<AppLocale, GuideLauncherCopy>;

export function getTaxPlannerGuideDialogs(locale: AppLocale): Record<TaxPlannerGuideDialogKey, GuideDialog> { return dialogs[locale]; }
export function getTaxPlannerGuideControls(locale: AppLocale): GuideControls { return controls[locale]; }
export function getTaxPlannerGuideNudgeCopy(locale: AppLocale): GuideNudgeCopy { return nudge[locale]; }
export function getTaxPlannerGuideLauncherCopy(locale: AppLocale): GuideLauncherCopy { return launcher[locale]; }
