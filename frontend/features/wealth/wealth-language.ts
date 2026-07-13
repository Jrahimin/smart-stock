import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

import type {
  WealthComparisonSlug,
  WealthInsightCard,
  WealthIntentHref,
  WealthScenarioId,
  WealthSeasonalContext,
} from "@/features/wealth/types/wealth-types";

type WealthLandingInsightId =
  | "snapshot-empty"
  | "monthly-savings"
  | "debt-ratio"
  | "goal-progress";

type WealthLandingLanguage = {
  nav: {
    ariaLabel: string;
    overview: string;
    taxPlanner: string;
    snapshot: string;
    timeTravel: string;
    compare: string;
    calculators: string;
    localeSwitcherAria: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    intentLabels: Record<WealthIntentHref, string>;
  };
  seasonal: {
    eyebrow: string;
    bySeason: Record<
      string,
      {
        title: string;
        description: string;
        ctaLabel: string;
      }
    >;
  };
  scenarios: {
    eyebrow: string;
    title: string;
    description: string;
    items: Record<
      WealthScenarioId,
      {
        eyebrow: string;
        title: string;
        description: string;
        cue: string;
      }
    >;
  };
  comparison: {
    eyebrow: string;
    title: string;
    cardCta: string;
    items: Record<
      WealthComparisonSlug,
      {
        title: string;
        description: string;
        cue: string;
      }
    >;
  };
  snapshot: {
    guestEyebrow: string;
    guestTitle: string;
    guestDescription: string;
    localScenarioSingular: string;
    localScenarioPlural: string;
    addAssets: string;
    signInToSync: string;
    eyebrow: string;
    title: string;
    description: string;
    netWorth: string;
    monthlySavings: string;
    passiveIncome: string;
    savedScenarios: string;
    netWorthHint: string;
    updateAssets: string;
    clarity: string;
    clarityTitle: string;
    clarityDescription: string;
  };
  insights: {
    cardEyebrow: string;
    eyebrow: string;
    title: string;
    cards: Record<
      WealthLandingInsightId,
      {
        title: string;
        body: string;
      }
    >;
    actionLabels: Record<string, string>;
    education: string[];
  };
  states: {
    loading: string;
    empty: string;
    error: string;
  };
};

