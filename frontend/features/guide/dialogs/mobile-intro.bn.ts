import type { GuideDialog } from "@/features/guide/types/guide-types";

export const mobileIntroDialogs = {
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

  nudge: {
    eyebrow: "👋 ছোট্ট পরিচিতি",
    title: "এক মিনিটে স্মার্ট স্টক ঘুরে দেখবেন?",
    message:
      "মূল মেনু, Wealth আর ট্রেডিংয়ের দরকারি জায়গাগুলো খুব দ্রুত দেখিয়ে দিচ্ছি।",
  },
} as const;

export type MobileIntroNudgeDialog = (typeof mobileIntroDialogs)["nudge"];
export type MobileIntroStepDialog = GuideDialog;