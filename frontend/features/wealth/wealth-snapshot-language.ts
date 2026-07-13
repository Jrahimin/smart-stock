import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type SnapshotEntryId =
  | "cash"
  | "fdr"
  | "dps"
  | "sanchayapatra"
  | "stocks"
  | "gold"
  | "property"
  | "loan"
  | "other";

export type WealthSnapshotLanguage = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  metrics: {
    netWorth: string;
    totalAssets: string;
    totalLiabilities: string;
  };
  completeness: {
    eyebrow: string;
    ariaLabel: (complete: number, total: number) => string;
    summary: (complete: number, total: number) => string;
    items: Record<string, string>;
  };
  addSection: {
    eyebrow: string;
    title: string;
    drawerHint: string;
    improveProjections: string;
    hideDetails: string;
    advancedHelper: string;
    addToList: string;
    readyToSave: string;
    readyHint: string;
    saving: string;
    save: string;
    signIn: string;
    signInHint: string;
    saved: string;
  };
  entryOptions: Record<SnapshotEntryId, string>;
  upcoming: {
    title: string;
    empty: string;
    next30Days: string;
    next12Months: string;
    matures: string;
    emi: string;
    completed: string;
    profit: string;
  };
  monthlySavings: {
    title: string;
    hint: string;
    label: string;
  };
  allocation: {
    title: string;
    empty: string;
    centerLabel: string;
  };
  entryList: {
    savedItems: (count: number) => string;
    scrollHint: string;
    edit: string;
    remove: string;
    save: string;
    cancel: string;
    done: string;
    editItem: (label: string) => string;
    removeItem: (label: string) => string;
  };
  fields: Record<string, string>;
  profitDistribution: Record<string, string>;
  goldUnits: Record<string, string>;
};

const english: WealthSnapshotLanguage = {
  hero: {
    eyebrow: "My Financial Picture",
    title: "Money Snapshot",
    description:
      "Start with a few broad numbers. Add dates, rates, and notes only when they help your future projections.",
  },
  metrics: {
    netWorth: "Net Worth",
    totalAssets: "Total Assets",
    totalLiabilities: "Total Liabilities",
  },
  completeness: {
    eyebrow: "Snapshot Completeness",
    ariaLabel: (complete, total) => `Snapshot completeness: ${complete} of ${total} completed`,
    summary: (complete, total) => `${complete} of ${total} completed`,
    items: {
      assets: "Assets Added",
      rates: "Rates Added",
      dates: "Dates Added",
      savings: "Monthly Savings",
    },
  },
  addSection: {
    eyebrow: "Add gradually",
    title: "What would you like to add?",
    drawerHint: "Start with the amount. You can improve projections now or later.",
    improveProjections: "✨ Improve Projections",
    hideDetails: "Hide projection details",
    advancedHelper:
      "These optional details unlock future value projections, maturity timelines, reminders, and smarter insights.",
    addToList: "Add to list",
    readyToSave: "Ready to save?",
    readyHint: "Your list is stored here until you save it to your account.",
    saving: "Saving...",
    save: "Save Money Snapshot",
    signIn: "Sign in",
    signInHint: "to save your snapshot to your account. Until then, items stay on this device only.",
    saved: "Money Snapshot updated.",
  },
  entryOptions: {
    cash: "Cash",
    fdr: "FDR",
    dps: "DPS",
    sanchayapatra: "Sanchayapatra",
    stocks: "Stocks",
    gold: "Gold",
    property: "Property",
    loan: "Loan",
    other: "Other",
  },
  upcoming: {
    title: "Upcoming Money Events",
    empty: "Add a maturity date, profit rate, or EMI to see upcoming money events.",
    next30Days: "Next 30 Days",
    next12Months: "Next 12 Months",
    matures: "matures",
    emi: "EMI",
    completed: "completed",
    profit: "profit",
  },
  monthlySavings: {
    title: "Monthly savings",
    hint: "Optional. This improves your dashboard without becoming a full financial profile.",
    label: "How much do you usually save monthly?",
  },
  allocation: {
    title: "Asset Allocation",
    empty: "Add assets to see how your money is distributed.",
    centerLabel: "Assets",
  },
  entryList: {
    savedItems: (count) => `Saved items (${count})`,
    scrollHint: "Scroll for more",
    edit: "Edit",
    remove: "Remove",
    save: "Save changes",
    cancel: "Cancel",
    done: "Done",
    editItem: (label: string) => `Edit ${label}`,
    removeItem: (label: string) => `Remove ${label}`,
  },
  fields: {
    amount: "Amount",
    labelOptional: "Name or label (optional)",
    paymentCount: "No. of payments",
    weightOptional: "Weight (optional)",
    unitOptional: "Unit (optional)",
    interestRate: "Interest rate (%)",
    rateOverride: "Rate override (%) (optional)",
    accountOptional: "Optional reference number",
    profitSharing: "Profit sharing",
    profitDistribution: "Profit distribution",
    certificateType: "Certificate type",
    startDate: "Start date",
    maturityDateOptional: "End / maturity date (optional)",
    maturityDate: "End / maturity date",
    sourceTax: "Source tax (%)",
    customSourceTax: "Custom source tax (%)",
    governmentRate: "Government default rate",
    governmentRateHint: "Updated from configuration.",
    defaultRate: "Default rate",
    notesOptional: "Notes (optional)",
    certificateNumber: "Certificate / SP no. (optional)",
    outstandingBalance: "Outstanding balance",
    emiOptional: "EMI amount (optional)",
    loanNameOptional: "Loan name (optional)",
    loanAccountOptional: "Loan account number (optional)",
    remainingMonths: "Remaining months",
    loanStartOptional: "Loan start date (optional)",
    autoMaturity: "Auto from certificate term",
    optionalReference: "Optional reference",
  },
  profitDistribution: {
    maturity: "Compound at maturity",
    monthly: "Monthly profit payout",
    quarterly: "Quarterly profit payout",
    yearly: "Yearly profit payout",
    atMaturity: "At maturity",
  },
  goldUnits: {
    gram: "Gram",
    vori: "Vori",
    tola: "Tola",
    ounce: "Ounce",
  },
};