const wealthLanguage = {
  en: {
    nav: {
      ariaLabel: "Wealth workspace",
      overview: "Overview",
      taxPlanner: "Tax Planner",
      snapshot: "Snapshot",
      timeTravel: "Time Travel",
      compare: "DPS vs FDR",
      calculators: "Calculators",
      localeSwitcherAria: "Wealth Workspace language",
    },
    hero: {
      eyebrow: "My Money",
      title: "Explore your money decisions before you make them",
      description:
        "Understand today's choice. See tomorrow's impact. No forms. No accounting. Just clarity.",
      intentLabels: {
        "/wealth/tools/tax-planner": "Tax Planner",
        "/wealth/tools/dps": "DPS — save monthly",
        "/wealth/tools/fdr": "FDR — lock money",
        "/wealth/tools/sanchayapatra": "Sanchayapatra",
        "/wealth/tools/compound-growth": "Invest",
        "/wealth/tools/emi": "Loan / EMI",
        "/wealth/tools/zakat": "Zakat",
        "/wealth/tools/retirement": "Retirement goal",
      },
    },
    seasonal: {
      eyebrow: "Today's Money Lens",
      bySeason: {
        income_tax_season: {
          title: "Income tax season — get your estimate in order",
          description:
            "See how salary, investments, and rebates may shape your return before deadline pressure kicks in.",
          ctaLabel: "Open Tax Planner",
        },
        // Future seasonal lens — enable when `season_key` is `ramadan` in wealth_guide_service.py
        ramadan: {
          title: "A calm moment for Zakat and giving",
          description:
            "Use this season to understand eligible wealth, obligations, and what matters most to you.",
          ctaLabel: "Calculate Zakat",
        },
      },
    },
    scenarios: {
      eyebrow: "Start with your question",
      title: "What are you trying to understand?",
      description:
        "Choose the money story that feels closest to today's decision.",
      items: {
        "tax-planning": {
          eyebrow: "I want to plan taxes",
          title: "Estimate yearly tax",
          description:
            "Explore how income and tax saving investments may affect your estimate.",
          cue: "planning",
        },
        "extra-savings": {
          eyebrow: "I have extra savings",
          title: "Lock money in FDR",
          description:
            "See what steadiness gives you, and what flexibility you give up.",
          cue: "steady",
        },
        "passive-income": {
          eyebrow: "I want passive income",
          title: "Plan government savings income",
          description:
            "Explore how today's savings could provide steady family income and future maturity.",
          cue: "income",
        },
        "retire-earlier": {
          eyebrow: "I want to retire earlier",
          title: "Grow a monthly habit",
          description:
            "Watch small recurring decisions change the long-term picture.",
          cue: "habit",
        },
        loan: {
          eyebrow: "I have a loan to plan",
          title: "Understand loan pressure",
          description:
            "See monthly EMI, total interest, and what prepaying could change.",
          cue: "loan",
        },
        zakat: {
          eyebrow: "I need to calculate Zakat",
          title: "Prepare Zakat calmly",
          description:
            "Estimate eligible wealth with space for care and context.",
          cue: "care",
        },
        compare: {
          eyebrow: "I want to compare my options",
          title: "Choose between two paths",
          description:
            "Turn a money decision into a side-by-side story.",
          cue: "choice",
        },
        inflation: {
          eyebrow: "Prices may keep rising",
          title: "Protect purchasing power",
          description:
            "See the headline number beside what it may feel like later.",
          cue: "real",
        },
      },
    },
    comparison: {
      eyebrow: "Compare choices",
      title: "Which path feels more interesting?",
      cardCta: "Open the story",
      items: {
        "dps-vs-fdr": {
          title: "Two paths. Different futures.",
          description:
            "One path rewards consistency. One path rewards certainty. Visit your future and see where each decision leads.",
          cue: "Recommended first",
        },
        "fdr-vs-stocks": {
          title: "Steady deposit or market growth?",
          description:
            "Compare predictability with the patience needed for investing.",
          cue: "Growth path",
        },
        "save-vs-spend": {
          title: "Enjoy today or keep future options?",
          description:
            "See the quiet opportunity cost behind a spending choice.",
          cue: "Life choice",
        },
        "loan-prepayment-vs-investing": {
          title: "Clear debt or invest instead?",
          description:
            "Compare the comfort of certainty with possible upside.",
          cue: "Debt decision",
        },
        "inflation-impact": {
          title: "Headline money or real value?",
          description:
            "See how inflation quietly changes what money feels like.",
          cue: "Reality check",
        },
      },
    },
    snapshot: {
      guestEyebrow: "My Financial Picture",
      guestTitle: "Build your Money Snapshot over time",
      guestDescription:
        "A read-only preview until you add your picture. Start with a scenario, then save cash, deposits, loans, and goals when they feel relevant.",
      localScenarioSingular:
        "You already have {count} saved scenario locally.",
      localScenarioPlural:
        "You already have {count} saved scenarios locally.",
      addAssets: "Add assets & liabilities",
      signInToSync: "Sign in to sync later",
      eyebrow: "Money Snapshot",
      title: "Your financial picture",
      description:
        "A live summary from saved assets, liabilities, and scenarios—not a full accounting setup.",
      netWorth: "Net worth",
      monthlySavings: "Monthly savings",
      passiveIncome: "Passive income",
      savedScenarios: "Saved scenarios",
      netWorthHint: "Assets minus liabilities you have saved",
      updateAssets: "Add or update assets & liabilities",
      clarity: "Clarity",
      clarityTitle: "Based on useful context, not wealth size",
      clarityDescription:
        "Clarity grows as you save context—monthly savings, assets, liabilities, goals, and scenarios.",
    },
    insights: {
      cardEyebrow: "Insight",
      eyebrow: "Gentle observations",
      title: "What your picture suggests so far",
      cards: {
        "snapshot-empty": {
          title: "Your picture can grow over time",
          body:
            "Use any calculator and save what matters. Your Money Snapshot will build itself gradually.",
        },
        "monthly-savings": {
          title: "Savings rhythm is visible",
          body:
            "You are currently tracking about {amount}/month in savings capacity.",
        },
        "debt-ratio": {
          title: "Debt is part of the picture",
          body:
            "Liabilities are about {ratio}% of total assets in this snapshot.",
        },
        "goal-progress": {
          title: "Goal in motion: {goal}",
          body:
            "You are about {progress}% toward this goal in the current snapshot.",
        },
      },
      actionLabels: {
        "Explore scenarios": "Explore scenarios",
      },
      education: [
        "Inflation can make a fixed return feel smaller than it looks.",
        "Liquidity often matters before headline return.",
        "Comparing paths is usually more useful than one isolated number.",
        "Your Money Snapshot can grow gradually—no big setup required.",
      ],
    },
    states: {
      loading: "Your Wealth Workspace is getting ready…",
      empty:
        "No saved picture yet. Start with one question and add context when it feels useful.",
      error:
        "Wealth data is unavailable right now. You can still explore the calculators below.",
    },
  },

  bn: {
    nav: {
      ariaLabel: "Wealth Workspace",
      overview: "Overview",
      taxPlanner: "Tax Planner",
      snapshot: "Money Snapshot",
      timeTravel: "Time Travel",
      compare: "DPS vs FDR",
      calculators: "Calculators",
      localeSwitcherAria: "Wealth Workspace-এর ভাষা",
    },

    hero: {
      eyebrow: "My Money",
      title: "সিদ্ধান্ত নেওয়ার আগে ভবিষ্যৎটা দেখে নিন",
      description:
        "আজ কী করবেন, আর তাতে সামনে কী বদলাতে পারে—সহজভাবে বুঝে নিন। লম্বা form নয়, জটিল হিসাবও নয়।",
      intentLabels: {
        "/wealth/tools/tax-planner": "Tax Planner",
        "/wealth/tools/dps": "DPS — মাসে মাসে savings",
        "/wealth/tools/fdr": "FDR — নির্দিষ্ট সময়ের জন্য টাকা রাখুন",
        "/wealth/tools/sanchayapatra": "Sanchayapatra",
        "/wealth/tools/compound-growth": "Invest",
        "/wealth/tools/emi": "Loan / EMI",
        "/wealth/tools/zakat": "Zakat",
        "/wealth/tools/retirement": "Retirement Goal",
      },
    },

    seasonal: {
      eyebrow: "Today's Money Lens",
      bySeason: {
        income_tax_season: {
          title: "এই কর বছরের Income tax এর হিসাবটা বুঝে নিন",
          description:
            "বেতন, investment আর rebate কীভাবে return-এ প্রভাব ফেলতে পারে—deadline চাপ আসার আগেই দেখে নিতে পারেন।",
          ctaLabel: "Tax estimate দেখুন",
        },
        // Future seasonal lens — enable when `season_key` is `ramadan` in wealth_guide_service.py
        ramadan: {
          title: "Zakat-এর হিসাবটা এবার গুছিয়ে নিন",
          description:
            "কোন সম্পদ Zakat-এর মধ্যে আসবে, কত হতে পারে, আর কীভাবে প্রস্তুতি নেবেন—ধীরে ধীরে দেখে নিন।",
          ctaLabel: "Zakat হিসাব করুন",
        },
      },
    },

    scenarios: {
      eyebrow: "Start with your question",
      title: "আজ কোন সিদ্ধান্ত নিয়ে ভাবছেন?",
      description:
        "আপনার বর্তমান প্রশ্নের সঙ্গে যে option-টা সবচেয়ে মেলে, সেখান থেকেই শুরু করুন।",
      items: {
        "tax-planning": {
          eyebrow: "Tax নিয়ে আগে থেকে ভাবতে চাই",
          title: "বছরের tax কত হতে পারে?",
          description:
            "Income আর investment বদলালে tax estimate কীভাবে বদলায়, আগে দেখে নিন।",
          cue: "planning",
        },

        "extra-savings": {
          eyebrow: "হাতে কিছু extra savings আছে",
          title: "FDR-এ রাখলে কী পাবেন?",
          description:
            "Return কত হবে, টাকা কতদিন আটকে থাকবে, আর flexibility কতটা থাকবে—একসঙ্গে দেখুন।",
          cue: "steady",
        },

        "passive-income": {
          eyebrow: "নিয়মিত income চাই",
          title: "Sanchayapatra থেকে আয় কেমন হতে পারে?",
          description:
            "আজকের savings থেকে নিয়মিত income আর maturity-তে কত পাওয়া যেতে পারে, দেখে নিন।",
          cue: "income",
        },

        "retire-earlier": {
          eyebrow: "আগে থেকেই future গুছাতে চাই",
          title: "মাসে মাসে savings কতদূর নিয়ে যাবে?",
          description:
            "ছোট একটা নিয়মিত অভ্যাস কয়েক বছর পর কত বড় হতে পারে, দেখে নিন।",
          cue: "habit",
        },

        loan: {
          eyebrow: "Loan-এর চাপ বুঝতে চাই",
          title: "EMI আর total interest পরিষ্কার করুন",
          description:
            "মাসে কত যাবে, মোট কত দিতে হবে, আর আগে শোধ করলে কী বদলাবে—সব এক জায়গায় দেখুন।",
          cue: "loan",
        },

        zakat: {
          eyebrow: "Zakat হিসাব করতে চাই",
          title: "Zakat-এর প্রস্তুতি সহজ করুন",
          description:
            "কোন সম্পদ ধরা হবে আর আনুমানিক কত হতে পারে, ধাপে ধাপে বুঝে নিন।",
          cue: "care",
        },

        compare: {
          eyebrow: "দুইটা option মিলিয়ে দেখতে চাই",
          title: "কোন পথে কী পাওয়া যাবে?",
          description:
            "দুই সিদ্ধান্ত পাশাপাশি রেখে লাভ, সীমাবদ্ধতা আর ভবিষ্যৎ ফল তুলনা করুন।",
          cue: "choice",
        },

        inflation: {
          eyebrow: "দাম তো বাড়তেই থাকে",
          title: "ভবিষ্যতে টাকার আসল মূল্য কত থাকবে?",
          description:
            "আজকের বড় number কয়েক বছর পর বাস্তবে কতটা কাজে আসবে, সেটা দেখে নিন।",
          cue: "real",
        },
      },
    },

    comparison: {
      eyebrow: "Compare choices",
      title: "দুই পথের ভবিষ্যৎ পাশাপাশি দেখুন",
      cardCta: "তুলনা করে দেখুন →",
      items: {
        "dps-vs-fdr": {
          title: "DPS না FDR—কোনটা আপনার জন্য?",
          description:
            "একটায় মাসে মাসে অভ্যাস গড়ে, আরেকটায় শুরুতেই টাকা রেখে নিশ্চয়তা পাওয়া যায়। দুটো পথ কোথায় নিয়ে যেতে পারে, দেখুন।",
          cue: "Recommended first",
        },

        "fdr-vs-stocks": {
          title: "FDR-এর নিশ্চয়তা, নাকি Stock-এর growth?",
          description:
            "একদিকে স্থির return, অন্যদিকে ওঠানামার সঙ্গে বেশি growth-এর সম্ভাবনা। কোনটা আপনার পরিকল্পনার সঙ্গে মেলে?",
          cue: "Growth path",
        },

        "save-vs-spend": {
          title: "আজ খরচ করবেন, নাকি future option রাখবেন?",
          description:
            "আজকের আনন্দ আর আগামী দিনের সুযোগ—দুটোর trade-off সহজভাবে দেখুন।",
          cue: "Life choice",
        },

        "loan-prepayment-vs-investing": {
          title: "Loan আগে কমাবেন, নাকি invest করবেন?",
          description:
            "এক পথে ঋণের চাপ কমে, অন্য পথে growth-এর সুযোগ থাকে। আপনার জন্য কোনটা বেশি স্বস্তির, দেখুন।",
          cue: "Debt decision",
        },

        "inflation-impact": {
          title: "টাকার amount বাড়ছে, কিন্তু value?",
          description:
            "Inflation কীভাবে ধীরে ধীরে টাকার buying power কমায়, সেটা বাস্তব সংখ্যায় দেখুন।",
          cue: "Reality check",
        },
      },
    },

    snapshot: {
      guestEyebrow: "My Financial Picture",
      guestTitle: "ধীরে ধীরে আপনার Money Snapshot তৈরি করুন",
      guestDescription:
        "শুরুতেই সব তথ্য দিতে হবে না। একটা scenario দিয়ে শুরু করুন, তারপর প্রয়োজন হলে cash, deposit, loan আর goal যোগ করুন।",
      localScenarioSingular:
        "এই device-এ আপনার {count}টি saved scenario আছে।",
      localScenarioPlural:
        "এই device-এ আপনার {count}টি saved scenario আছে।",
      addAssets: "Assets & liabilities যোগ করুন",
      signInToSync: "Sync করতে Sign in করুন",
      eyebrow: "Money Snapshot",
      title: "আপনার টাকার পুরো ছবি",
      description:
        "Saved assets, liabilities আর scenario মিলিয়ে একটি সহজ summary—পূর্ণ accounting system নয়।",
      netWorth: "Net Worth",
      monthlySavings: "Monthly Savings",
      passiveIncome: "Passive Income",
      savedScenarios: "Saved Scenarios",
      netWorthHint: "মোট assets থেকে liabilities বাদ দিলে",
      updateAssets: "Assets & liabilities update করুন",
      clarity: "Clarity",
      clarityTitle: "টাকার পরিমাণ নয়, তথ্য যত পরিষ্কার",
      clarityDescription:
        "Savings, assets, liabilities, goals আর scenarios যোগ করলে আপনার financial picture আরও পরিষ্কার হবে।",
    },

    insights: {
      cardEyebrow: "Insight",
      eyebrow: "আপনার টাকার গল্প",
      title: "এখন পর্যন্ত কী বোঝা যাচ্ছে",
      cards: {
        "snapshot-empty": {
          title: "শুরুটা ছোট হতে পারে",
          body:
            "যেকোনো calculator দিয়ে শুরু করুন। দরকারি তথ্য save করতে থাকলে Money Snapshot নিজে থেকেই গড়ে উঠবে।",
        },

        "monthly-savings": {
          title: "আপনার savings habit দেখা যাচ্ছে",
          body:
            "বর্তমান হিসাব অনুযায়ী মাসে প্রায় {amount} savings করা সম্ভব হচ্ছে।",
        },

        "debt-ratio": {
          title: "Debt-ও ছবির গুরুত্বপূর্ণ অংশ",
          body:
            "এই snapshot-এ total assets-এর প্রায় {ratio}% liabilities হিসেবে আছে।",
        },

        "goal-progress": {
          title: "Goal এগোচ্ছে: {goal}",
          body:
            "বর্তমান snapshot অনুযায়ী goal-এর প্রায় {progress}% পথ এগিয়েছেন।",
        },
      },

      actionLabels: {
        "Explore scenarios": "Scenario দিয়ে শুরু করুন",
      },

      education: [
        "Fixed return দেখতে ভালো লাগলেও Inflation-এর পর আসল লাভ কম হতে পারে।",
        "শুধু return নয়—প্রয়োজনে কত দ্রুত টাকা পাওয়া যাবে, সেটাও দেখুন।",
        "একটা number-এর বদলে দুই-তিনটা পথ পাশাপাশি দেখলে সিদ্ধান্ত পরিষ্কার হয়।",
        "Money Snapshot একদিনে পূর্ণ করতে হবে না। প্রয়োজনমতো ধীরে ধীরে তথ্য যোগ করুন।",
      ],
    },

    states: {
      loading: "আপনার Wealth Workspace তৈরি হচ্ছে…",
      empty:
        "এখনো কোনো financial picture নেই। একটা প্রশ্ন দিয়ে শুরু করুন, পরে দরকারমতো তথ্য যোগ করবেন।",
      error:
        "Wealth data এখন আনা যাচ্ছে না। নিচের calculators ব্যবহার করা যাবে।",
    },
  },
} as const satisfies Record<AppLocale, WealthLandingLanguage>;

