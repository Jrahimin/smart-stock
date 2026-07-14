import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import type {
  StockSectionDefinition,
  StockSectionId,
} from "@/features/stock-workspace/types/stock-section-types";
import type { RelatedStocksGroupId } from "@/lib/market/related-stocks";
import type {
  SectorAchievementKey,
  SectorHeadlineFact,
  SectorRelationKey,
} from "@/features/stock-workspace/view-models/sector-context-view-model";

export type StockWorkspaceLanguage = {
  states: {
    loading: string;
    notFound: (symbol: string) => string;
    workspaceError: (symbol: string) => string;
    decisionError: string;
    decisionUpdating: string;
    sectorContextError: string;
    relatedStocksError: string;
  };
  header: {
    categoryPrefix: string;
    last: string;
    change: string;
    marketCap: string;
    action: string;
  };
  sections: Record<
    StockSectionId,
    {
      label: string;
      subtitle: string;
    }
  >;
  subsections: {
    sectorIntelligence: string;
    relatedStocks: string;
  };
  nav: {
    ariaLabel: string;
  };
  decision: {
    label: string;
    loading: string;
    confidence: string;
    opportunity: string;
    risk: string;
    opportunityBreakdown: string;
    riskBreakdown: string;
  };
  panels: {
    tradePlan: string;
    watchOnly: string;
    entryZone: string;
    stopLoss: string;
    target: string;
    pricePosition: string;
    towardResistance: (percent: number) => string;
    support: string;
    resistance: string;
    current: (value: string) => string;
    breakout: string;
    breakdown: string;
    breakoutAnalysis: string;
    breakdownAnalysis: string;
    breakoutLevel: string;
    breakdownLevel: string;
    warning: string;
    warningsSection: string;
    eventDetails: string;
    eventCategory: string;
    eventDate: string;
    eventTitle: string;
    noEventDetails: string;
    confirmationLevel: string;
    projectedTarget: string;
    breakoutProbability: string;
    breakdownProbability: string;
    stockColumn: string;
    sectorColumn: string;
    marketColumn: string;
    leader: string;
    laggard: string;
    ownershipFallback: string;
    freeFloat: string;
    sponsor: string;
    institution: string;
    foreign: string;
    public: string;
  };
  technicalSummary: {
    labels: Record<string, string>;
    helpers: Record<string, string>;
  };
  sector: {
    leader: string;
    laggard: string;
    stocks: (count: string) => string;
    kpiLabels: Record<string, string>;
    trendHelper: (value: string) => string;
    comparisonHelper: (
      value: string,
      relation: SectorRelationKey,
    ) => string;
    headline: (
      sectorName: string,
      stockCount: string,
      facts: SectorHeadlineFact[],
    ) => string;
    achievement: (
      key: SectorAchievementKey,
      rank?: number,
    ) => string;
  };
  fundamentals: {
    fiscalPeriodNote: (
      year: number,
      asOfDate: string | null,
    ) => string;
  };
  pattern: {
    confidence: (value: number) => string;
    status: string;
    whyMatched: string;
    tradingInterpretation: string;
    bullishInterpretation: string;
    bearishInterpretation: string;
    neutralInterpretation: string;
    projectedTarget: string;
    risk: string;
    footer: string;
    breakoutAbove: (
      value: string | number,
    ) => string;
    invalidatedBelow: (
      value: string | number,
    ) => string;
  };
  chart: {
    empty: string;
    toolsAria: string;
  };
  companySnapshot: {
    ariaLabel: string;
    sector: string;
    category: string;
    listingYear: string;
    marketCap: string;
    pe: string;
    dividendYield: string;
    freeFloat: string;
  };
  relatedStocks: {
    groupTitles: Record<
      RelatedStocksGroupId,
      string
    >;
    emptyRow: string;
    emptySection: string;
    loadError: string;
    browseSectorPeers: (
      sector: string,
    ) => string;
    exploreScanner: string;
  };
  durableSummary: {
    ariaLabel: string;
    decisionSupport: string;
    modelConfidence: (
      value: number,
    ) => string;
    data: string;
    asOf: (date: string) => string;
    freshness: {
      stale: string;
      sparse: string;
      fresh: string;
    };
    disclaimer: string;
    uncertaintyStale: string;
    uncertaintySparse: string;
    missingField: (
      field: string,
    ) => string;
    categoryPrefix: string;
  };
  localeSwitcherAria: string;
};