const bangla: WealthSnapshotLanguage = {
  hero: {
    eyebrow: "আমার financial picture",
    title: "Money Snapshot",
    description:
      "শুরুতে মোটামুটি কয়েকটা সংখ্যাই যথেষ্ট। Projection আরও বাস্তব করতে দরকার হলে তারিখ, rate আর note যোগ করুন।",
  },
  metrics: {
    netWorth: "Net Worth",
    totalAssets: "মোট Assets",
    totalLiabilities: "মোট Liabilities",
  },
  completeness: {
    eyebrow: "Snapshot কতটা পূর্ণ",
    ariaLabel: (complete, total) => `Snapshot কতটা পূর্ণ: ${complete}/${total} সম্পন্ন`,
    summary: (complete, total) => `${complete}/${total} সম্পন্ন`,
    items: {
      assets: "Assets যোগ হয়েছে",
      rates: "Rate যোগ হয়েছে",
      dates: "তারিখ যোগ হয়েছে",
      savings: "মাসিক savings",
    },
  },
  addSection: {
    eyebrow: "ধীরে ধীরে যোগ করুন",
    title: "এবার কী যোগ করবেন?",
    drawerHint: "প্রথমে amount দিন। Projection-এর extra detail এখনই বা পরে যোগ করতে পারেন।",
    improveProjections: "✨ Projection আরও কাজে লাগুক",
    hideDetails: "বিস্তারিত লুকান",
    advancedHelper:
      "এই optional তথ্য future value, maturity timeline, reminder আর insight-কে আরও পরিষ্কার করে।",
    addToList: "তালিকায় যোগ করুন",
    readyToSave: "Save করবেন?",
    readyHint: "Account-এ save না করা পর্যন্ত এই তালিকা শুধু এই device-এ থাকবে।",
    saving: "Save হচ্ছে...",
    save: "Money Snapshot save করুন",
    signIn: "Sign in",
    signInHint: "করলে Money Snapshot account-এ sync হবে। ততক্ষণ এটি শুধু এই device-এ থাকবে।",
    saved: "Money Snapshot আপডেট হয়েছে।",
  },
  entryOptions: {
    cash: "Cash",
    fdr: "FDR",
    dps: "DPS",
    sanchayapatra: "Sanchayapatra",
    stocks: "Stocks",
    gold: "Gold",
    property: "Property",
    loan: "Loan",
    other: "Other",
  },
  upcoming: {
    title: "সামনের money events",
    empty: "Maturity date, profit rate বা EMI যোগ করলে সামনে কী আসছে তা দেখা যাবে।",
    next30Days: "আগামী 30 দিন",
    next12Months: "আগামী 12 মাস",
    matures: "maturity হবে",
    emi: "EMI",
    completed: "শেষ",
    profit: "profit",
  },
  monthlySavings: {
    title: "মাসিক savings",
    hint: "ঐচ্ছিক। Dashboard-এর projection ভালো হবে, কিন্তু পুরো profile বানাতে হবে না।",
    label: "সাধারণত মাসে কত save করেন?",
  },
  allocation: {
    title: "Asset Allocation",
    empty: "Asset যোগ করলে টাকা কোথায় আছে তা দেখা যাবে।",
    centerLabel: "Assets",
  },
  entryList: {
    savedItems: (count) => `এই তালিকায় (${count})`,
    scrollHint: "আরও দেখতে scroll করুন",
    edit: "Edit",
    remove: "সরান",
    save: "Save করুন",
    cancel: "বাতিল",
    done: "হয়ে গেছে",
    editItem: (label: string) => `${label} edit করুন`,
    removeItem: (label: string) => `${label} সরান`,
  },
  fields: {
    amount: "Amount",
    labelOptional: "নাম বা label (ঐচ্ছিক)",
    paymentCount: "কতটি payment",
    weightOptional: "ওজন (ঐচ্ছিক)",
    unitOptional: "Unit (ঐচ্ছিক)",
    interestRate: "Interest rate (%)",
    rateOverride: "Rate override (%) (ঐচ্ছিক)",
    accountOptional: "Reference number (ঐচ্ছিক)",
    profitSharing: "Profit sharing",
    profitDistribution: "Profit distribution",
    certificateType: "Certificate type",
    startDate: "শুরুর তারিখ",
    maturityDateOptional: "Maturity date (ঐচ্ছিক)",
    maturityDate: "Maturity date",
    sourceTax: "Source tax (%)",
    customSourceTax: "Custom source tax (%)",
    governmentRate: "Government default rate",
    governmentRateHint: "Configuration থেকে আপডেট।",
    defaultRate: "Default rate",
    notesOptional: "Note (ঐচ্ছিক)",
    certificateNumber: "Certificate / SP no. (ঐচ্ছিক)",
    outstandingBalance: "বাকি loan amount",
    emiOptional: "EMI amount (ঐচ্ছিক)",
    loanNameOptional: "Loan-এর নাম (ঐচ্ছিক)",
    loanAccountOptional: "Loan account number (ঐচ্ছিক)",
    remainingMonths: "বাকি মাস",
    loanStartOptional: "Loan শুরুর তারিখ (ঐচ্ছিক)",
    autoMaturity: "Certificate term থেকে auto",
    optionalReference: "Reference (ঐচ্ছিক)",
  },
  profitDistribution: {
    maturity: "Maturity-তে compound",
    monthly: "মাসে profit payout",
    quarterly: "প্রতি quarter payout",
    yearly: "বছরে payout",
    atMaturity: "Maturity-তে",
  },
  goldUnits: {
    gram: "Gram",
    vori: "Vori",
    tola: "Tola",
    ounce: "Ounce",
  },
};