export function getWealthLandingLanguage(
  locale: AppLocale = DEFAULT_LOCALE,
): WealthLandingLanguage {
  return wealthLanguage[locale] ?? wealthLanguage[DEFAULT_LOCALE];
}

export function getWealthSeasonalCopy(
  context: WealthSeasonalContext,
  locale: AppLocale,
) {
  const copy =
    getWealthLandingLanguage(locale).seasonal.bySeason[
      context.season_key
    ];

  return copy
    ? {
        ...context,
        title: copy.title,
        description: copy.description,
        cta_label: copy.ctaLabel,
      }
    : context;
}

export function getWealthSavedScenarioNote(
  count: number,
  locale: AppLocale,
) {
  const snapshot = getWealthLandingLanguage(locale).snapshot;
  const template =
    count === 1
      ? snapshot.localScenarioSingular
      : snapshot.localScenarioPlural;

  return template.replace("{count}", String(count));
}

export function getWealthInsightCopy(
  insight: WealthInsightCard,
  locale: AppLocale,
): WealthInsightCard {
  const language = getWealthLandingLanguage(locale);

  const actionLabel = insight.action_label
    ? language.insights.actionLabels[insight.action_label] ??
      insight.action_label
    : insight.action_label;

  if (locale === "en") {
    return actionLabel === insight.action_label
      ? insight
      : {
          ...insight,
          action_label: actionLabel,
        };
  }

  const card =
    language.insights.cards[
      insight.id as WealthLandingInsightId
    ];

  if (!card) {
    return actionLabel === insight.action_label
      ? insight
      : {
          ...insight,
          action_label: actionLabel,
        };
  }

  const values = getInsightTemplateValues(insight);
  const title = replaceInsightTemplate(card.title, values);
  const body = replaceInsightTemplate(card.body, values);

  return {
    ...insight,
    title: title ?? insight.title,
    body: body ?? insight.body,
    action_label: actionLabel,
  };
}

function getInsightTemplateValues(
  insight: WealthInsightCard,
) {
  const monthlySavings =
    insight.body.match(
      /about\s+([\d,.]+)\/month/i,
    )?.[1];

  const debtRatio =
    insight.body.match(
      /about\s+([\d.]+)%\s+of total assets/i,
    )?.[1];

  const progress =
    insight.body.match(
      /about\s+([\d.]+)%\s+toward/i,
    )?.[1];

  const goal =
    insight.title.match(
      /^Goal in motion:\s*(.+)$/i,
    )?.[1];

  return {
    amount: monthlySavings,
    ratio: debtRatio,
    progress,
    goal,
  };
}

function replaceInsightTemplate(
  template: string,
  values: Record<string, string | undefined>,
) {
  const replaced = template.replace(
    /\{(amount|ratio|progress|goal)\}/g,
    (_, key: string) => values[key] ?? `{${key}}`,
  );

  return replaced.includes("{") ? null : replaced;
}

export type { WealthLandingLanguage };