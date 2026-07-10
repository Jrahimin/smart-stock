import type { GuideDialog } from "@/features/guide/types/guide-types";

export const dashboardDialogs = {
  welcome: {
    eyebrow: "👋 স্বাগতম",
    message:
      "স্বাগতম! চলুন, মাত্র এক মিনিটে আজকের বাজারের গুরুত্বপূর্ণ ছবিটা দেখে নিই।",
  },

  pulse: {
    eyebrow: "📈 বাজারের মুড",
    message:
      "বাজার আজ আত্মবিশ্বাসী, নাকি একটু সতর্ক? DSEX, লেনদেন আর অংশগ্রহণ মিলিয়ে এখানেই বোঝা যাবে।",
  },

  breadth: {
    eyebrow: "🌿 ট্রেন্ডের শক্তি",
    message:
      "কয়েকটা শেয়ার নয়—পুরো বাজারে কী চলছে সেটাই গুরুত্বপূর্ণ। কতগুলো শেয়ার উঠছে আর কতগুলো নামছে, এক নজরে দেখুন।",
  },

  signals: {
    eyebrow: "🎯 স্মার্ট সিগন্যাল",
    message:
      "সিগন্যাল সম্ভাবনা দেখায়, নিশ্চয়তা নয়। সিদ্ধান্ত নেওয়ার আগে কারণ আর ঝুঁকিটাও দেখে নিন।",
  },

  discovery: {
    eyebrow: "🔍 সুযোগ খুঁজুন",
    message:
      "আজ সবচেয়ে নজর কাড়া শেয়ারগুলো এখানেই পাবেন। পছন্দের কোনোটি খুলে আরও বিস্তারিত বিশ্লেষণ করুন।",
  },

  sidebar: {
    eyebrow: "🚀 এবার কোথায়?",
    message:
      "দারুণ! এবার আপনার প্রয়োজন অনুযায়ী Stocks, Scanner, Signals বা Watchlist-এ চলে যান।",
  },
} as const satisfies Record<string, GuideDialog>;