const WEALTH_SNAPSHOT_LANGUAGE: Record<AppLocale, WealthSnapshotLanguage> = {
  en: english,
  bn: bangla,
};

export function getWealthSnapshotLanguage(locale: AppLocale = DEFAULT_LOCALE) {
  return WEALTH_SNAPSHOT_LANGUAGE[locale] ?? WEALTH_SNAPSHOT_LANGUAGE[DEFAULT_LOCALE];
}

export function localizeSnapshotAllocationLabel(key: string, locale: AppLocale) {
  const labels = getWealthSnapshotLanguage(locale).entryOptions;
  return labels[key as SnapshotEntryId] ?? key;
}

export function localizeUpcomingEventLabel(label: string, locale: AppLocale) {
  if (locale !== "bn") {
    return label;
  }
  const copy = getWealthSnapshotLanguage(locale).upcoming;
  if (label.endsWith(" matures")) {
    return label.replace(" matures", ` ${copy.matures}`);
  }
  if (label.endsWith(" EMI")) {
    return label.replace(" EMI", ` ${copy.emi}`);
  }
  if (label.endsWith(" completed")) {
    return label.replace(" completed", ` ${copy.completed}`);
  }
  if (label.endsWith(" profit")) {
    return label.replace(" profit", ` ${copy.profit}`);
  }
  return label;
}