const stockWorkspaceLanguage = {
  en: {
    states: {
      loading: "Loading stock intelligence...",
      notFound: (symbol) =>
        `Stock not found for ${symbol}.`,
      workspaceError: (symbol) =>
        `Could not load stock workspace data for ${symbol}.`,
      decisionError:
        "Decision support unavailable; chart remains active.",
      decisionUpdating: "Updating decision…",
      sectorContextError:
        "Sector context unavailable.",
      relatedStocksError:
        "Could not load related stocks.",
    },
    header: {
      categoryPrefix: "Category",
      last: "Last",
      change: "Change",
      marketCap: "Market Cap",
      action: "Action",
    },
    sections: {
      overview: {
        label: "Overview",
        subtitle:
          "Price action and trading context",
      },
      technicals: {
        label: "Technicals",
        subtitle:
          "Momentum, levels, and trade setup",
      },
      fundamentals: {
        label: "Fundamentals",
        subtitle:
          "Earnings, valuation, and financial health",
      },
      ownership: {
        label: "Ownership",
        subtitle:
          "Shareholder mix and free float",
      },
      events: {
        label: "Events",
        subtitle:
          "Recent announcements and corporate actions",
      },
      related: {
        label: "Related Stocks",
        subtitle:
          "Stocks worth comparing next",
      },
    },
    subsections: {
      sectorIntelligence:
        "Sector Intelligence",
      relatedStocks: "Related Stocks",
    },
    nav: {
      ariaLabel: "Stock sections",
    },
    decision: {
      label: "Decision",
      loading:
        "Loading decision support…",
      confidence: "Evidence Strength",
      opportunity: "Opportunity",
      risk: "Risk",
      opportunityBreakdown:
        "Opportunity Score Breakdown",
      riskBreakdown:
        "Risk Score Breakdown",
    },
    panels: {
      tradePlan: "Trade Plan",
      watchOnly: "Watch only",
      entryZone: "Entry Zone",
      stopLoss: "Stop Loss",
      target: "Target",
      pricePosition: "Price Position",
      towardResistance: (percent) =>
        `${percent}% toward resistance`,
      support: "Support",
      resistance: "Resistance",
      current: (value) =>
        `Current ${value}`,
      breakout: "Breakout",
      breakdown: "Breakdown",
      breakoutAnalysis:
        "Breakout Analysis",
      breakdownAnalysis:
        "Breakdown Analysis",
      breakoutLevel: "Breakout level",
      breakdownLevel: "Breakdown level",
      warning: "Warning",
      warningsSection: "Warnings",
      eventDetails: "Event Details",
      eventCategory: "Category",
      eventDate: "Date",
      eventTitle: "Title",
      noEventDetails:
        "No additional details available.",
      confirmationLevel:
        "Confirmation level",
      projectedTarget:
        "Projected target",
      breakoutProbability:
        "🚀 Breakout Evidence",
      breakdownProbability:
        "📉 Breakdown Evidence",
      stockColumn: "Stock",
      sectorColumn: "Sector",
      marketColumn: "Market",
      leader: "Leader",
      laggard: "Laggard",
      ownershipFallback:
        "Ownership mix available from latest snapshot.",
      freeFloat: "Free Float",
      sponsor: "Sponsor",
      institution: "Institution",
      foreign: "Foreign",
      public: "Public",
    },
    technicalSummary: {
      labels: {
        trend: "Trend",
        rsi: "RSI",
        volatility: "Volatility",
        "avg-volume": "Avg Volume",
        support: "Support",
        resistance: "Resistance",
      },
      helpers: {
        trend:
          "Canonical trend from the decision engine when available.",
        rsi:
          "14-session momentum estimate from available closes.",
        volatility:
          "Recent standard deviation of daily percentage changes.",
        "avg-volume":
          "20-session average volume.",
        support:
          "Canonical support from the decision engine when available.",
        resistance:
          "Canonical resistance from the decision engine when available.",
      },
    },
    sector: {
      leader: "Leader",
      laggard: "Laggard",
      stocks: (count) =>
        `${count} stocks`,
      kpiLabels: {
        "sector-trend":
          "Sector Trend",
        pe: "P/E vs Sector",
        dividend_yield:
          "Yield vs Sector",
      },
      trendHelper: (value) =>
        `Sector trend: ${value}`,
      comparisonHelper: (
        value,
        relation,
      ) =>
        `Sector ${value} · ${
          {
            discount:
              "Discount to Sector",
            premium:
              "Premium to Sector",
            near_average:
              "Near Sector Average",
            above_median:
              "Above Sector Median",
            below_median:
              "Below Sector Median",
            near_median:
              "Near Sector Median",
          }[relation]
        }`,
      headline: (
        sectorName,
        stockCount,
        facts,
      ) => {
        if (!facts.length) {
          return `Positioned within ${stockCount} ${sectorName} peers.`;
        }

        const fragments =
          facts.map((fact) =>
            ({
              below_sector_valuation:
                "trades below sector valuation",
              above_sector_valuation:
                "trades above sector valuation",
              sector_leader:
                "stands among sector leaders",
              relative_value:
                "offers relative value in its sector",
              positive_sector_momentum:
                "benefits from positive sector momentum",
              soft_sector_backdrop:
                "faces a soft sector backdrop",
            })[fact],
          );

        return `This stock ${fragments
          .slice(0, 2)
          .join(" and ")}.`;
      },
      achievement: (
        key,
        rank,
      ) =>
        ({
          largest_company:
            "Largest Company in Sector",
          top_market_cap:
            `Top ${rank ?? 0} by Market Cap`,
          highest_dividend_yield:
            "Highest Dividend Yield",
          top_dividend_yield:
            `Top ${rank ?? 0} Dividend Yield`,
          best_value:
            "Best Value in Sector",
          top_value_opportunity:
            `Top ${rank ?? 0} Value Opportunity`,
        })[key],
    },
    fundamentals: {
      fiscalPeriodNote: (
        year,
        asOfDate,
      ) =>
        `Latest fiscal data: FY ${year}${
          asOfDate
            ? ` (as of ${asOfDate})`
            : ""
        }`,
    },
    pattern: {
      confidence: (value) =>
        `Pattern match ${value}/100`,
      status: "Status",
      whyMatched: "Why it matched",
      tradingInterpretation:
        "Trading interpretation",
      bullishInterpretation:
        "Usually a continuation or reversal pattern with upside bias.",
      bearishInterpretation:
        "Usually a distribution pattern with downside risk.",
      neutralInterpretation:
        "Neutral structure; wait for directional confirmation.",
      projectedTarget:
        "Projected target",
      risk: "Risk",
      footer:
        "Pattern detection is deterministic and should be combined with risk management.",
      breakoutAbove: (value) =>
        `Watch breakout above ${value}.`,
      invalidatedBelow: (value) =>
        `Failure below ${value} invalidates the setup.`,
    },
    chart: {
      empty:
        "No OHLCV rows are available for this stock yet.",
      toolsAria:
        "Chart workspace tools",
    },
    companySnapshot: {
      ariaLabel: "Company snapshot",
      sector: "Sector",
      category: "Category",
      listingYear: "Listing Year",
      marketCap: "Market Cap",
      pe: "P/E",
      dividendYield:
        "Dividend Yield",
      freeFloat: "Free Float",
    },
    relatedStocks: {
      groupTitles: {
        "sector-peers":
          "Sector Peers",
        "similar-setup":
          "Similar Setup",
        "similar-size":
          "Similar Size",
        "top-opportunities":
          "Top Opportunities",
      },
      emptyRow:
        "No matches in this group yet.",
      emptySection:
        "No related stocks to suggest for this symbol yet.",
      loadError:
        "Could not load related stocks.",
      browseSectorPeers: (sector) =>
        `Browse ${sector} peers`,
      exploreScanner:
        "Explore more in Scanner",
    },
    durableSummary: {
      ariaLabel: "Stock summary",
      decisionSupport:
        "Decision support",
      modelConfidence: (value) =>
        `${value}/100 heuristic evidence`,
      data: "Data",
      asOf: (date) =>
        ` · as of ${date}`,
      freshness: {
        stale: "Stale",
        sparse: "Sparse",
        fresh: "Fresh",
      },
      disclaimer:
        "Snapshot-based market data and rule-based decision support — not live quotes and not investment advice.",
      uncertaintyStale:
        "stale prices",
      uncertaintySparse:
        "sparse history",
      missingField: (field) =>
        `missing ${field}`,
      categoryPrefix: "Category",
    },
    localeSwitcherAria:
      "Stock details language",
  },

  bn: {
    states: {
      loading:
        "শেয়ারের তথ্য লোড হচ্ছে...",
      notFound: (symbol) =>
        `${symbol} শেয়ারটি পাওয়া যায়নি।`,
      workspaceError: (symbol) =>
        `${symbol}-এর তথ্য এখন আনা যাচ্ছে না।`,
      decisionError:
        "Decision support পাওয়া যাচ্ছে না। Chart ব্যবহার করা যাবে।",
      decisionUpdating:
        "Decision update হচ্ছে…",
      sectorContextError:
        "Sector-এর তথ্য এখন পাওয়া যাচ্ছে না।",
      relatedStocksError:
        "মিল আছে এমন শেয়ারগুলো আনা যায়নি।",
    },

    header: {
      categoryPrefix: "Category",
      last: "Last",
      change: "Change",
      marketCap: "Market Cap",
      action: "Action",
    },

    sections: {
      overview: {
        label: "Overview",
        subtitle:
          "দামের অবস্থা ও গুরুত্বপূর্ণ তথ্য",
      },
      technicals: {
        label: "Technicals",
        subtitle:
          "Trend, level ও trade setup",
      },
      fundamentals: {
        label: "Fundamentals",
        subtitle:
          "আয়, মূল্যায়ন ও আর্থিক শক্তি",
      },
      ownership: {
        label: "Ownership",
        subtitle:
          "কার হাতে কত শেয়ার আছে",
      },
      events: {
        label: "Events",
        subtitle:
          "সাম্প্রতিক ঘোষণা ও কোম্পানির খবর",
      },
      related: {
        label: "Related Stocks",
        subtitle:
          "তুলনা করে দেখার মতো শেয়ার",
      },
    },

    subsections: {
      sectorIntelligence:
        "Sector-এর অবস্থা",
      relatedStocks:
        "মিল আছে এমন শেয়ার",
    },

    nav: {
      ariaLabel:
        "শেয়ারের বিভিন্ন অংশ",
    },

    decision: {
      label: "Decision",
      loading:
        "Decision support লোড হচ্ছে…",
      confidence:
        "Evidence Strength",
      opportunity:
        "Opportunity",
      risk: "Risk",
      opportunityBreakdown:
        "Opportunity Score কেন",
      riskBreakdown:
        "Risk Score কেন",
    },

    panels: {
      tradePlan: "Trade Plan",
      watchOnly: "শুধু নজরে রাখুন",
      entryZone: "Entry Zone",
      stopLoss: "Stop Loss",
      target: "Target",
      pricePosition:
        "দাম এখন কোথায়",
      towardResistance: (percent) =>
        `Resistance-এর দিকে ${percent}%`,
      support: "Support",
      resistance: "Resistance",
      current: (value) =>
        `এখন ${value}`,
      breakout: "Breakout",
      breakdown: "Breakdown",
      breakoutAnalysis:
        "Breakout-এর চিত্র",
      breakdownAnalysis:
        "Breakdown-এর চিত্র",
      breakoutLevel:
        "Breakout level",
      breakdownLevel:
        "Breakdown level",
      warning: "সতর্কতা",
      warningsSection:
        "যা খেয়াল রাখবেন",
      eventDetails:
        "Event-এর বিস্তারিত",
      eventCategory: "ধরন",
      eventDate: "তারিখ",
      eventTitle: "শিরোনাম",
      noEventDetails:
        "আর কোনো তথ্য নেই।",
      confirmationLevel:
        "Confirmation level",
      projectedTarget:
        "সম্ভাব্য Target",
      breakoutProbability:
        "🚀 Breakout Evidence",
      breakdownProbability:
        "📉 Breakdown Evidence",
      stockColumn: "Stock",
      sectorColumn: "Sector",
      marketColumn: "Market",
      leader: "এগিয়ে",
      laggard: "পিছিয়ে",
      ownershipFallback:
        "সর্বশেষ তথ্য অনুযায়ী মালিকানার চিত্র দেখানো হচ্ছে।",
      freeFloat: "Free Float",
      sponsor: "Sponsor",
      institution: "Institution",
      foreign: "Foreign",
      public: "Public",
    },

    technicalSummary: {
      labels: {
        trend: "Trend",
        rsi: "RSI",
        volatility:
          "দামের ওঠানামা",
        "avg-volume":
          "Avg Volume",
        support: "Support",
        resistance:
          "Resistance",
      },
      helpers: {
        trend:
          "বর্তমান Trend কোন দিকে, সেটি এখানে দেখা যাবে।",
        rsi:
          "সাম্প্রতিক 14 session-এ দাম কতটা দ্রুত উঠছে বা নামছে।",
        volatility:
          "সাম্প্রতিক সময়ে দাম কতটা বেশি নড়াচড়া করেছে।",
        "avg-volume":
          "সর্বশেষ 20 session-এর গড় Volume।",
        support:
          "দাম নামলে যে level-এ support পেতে পারে।",
        resistance:
          "দাম উঠলে যে level-এ resistance আসতে পারে।",
      },
    },

    sector: {
      leader:
        "এগিয়ে থাকা শেয়ার",
      laggard:
        "পিছিয়ে থাকা শেয়ার",
      stocks: (count) =>
        `${count}টি stock`,
      kpiLabels: {
        "sector-trend":
          "Sector Trend",
        pe:
          "Sector-এর তুলনায় P/E",
        dividend_yield:
          "Sector-এর তুলনায় Yield",
      },
      trendHelper: (value) =>
        `Sector-এর Trend: ${value}`,
      comparisonHelper: (
        value,
        relation,
      ) =>
        `Sector ${value} · ${
          {
            discount:
              "Sector-এর চেয়ে কম",
            premium:
              "Sector-এর চেয়ে বেশি",
            near_average:
              "Sector-এর গড়ের কাছাকাছি",
            above_median:
              "মাঝামাঝি দামের চেয়ে বেশি",
            below_median:
              "মাঝামাঝি দামের চেয়ে কম",
            near_median:
              "মাঝামাঝি দামের কাছাকাছি",
          }[relation]
        }`,
      headline: (
        sectorName,
        stockCount,
        facts,
      ) => {
        if (!facts.length) {
          return `${sectorName} Sector-এর ${stockCount}টি stock-এর সঙ্গে তুলনা করা হয়েছে।`;
        }

        const fragments =
          facts.map((fact) =>
            ({
              below_sector_valuation:
                "Sector-এর তুলনায় দাম কম",
              above_sector_valuation:
                "Sector-এর তুলনায় দাম বেশি",
              sector_leader:
                "Sector-এর এগিয়ে থাকা শেয়ারগুলোর একটি",
              relative_value:
                "Sector-এর তুলনায় দাম আকর্ষণীয়",
              positive_sector_momentum:
                "Sector-এর গতি ভালো",
              soft_sector_backdrop:
                "Sector এখন কিছুটা দুর্বল",
            })[fact],
          );

        return fragments
          .slice(0, 2)
          .join(" · ");
      },
      achievement: (
        key,
        rank,
      ) =>
        ({
          largest_company:
            "Sector-এর সবচেয়ে বড় কোম্পানি",
          top_market_cap:
            `Market Cap-এ Top ${rank ?? 0}`,
          highest_dividend_yield:
            "সবচেয়ে বেশি Dividend Yield",
          top_dividend_yield:
            `Dividend Yield-এ Top ${rank ?? 0}`,
          best_value:
            "Sector-এর সেরা Value",
          top_value_opportunity:
            `Value-তে Top ${rank ?? 0}`,
        })[key],
    },

    fundamentals: {
      fiscalPeriodNote: (
        year,
        asOfDate,
      ) =>
        `সর্বশেষ আর্থিক তথ্য: FY ${year}${
          asOfDate
            ? ` · ${asOfDate} পর্যন্ত`
            : ""
        }`,
    },

    pattern: {
      confidence: (value) =>
        `Pattern match ${value}/100`,
      status: "অবস্থা",
      whyMatched:
        "কেন এই Pattern মিলেছে",
      tradingInterpretation:
        "এতে কী বোঝা যায়",
      bullishInterpretation:
        "দাম বাড়ার সম্ভাবনা তৈরি হতে পারে, তবে confirmation দেখা জরুরি।",
      bearishInterpretation:
        "দাম আরও নামার ঝুঁকি আছে। সতর্ক থাকা ভালো।",
      neutralInterpretation:
        "দিক এখনো পরিষ্কার নয়। Confirmation না আসা পর্যন্ত অপেক্ষা করুন।",
      projectedTarget:
        "সম্ভাব্য Target",
      risk: "Risk",
      footer:
        "Pattern শুধু একটি ইঙ্গিত। সিদ্ধান্তের আগে Risk ও price level দেখে নিন।",
      breakoutAbove: (value) =>
        `${value}-এর ওপরে গেলে Breakout নজরে রাখুন।`,
      invalidatedBelow: (value) =>
        `${value}-এর নিচে গেলে এই setup আর কার্যকর থাকবে না।`,
    },

    chart: {
      empty:
        "এই শেয়ারের price history এখনো পাওয়া যায়নি।",
      toolsAria:
        "Chart-এর tools",
    },

    companySnapshot: {
      ariaLabel:
        "কোম্পানির সংক্ষিপ্ত তথ্য",
      sector: "Sector",
      category: "Category",
      listingYear:
        "Listing Year",
      marketCap: "Market Cap",
      pe: "P/E",
      dividendYield:
        "Dividend Yield",
      freeFloat: "Free Float",
    },

    relatedStocks: {
      groupTitles: {
        "sector-peers":
          "একই Sector-এর শেয়ার",
        "similar-setup":
          "একই ধরনের Setup",
        "similar-size":
          "কাছাকাছি আকারের শেয়ার",
        "top-opportunities":
          "ভালো Opportunity",
      },
      emptyRow:
        "এই তালিকায় এখনো কোনো শেয়ার নেই।",
      emptySection:
        "এই শেয়ারের সঙ্গে মিল আছে এমন stock এখনো পাওয়া যায়নি।",
      loadError:
        "মিল আছে এমন শেয়ারগুলো আনা যায়নি।",
      browseSectorPeers: (sector) =>
        `${sector} Sector-এর শেয়ার দেখুন`,
      exploreScanner:
        "Scanner-এ আরও খুঁজুন",
    },

    durableSummary: {
      ariaLabel:
        "শেয়ারের সংক্ষিপ্তসার",
      decisionSupport:
        "Decision support",
      modelConfidence: (value) =>
        `Heuristic evidence ${value}/100`,
      data: "Data",
      asOf: (date) =>
        ` · ${date} পর্যন্ত`,
      freshness: {
        stale: "পুরনো",
        sparse: "তথ্য কম",
        fresh: "সর্বশেষ",
      },
      disclaimer:
        "এটি সর্বশেষ পাওয়া market data ও rule-based analysis-এর ওপর তৈরি—live price নয়, বিনিয়োগ পরামর্শও নয়।",
      uncertaintyStale:
        "দামের তথ্য পুরনো",
      uncertaintySparse:
        "Price history কম",
      missingField: (field) =>
        `${field} পাওয়া যায়নি`,
      categoryPrefix:
        "Category",
    },

    localeSwitcherAria:
      "Stock details-এর ভাষা",
  },
} as const satisfies Record<
  AppLocale,
  StockWorkspaceLanguage
