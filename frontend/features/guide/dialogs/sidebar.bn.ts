import type { GuideDialog } from "@/features/guide/types/guide-types";

export const sidebarDialogs = {
  dashboard: {
    eyebrow: "🏠 ড্যাশবোর্ড",
    message:
      "প্রতিদিন এখান থেকেই শুরু করুন। পুরো বাজারের গুরুত্বপূর্ণ ছবিটা এক নজরেই বুঝে যাবেন।",
  },

  stocks: {
    eyebrow: "📈 স্টকস",
    message:
      "যে কোনো শেয়ার খুঁজে চার্ট, ফান্ডামেন্টাল, সিগন্যাল আর বিশ্লেষণ এক জায়গায় দেখুন।",
  },

  marketPulse: {
    eyebrow: "🔥 মার্কেট পালস",
    message:
      "আজ বাজারে আসলে কী হচ্ছে? ট্রেন্ড, আলোচনার কেন্দ্র আর গুরুত্বপূর্ণ সতর্কতা এখানেই।",
  },

  scanner: {
    eyebrow: "🔍 স্ক্যানার",
    message:
      "শত শত শেয়ার ঘাঁটতে হবে না। আপনার শর্তে সম্ভাবনাময় স্টকগুলো আমি খুঁজে দেব।",
  },

  signals: {
    eyebrow: "🎯 সিগন্যালস",
    message:
      "শুধু BUY বা SELL নয়—কেন সেই সিদ্ধান্ত এসেছে, সেটাও পরিষ্কারভাবে দেখুন।",
  },

  watchlist: {
    eyebrow: "⭐ ওয়াচলিস্ট",
    message:
      "গুরুত্বপূর্ণ শেয়ারগুলো আলাদা করে রাখুন, যেন কোনো সুযোগ বা পরিবর্তন চোখ এড়িয়ে না যায়।",
  },

  wealthWorkspace: {
    eyebrow: "💰 ওয়েলথ",
    message:
      "শুধু শেয়ার নয়—FDR, DPS, যাকাত, ট্যাক্স সহ আরও অনেক আর্থিক পরিকল্পনা এখান থেকেই করুন।",
  },
} as const satisfies Record<string, GuideDialog>;