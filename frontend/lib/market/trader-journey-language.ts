import type { AppLocale } from "@/lib/locale/app-locale";

const language = {
  en: {
    holding: "For your holding", publicAction: "Dated public action", adding: "Adding to this position", sourceDetails: "Published source details",
    medianVolume: (ratio: string) => `Volume ${ratio}× prior 20-session median`,
    publishedTrigger: (price: string) => `Watch ${price} · compare with the Trade Plan`,
    pendingTrigger: (price: string) => `Trade Plan: close above ${price} with volume confirmation`,
    excludedSectors: (count: number) => `${count} ${count === 1 ? "sector excluded" : "sectors excluded"}: not enough comparable stock data`,
    noAdvancingSector: "No advancing sector", sectorUnavailable: "Sector comparison unavailable",
  },
  bn: {
    holding: "বর্তমান হোল্ডিংয়ের জন্য", publicAction: "প্রকাশিত সাধারণ অ্যাকশন", adding: "এই পজিশনে আরও যোগ করার ক্ষেত্রে", sourceDetails: "প্রকাশিত তথ্যের বিস্তারিত",
    medianVolume: (ratio: string) => `Volume ${ratio}× আগের 20-session median`,
    publishedTrigger: (price: string) => `${price} নজরে রাখুন · Trade Plan-এর সঙ্গে মিলিয়ে নিন`,
    pendingTrigger: (price: string) => `Trade Plan: ${price}-এর ওপরে close ও volume confirmation প্রয়োজন`,
    excludedSectors: (count: number) => `${count}টি sector বাদ: পর্যাপ্ত তুলনাযোগ্য তথ্য নেই`,
    noAdvancingSector: "কোনো sector-এর দাম বাড়েনি", sectorUnavailable: "Sector-এর তুলনার তথ্য নেই",
  },
};

export const getTraderJourneyLanguage = (locale: AppLocale) => language[locale];
