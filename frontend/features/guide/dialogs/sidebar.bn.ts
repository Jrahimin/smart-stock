import type { GuideDialog } from "@/features/guide/types/guide-types";

export const sidebarDialogs = {
  dashboard: {
    eyebrow: "ড্যাশবোর্ড",
    message: "আজকের বাজারের মূল ছবি এক জায়গায় দেখুন।",
  },
  stocks: {
    eyebrow: "স্টকস",
    message: "শেয়ার খুঁজে দাম, চার্ট আর বিশ্লেষণ দেখুন।",
  },
  marketPulse: {
    eyebrow: "মার্কেট পালস",
    message: "আজকের বাজারের গল্প, ফোকাস স্টক আর সতর্কতা দেখুন।",
  },
  scanner: {
    eyebrow: "স্ক্যানার",
    message: "আপনার শর্তে সম্ভাবনাময় শেয়ার খুঁজে নিন।",
  },
  signals: {
    eyebrow: "সিগন্যালস",
    message: "BUY, SELL বা HOLD-এর কারণসহ সিগন্যাল দেখুন।",
  },
  watchlist: {
    eyebrow: "ওয়াচলিস্ট",
    message: "পছন্দের শেয়ারগুলো একসাথে নজরে রাখুন।",
  },
  wealthWorkspace: {
    eyebrow: "ওয়েলথ ওয়ার্কস্পেস",
    message: "লক্ষ্য, আয় আর ভবিষ্যতের পরিকল্পনা গুছিয়ে নিন।",
  },
} as const satisfies Record<string, GuideDialog>;
