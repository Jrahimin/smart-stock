import type { GuideDialog } from "@/features/guide/types/guide-types";

export const dashboardDialogs = {
  welcome: {
    eyebrow: "আজকের বাজার",
    message: "চলুন, আজকের বাজারটা এক নজরে দেখি। আগে বড় ছবিটা বুঝি।",
  },
  pulse: {
    eyebrow: "মার্কেট পালস",
    message: "DSEX, লেনদেন আর অংশগ্রহণ দেখে আজকের বাজারের মুড আগে বুঝুন।",
  },
  breadth: {
    eyebrow: "ট্রেন্ডের শক্তি",
    message: "বেশিরভাগ শেয়ার উঠছে, নাকি নামছে—এখানে ট্রেন্ডের শক্তি বোঝা যায়।",
  },
  signals: {
    eyebrow: "স্মার্ট সিগন্যাল",
    message: "সিগন্যাল দেখুন, তবে কারণ আর ঝুঁকি মিলিয়েই সিদ্ধান্ত নিন।",
  },
  discovery: {
    eyebrow: "খোঁজার জায়গা",
    message: "এখানে নড়াচড়া বেশি এমন শেয়ার খুঁজুন, তারপর বিস্তারিত যাচাই করুন।",
  },
  sidebar: {
    eyebrow: "আপনার পরের কাজ",
    message: "এখন দেখুন, কোন কাজের জন্য কোথায় যাবেন।",
  },
} as const satisfies Record<string, GuideDialog>;