>;

export function getStockWorkspaceLanguage(
  locale: AppLocale,
): StockWorkspaceLanguage {
  return (
    stockWorkspaceLanguage[locale] ??
    stockWorkspaceLanguage[
      DEFAULT_LOCALE
    ]
  );
}

export function getStockSectionDefinitions(
  locale: AppLocale,
): StockSectionDefinition[] {
  const language =
    getStockWorkspaceLanguage(locale);

  const ids: StockSectionId[] = [
    "overview",
    "technicals",
    "fundamentals",
    "ownership",
    "events",
    "related",
  ];

  return ids.map((id) => ({
    id,
    label:
      language.sections[id].label,
    subtitle:
      language.sections[id].subtitle,
  }));
}

export function localizeRelatedStocksGroupTitle(
  id: RelatedStocksGroupId,
  locale: AppLocale,
): string {
  return getStockWorkspaceLanguage(locale)
    .relatedStocks.groupTitles[id];
}

export function localizeRelatedStocksCta(
  sector: string,
  hasSectorPeers: boolean,
  locale: AppLocale,
): {
  label: string;
  href: string;
} {
  const copy =
    getStockWorkspaceLanguage(locale)
      .relatedStocks;

  const normalizedSector =
    sector.trim();

  if (
    hasSectorPeers &&
    normalizedSector &&
    normalizedSector !== "Unclassified"
  ) {
    return {
      label:
        copy.browseSectorPeers(
          normalizedSector,
        ),
      href: `/stocks?search=${encodeURIComponent(
        normalizedSector,
      )}`,
    };
  }

  return {
    label: copy.exploreScanner,
    href: "/scanner",
  };
}

export function localizeCompanySnapshotLabel(
  key: string,
  locale: AppLocale,
): string | undefined {
  const labels =
    getStockWorkspaceLanguage(locale)
      .companySnapshot;

  const map: Record<string, string> = {
    sector: labels.sector,
    category: labels.category,
    "listing-year":
      labels.listingYear,
    "market-cap": labels.marketCap,
    pe: labels.pe,
    "dividend-yield":
      labels.dividendYield,
    "free-float":
      labels.freeFloat,
  };

  return map[key];
}
