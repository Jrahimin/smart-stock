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
      eyebrow: "Your active tax rules",
      message: "The planner automatically uses the latest rules published by the administrator.",
    },
    quick: {
      eyebrow: "Start with an annual estimate",
      message: "Quick uses three yearly amounts under the ordinary resident assumptions shown here. Filing credits are still unknown.",
    },
    detailed: {
      eyebrow: "Add the facts that matter",
      message: "Check your profile, income and eligible investments in three steps. Complex sources show a review warning before entry. Optional tax payments are available only when the active rules support filing balances. Your Quick entries stay here.",
    },
    rebate: {
      eyebrow: "Read the two totals",
      message: "Annual tax is after your current rebate. Could still save is the possible extra reduction from more eligible investment; it has not been deducted again. Move the slider to compare.",
    },
    finish: {
      eyebrow: "Review and find official help",
      message: "Resolve any missing facts and open the permanent guide for this year’s sources and the official e-Return link.",
    },
  },
  bn: {
    welcome: {
      eyebrow: "সক্রিয় করের নিয়ম",
      message: "পরিকল্পক স্বয়ংক্রিয়ভাবে প্রশাসকের প্রকাশিত সক্রিয় নিয়ম ব্যবহার করে।",
    },
    quick: {
      eyebrow: "বার্ষিক হিসাব দিয়ে শুরু করুন",
      message: "দ্রুত হিসাবে দেখানো সাধারণ নিবাসী করদাতার ধারণা অনুযায়ী তিনটি বার্ষিক অঙ্ক ব্যবহার হয়। কর সমন্বয় এখনও অজানা।",
    },
    detailed: {
      eyebrow: "প্রয়োজনীয় তথ্য যোগ করুন",
      message: "তিন ধাপে পরিচয়, আয় ও যোগ্য বিনিয়োগ যাচাই করুন। জটিল আয়ের উৎসে তথ্য দেওয়ার আগেই পর্যালোচনার বার্তা দেখাবে। সক্রিয় নিয়মে দাখিলের হিসাব থাকলেই ঐচ্ছিক কর পরিশোধ যোগ করা যাবে। দ্রুত হিসাবের তথ্য থাকবে।",
    },
    rebate: {
      eyebrow: "দুটি অঙ্ক বুঝে নিন",
      message: "বার্ষিক কর হলো বর্তমান রেয়াতের পরের অঙ্ক। আরও বাঁচতে পারে হলো অতিরিক্ত যোগ্য বিনিয়োগে সম্ভাব্য বাড়তি সাশ্রয়; এটি আবার বাদ দেওয়া হয়নি। তুলনা করতে স্লাইডার সরান।",
    },
    finish: {
      eyebrow: "যাচাই করুন ও সরকারি সাহায্য দেখুন",
      message: "অসম্পূর্ণ তথ্য যাচাই করুন। এই করবর্ষের উৎস ও সরকারি ই-রিটার্নের জন্য স্থায়ী নির্দেশিকা খুলুন।",
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
