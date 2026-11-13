import { holderActionLabels } from "@/lib/market/signal-action-labels";
import type {
  PortfolioAttentionCode,
  PortfolioPriceStatus,
  PortfolioWhatNextCode,
} from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";

type PortfolioLanguage = {
  eyebrow: string;
  title: string;
  subtitle: string;
  freshness: string;
  live: string;
  finalized: string;
  pulse: string;
  attention: string;
  noAttention: string;
  noAttentionDetail: string;
  viewAll: string;
  showLess: string;
  holdings: string;
  shape: string;
  watchlist: string;
  watchlistEmpty: string;
  knownValue: string;
  knownInvestment: string;
  valueCoverage: string;
  partialAccount: string;
  valueMethod: string;
  unrealized: string;
  dailyMovement: string;
  holdingCount: string;
  estimated: string;
  coverage: (known: number, total: number) => string;
  loading: string;
  error: string;
  retry: string;
  emptyTitle: string;
  emptyDetail: string;
  search: string;
  all: string;
  review: string;
  stable: string;
  incomplete: string;
  holdingsOnly: string;
  watchlistOnly: string;
  watching: string;
  position: string;
  market: string;
  signal: string;
  notHeld: string;
  markAsHolding: string;
  add: string;
  addNote: string;
  watched: string;
  holding: string;
  moreActions: string;
  actionsColumn: string;
  removeHolding: string;
  removeWatchlist: string;
  removeHoldingConfirm: string;
  removeWatchlistConfirm: string;
  cancel: string;
  edit: string;
  action: string;
  trend: string;
  stock: string;
  quantity: string;
  averagePrice: string;
  currentPrice: string;
  currentValue: string;
  weight: string;
  trendRisk: string;
  whatNext: string;
  details: string;
  close: string;
  save: string;
  saving: string;
  note: string;
  supportResistance: string;
  scanner: string;
  evidence: string;
  event: string;
  stockDetails: string;
  unknown: string;
  known: string;
  provisional: string;
  positionExposure: string;
  sectorExposure: string;
  knownSectorExposure: string;
  knownPositionExposure: string;
  actionGroups: string;
  largest: string;
  strongest: string;
  weakest: string;
  bestToday: string;
  worstToday: string;
  editHolding: string;
  filtersAnnouncement: (count: number) => string;
  completeHoldings: string;
  setupProgress: (completed: number, total: number) => string;
  chipHoldings: (count: number) => string;
  chipWatched: (count: number) => string;
  chipIncomplete: (count: number) => string;
  chipReview: (count: number) => string;
  chipDataState: string;
  valueAndPL: string;
  addQuantity: string;
  addAveragePrice: string;
  addQuantityAction: string;
  addAveragePriceAction: string;
  addHolding: string;
  addHoldingTitle: string;
  updateHoldingTitle: string;
  addToPortfolio: string;
  updateHolding: string;
  stockSearchPlaceholder: string;
  stockSearchEmpty: string;
  stockSearchError: string;
  stockSearchLoading: string;
  stockRequired: string;
  quantityRequired: string;
  averageBuyPriceRequired: string;
  addNoteToggle: string;
  hideNote: string;
  alreadyOnWatchlist: string;
  previewInvested: string;
  previewCurrentValue: string;
  previewUnrealized: string;
  previewPriceUnavailable: string;
  previewPriceStale: string;
  previewPriceSuspicious: string;
  previewNoDailyFromStale: string;
  savingHolding: string;
  needsSetup: string;
  signalUnavailable: string;
  holderInstruction: string;
  datedAction: string;
  sourceDetails: string;
  markDate: string;
  sourceTime: string;
  previousClose: string;
  sinceCost: string;
  pendingValues: string;
  editFailed: string;
  partialPL: string;
  partialDaily: string;
  partialInvestment: string;
  comparisonChanged: string;
  comparisonUnchanged: string;
  comparisonUnavailable: string;
  actionLabels: Record<string, string>;
  partialExposure: string;
  concentration: string;
  insights: string;
  highestRisk: string;
  lowestDailyContribution: string;
  dailyContributionBasis: string;
  percentagePoints: string;
  emailSummary: string;
  emailSummaryDetail: string;
  emailSummaryEnabled: string;
  emailSummaryDisabled: string;
  emailSummaryNote: string;
  viewStock: string;
  groupHoldings: (count: number) => string;
  groupWatching: (count: number) => string;
  filterAttention: string;
  guidance: Record<PortfolioWhatNextCode, string>;
  attentionLabels: Record<PortfolioAttentionCode, string>;
  reasonLabels: Record<string, string>;
  priceStatus: Record<PortfolioPriceStatus, string>;
};

const en: PortfolioLanguage = {
  eyebrow: "Your holdings",
  title: "My Portfolio",
  subtitle: "What your holdings are worth, what is happening now, and what deserves attention.",
  freshness: "Market data",
  live: "Live estimate",
  finalized: "Published session",
  pulse: "Portfolio Pulse",
  attention: "Needs Your Attention",
  noAttention: "No action needed for this holding",
  noAttentionDetail: "No material issue was found in the current signals and available holding data.",
  viewAll: "View all",
  showLess: "Show less",
  holdings: "Holdings",
  shape: "Portfolio Shape",
  watchlist: "Watchlist to Review",
  watchlistEmpty: "No watchlist idea has a meaningful current reason to surface.",
  knownValue: "Marked value",
  valueCoverage: "Value coverage",
  partialAccount: "Partial account data",
  valueMethod: "Value uses supplied quantities and dated marks. P/L includes only known cost; daily movement includes comparable previous prices.",
  knownInvestment: "Known investment",
  unrealized: "Since-cost P/L",
  dailyMovement: "Daily movement",
  holdingCount: "Holdings",
  estimated: "Estimated",
  coverage: (known, total) => known === total ? "All holdings are priced" : `${known} of ${total} holdings are priced.`,
  loading: "Building your current-position view…",
  error: "Your portfolio could not be loaded.",
  retry: "Try again",
  emptyTitle: "No holdings yet",
  emptyDetail: "Add a holding with quantity and average buy price to see value, P/L, and attention.",
  search: "Search holdings",
  all: "All",
  review: "Review",
  stable: "Stable",
  incomplete: "Incomplete",
  holdingsOnly: "Holdings",
  watchlistOnly: "Watchlist only",
  watching: "Watching",
  position: "Position",
  market: "Market",
  signal: "Signal",
  notHeld: "Not held",
  markAsHolding: "Mark hold",
  add: "Add",
  addNote: "Add note",
  watched: "Watched",
  holding: "Holding",
  moreActions: "More actions",
  actionsColumn: "Actions",
  removeHolding: "Remove from holdings",
  removeWatchlist: "Remove from watchlist",
  removeHoldingConfirm: "Remove this stock from holdings? Quantity and average price will be cleared, but it will remain watched.",
  removeWatchlistConfirm: "Remove this stock from your watchlist? Its holding quantity, average price, and note will be lost.",
  cancel: "Cancel",
  edit: "Edit",
  action: "Action",
  trend: "Trend",
  stock: "Stock",
  quantity: "Quantity",
  averagePrice: "Average Buy price",
  currentPrice: "Current price",
  currentValue: "Current value",
  weight: "Weight",
  trendRisk: "Trend / risk",
  whatNext: "What next",
  details: "Open holding details",
  close: "Close",
  save: "Save holding",
  saving: "Saving…",
  note: "Personal note",
  supportResistance: "Support / resistance",
  scanner: "Scanner matches",
  evidence: "Current evidence",
  event: "Relevant event",
  stockDetails: "Open Stock Details",
  unknown: "Unavailable",
  known: "Known",
  provisional: "Movement is provisional while the market session is live.",
  positionExposure: "Position exposure",
  sectorExposure: "Sector exposure",
  knownSectorExposure: "Known sector exposure",
  knownPositionExposure: "Known position exposure",
  actionGroups: "Holdings by action",
  largest: "Largest holding",
  strongest: "Strongest position",
  weakest: "Weakest position",
  bestToday: "Best session contributor",
  worstToday: "Lowest session contribution",
  editHolding: "Holding information",
  filtersAnnouncement: (count) => `${count} saved ${count === 1 ? "stock" : "stocks"} shown`,
  completeHoldings: "Complete holdings",
  setupProgress: (completed, total) => `${completed} of ${total} holdings completed`,
  chipHoldings: (count) => `${count} holdings`,
  chipWatched: (count) => `${count} saved`,
  chipIncomplete: (count) => `${count} incomplete`,
  chipReview: (count) => `Review now ${count}`,
  chipDataState: "Known value",
  valueAndPL: "Value & P/L",
  addQuantity: "Add quantity to calculate value and weight",
  addAveragePrice: "Add average buy price to calculate P/L",
  addQuantityAction: "Add quantity",
  addAveragePriceAction: "Add avg buy price",
  addHolding: "Add in Portfolio",
  addHoldingTitle: "Add in Portfolio",
  updateHoldingTitle: "Update holding",
  addToPortfolio: "Add to portfolio",
  updateHolding: "Update holding",
  stockSearchPlaceholder: "Search by symbol or company name",
  stockSearchEmpty: "No matching stocks found.",
  stockSearchError: "Stock search failed. Try again.",
  stockSearchLoading: "Searching…",
  stockRequired: "Select a stock.",
  quantityRequired: "Enter a positive whole number of shares.",
  averageBuyPriceRequired: "Enter a positive average buy price.",
  addNoteToggle: "Add note",
  hideNote: "Hide note",
  alreadyOnWatchlist: "This stock is already in your watchlist. Add holding details?",
  previewInvested: "Invested amount",
  previewCurrentValue: "Current value",
  previewUnrealized: "Estimated unrealized P/L",
  previewPriceUnavailable: "Current price unavailable",
  previewPriceStale: "Using a stale last-known price",
  previewPriceSuspicious: "Price needs verification",
  previewNoDailyFromStale: "Daily movement is not calculated from stale prices.",
  savingHolding: "Saving…",
  needsSetup: "Needs setup",
  signalUnavailable: "Decision unavailable",
  holderInstruction: "For this holding",
  datedAction: "Dated action",
  sourceDetails: "Price observation",
  markDate: "Price date",
  sourceTime: "Source observed",
  previousClose: "Previous close",
  sinceCost: "Since cost",
  pendingValues: "Saving · Showing last confirmed account values",
  editFailed: "Could not save. Account values remain unchanged. Try again.",
  partialPL: "P/L includes only positions with known cost and usable marks.",
  partialDaily: "Daily movement includes only positions with comparable price changes.",
  partialInvestment: "Investment includes only positions with known quantity and cost.",
  comparisonChanged: "Changed since previous session",
  comparisonUnchanged: "Unchanged since previous session",
  comparisonUnavailable: "Previous-session comparison unavailable",
  actionLabels: { ...holderActionLabels.en, WAIT: "Wait", POTENTIAL_BUY: "Potential buy" },
  partialExposure: "Exposure reflects only holdings with known current value.",
  concentration: "Concentration",
  insights: "Portfolio insights",
  highestRisk: "Highest position risk",
  lowestDailyContribution: "Lowest daily contribution",
  dailyContributionBasis: "Of portfolio daily return · comparable holdings",
  percentagePoints: "pp",
  emailSummary: "Daily summary email",
  emailSummaryDetail: "Get one concise email after the market close with your portfolio summary, P/L, and attention items.",
  emailSummaryEnabled: "Summary emails on",
  emailSummaryDisabled: "Summary emails off",
  emailSummaryNote: "Delivered after finalized market close on trading days. Preference is saved to your account.",
  viewStock: "View stock",
  groupHoldings: (count) => `Holdings · ${count}`,
  groupWatching: (count) => `Watching · ${count}`,
  filterAttention: "Attention filter",
  guidance: {
    REVIEW_HOLDER_GUIDANCE: "Review the published holder guidance and its constraints.",
    DATA_INCOMPLETE: "Complete quantity, average price, or market data.",
    PRICE_STALE_OR_SUSPENDED: "Price quality needs review before acting.",
    REVIEW_SUPPORT_BREAK: "Review the support break and reassess risk.",
    REVIEW_SELL_OR_REDUCE: "Review the current SELL or REDUCE evidence.",
    REVIEW_ELEVATED_RISK: "Risk is elevated; review position size and evidence.",
    DO_NOT_AVERAGE_DOWN_FOR_COST_ONLY: "Do not average down only to reduce cost.",
    WATCH_RESISTANCE: "Price is near resistance; watch whether volume confirms.",
    PROFITABLE_TREND_INTACT: "Uptrend remains intact; watch support if momentum weakens.",
    NO_ACTION_NEEDED: "No action needed for this holding.",
  },
  attentionLabels: {
    HOLDER_REVIEW: "Review holder guidance",
    SUPPORT_BREAK: "Support break",
    SELL_OR_REDUCE: "SELL or REDUCE signal",
    PRICE_QUALITY: "Stale, suspended, or uncertain price",
    ELEVATED_RISK: "Elevated risk",
    INCOMPLETE_HOLDING: "Incomplete holding information",
    HIGH_CONCENTRATION: "High position concentration",
    WATCH_RESISTANCE: "Approaching resistance",
    UNUSUAL_VOLUME: "Unusual price and volume",
    IMPORTANT_EVENT: "Important company event",
  },
  reasonLabels: {
    ACTIONABLE_POTENTIAL_BUY: "Potential buy setup with an actionable condition",
    PRICE_VOLUME_BREAKOUT: "Price and volume breakout",
    SUPPORT_REBOUND: "Support rebound",
    MOMENTUM_CONTINUATION: "Momentum continuation",
    LOW_VOLATILITY_COMPRESSION: "Volatility compression",
    BREAKDOWN: "Breakdown — review with caution",
    HIGH_RISK_WATCH: "Elevated-risk watch",
    IMPORTANT_EVENT: "Important company event",
    ELEVATED_RISK: "Elevated risk warrants caution",
  },
  priceStatus: {
    FINALIZED: "Finalized price",
    PROVISIONAL: "Provisional price",
    NON_TRADED: "No trade in this session",
    STALE_LAST_KNOWN: "Stale last-known price",
    SUSPENDED: "Trading suspended",
    SUSPICIOUS: "Price needs verification",
    UNAVAILABLE: "Price unavailable",
  },
};

const bn: PortfolioLanguage = {
  ...en,

  eyebrow: "আপনার পোর্টফোলিও, আজকের হিসেবে",
  title: "আমার পোর্টফোলিও",
  subtitle: "আপনার হোল্ডিংস এখন কোথায় আছে, কী বদলাচ্ছে আর কোনগুলো একটু দেখে নেওয়া দরকার।",

  freshness: "Market data",
  live: "Live estimate",
  finalized: "Finalized session",

  pulse: "পোর্টফোলিওর আজকের ছবি",
  attention: "এখন যেগুলো একটু দেখে নিন",
  noAttention: "আজ আলাদা করে কিছু করার নেই",
  noAttentionDetail: "বর্তমান signal আর পাওয়া তথ্য অনুযায়ী এখনই নজর দেওয়ার মতো বড় কোনো বিষয় নেই।",

  viewAll: "সব দেখুন",
  showLess: "কম দেখুন",

  holdings: "হোল্ডিংস",
  shape: "পোর্টফোলিওর গঠন",
  watchlist: "ওয়াচলিস্টে দেখার মতো",
  watchlistEmpty: "ওয়াচলিস্টে এখন আলাদা করে সামনে আনার মতো কোনো নতুন কারণ নেই।",

  knownValue: "বর্তমান ভ্যালু",
  valueCoverage: "হিসাবের পরিধি",
  partialAccount: "হিসাবের কিছু তথ্য অসম্পূর্ণ",
  valueMethod: "দেওয়া পরিমাণ ও তারিখযুক্ত দাম দিয়ে ভ্যালু হয়। ক্রয়মূল্য জানা থাকলে লাভ/ক্ষতি এবং আগের তুলনাযোগ্য দাম থাকলে দৈনিক পরিবর্তন হিসাব হয়।",
  knownInvestment: "হিসাব করা বিনিয়োগ",
  unrealized: "বর্তমান লাভ/ক্ষতি",
  dailyMovement: "দৈনিক পরিবর্তন",
  holdingCount: "হোল্ডিংস",
  estimated: "আনুমানিক",

  coverage: (known, total) =>
    `${total}টির মধ্যে ${known}টি holding-এর value হিসাব করা গেছে।`,

  loading: "আপনার পোর্টফোলিওর আজকের ছবি তৈরি হচ্ছে…",
  error: "পোর্টফোলিওটি এখন লোড করা যাচ্ছে না।",
  retry: "আবার চেষ্টা করুন",

  emptyTitle: "এখনও কোনো holding যোগ করা হয়নি",
  emptyDetail:
    "Quantity আর average buy price দিয়ে একটি holding যোগ করলেই value, লাভ/ক্ষতি আর attention দেখা যাবে।",

  search: "শেয়ার খুঁজুন",

  all: "সব",
  review: "দেখা দরকার",
  stable: "স্বাভাবিক",
  incomplete: "তথ্য অসম্পূর্ণ",
  holdingsOnly: "শুধু হোল্ডিং",
  watchlistOnly: "শুধু নজরে রাখা",
  watching: "ওয়াচলিস্টে",

  position: "পজিশন",
  market: "মার্কেট",
  signal: "signal",
  notHeld: "কেনা নেই",
  markAsHolding: "হোল্ডিংয়ে যোগ করুন",

  add: "যোগ করুন",
  addNote: "নোট লিখুন",
  watched: "ওয়াচলিস্টে",
  holding: "হোল্ডিং",

  moreActions: "আরও অপশন",
  actionsColumn: "অপশন",

  removeHolding: "Holding থেকে সরান",
  removeWatchlist: "Watchlist থেকে সরান",

  removeHoldingConfirm:
    "Holding থেকে সরাতে চান? Quantity আর average price মুছে যাবে, তবে শেয়ারটি Watchlist-এ থাকবে।",

  removeWatchlistConfirm:
    "Watchlist থেকে সরাতে চান? Holding-এর quantity, average price আর note-ও মুছে যাবে।",

  cancel: "বাতিল",
  edit: "এডিট",

  action: "অ্যাকশন",
  trend: "trend",
  stock: "শেয়ার",
  quantity: "শেয়ারের সংখ্যা",
  averagePrice: "গড় ক্রয়মূল্য",
  currentPrice: "বর্তমান দাম",
  currentValue: "বর্তমান ভ্যালু",
  weight: "পোর্টফোলিওতে অংশ",
  trendRisk: "Trend / Risk",
  whatNext: "এখন কী করবেন",

  details: "Holding-এর বিস্তারিত দেখুন",
  close: "বন্ধ করুন",
  save: "Save করুন",
  saving: "Save হচ্ছে…",

  note: "আপনার নোট",
  supportResistance: "Support / Resistance",
  scanner: "Scanner match",
  evidence: "কেন এই signal",
  event: "গুরুত্বপূর্ণ event",
  stockDetails: "শেয়ারের বিস্তারিত দেখুন",

  unknown: "তথ্য নেই",
  known: "হিসাব করা",
  provisional: "Market live থাকায় আজকের পরিবর্তনটি এখনও provisional।",

  positionExposure: "কোন শেয়ারে কতটা আছে",
  sectorExposure: "কোন খাতে কতটা আছে",
  knownSectorExposure: "হিসাব করা sector exposure",
  knownPositionExposure: "হিসাব করা position exposure",
  actionGroups: "হোল্ডিংয়ে করণীয়",

  largest: "সবচেয়ে বড় হোল্ডিং",
  strongest: "সবচেয়ে ভালো অবস্থানে",
  weakest: "সবচেয়ে দুর্বল অবস্থানে",
  bestToday: "আজ সবচেয়ে বেশি সহায়তা করেছে",
  worstToday: "আজ সবচেয়ে বেশি চাপ দিয়েছে",

  editHolding: "Holding-এর তথ্য",
  filtersAnnouncement: (count) => `${count}টি সংরক্ষিত শেয়ার দেখানো হচ্ছে`,

  completeHoldings: "তথ্যগুলো পূরণ করুন",
  setupProgress: (completed, total) =>
    `${total}টির মধ্যে ${completed}টি holding-এর হিসাব সম্পূর্ণ`,

  chipHoldings: (count) => `${count}টি হোল্ডিং`,
  chipWatched: (count) => `${count}টি সংরক্ষিত`,
  chipIncomplete: (count) => `${count} তথ্য বাকি`,
  chipReview: (count) => `${count}টি দেখা দরকার`,
  chipDataState: "সম্পূর্ণ হিসাব",

  valueAndPL: "ভ্যালু ও লাভ/ক্ষতি",

  addQuantity: "শেয়ারের সংখ্যা দিলে মূল্য ও পোর্টফোলিওতে অংশ দেখা যাবে",
  addAveragePrice: "গড় ক্রয়মূল্য দিলে লাভ বা ক্ষতি দেখা যাবে",
  addQuantityAction: "শেয়ারের সংখ্যা দিন",
  addAveragePriceAction: "গড় ক্রয়মূল্য দিন",
  addHolding: "পোর্টফোলিওতে যোগ করুন",
  addHoldingTitle: "হোল্ডিং যোগ করুন",
  updateHoldingTitle: "পোর্টফোলিও আপডেট করুন",
  addToPortfolio: "পোর্টফোলিওতে যোগ করুন",
  updateHolding: "পোর্টফোলিও আপডেট করুন",
  stockSearchPlaceholder: "সিম্বল বা কোম্পানির নাম দিয়ে খুঁজুন",
  stockSearchEmpty: "কোনো মিল পাওয়া যায়নি।",
  stockSearchError: "স্টক সার্চ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
  stockSearchLoading: "খোঁজা হচ্ছে…",
  stockRequired: "একটি শেয়ার বেছে নিন।",
  quantityRequired: "পজিটিভ পূর্ণ সংখ্যার quantity দিন।",
  averageBuyPriceRequired: "পজিটিভ average buy price দিন।",
  addNoteToggle: "নোট যোগ করুন",
  hideNote: "নোট লুকান",
  alreadyOnWatchlist: "এই শেয়ারটি ইতিমধ্যে আপনার ওয়াচলিস্টে আছে। পোর্টফোলিও তথ্য যোগ করবেন?",
  previewInvested: "বিনিয়োগকৃত পরিমাণ",
  previewCurrentValue: "বর্তমান ভ্যালু",
  previewUnrealized: "আনুমানিক অবাস্তবায়িত লাভ/ক্ষতি",
  previewPriceUnavailable: "বর্তমান দাম পাওয়া যায়নি",
  previewPriceStale: "পুরোনো সর্বশেষ দাম ব্যবহার করা হচ্ছে",
  previewPriceSuspicious: "দাম যাচাই করা দরকার",
  previewNoDailyFromStale: "পুরোনো দাম থেকে দৈনিক পরিবর্তন হিসাব করা হয় না।",
  savingHolding: "সেভ হচ্ছে…",

  needsSetup: "তথ্য বাকি",
  signalUnavailable: "সিদ্ধান্ত পাওয়া যায়নি",
  holderInstruction: "এই হোল্ডিংয়ের জন্য",
  datedAction: "প্রকাশিত অ্যাকশন",
  sourceDetails: "দামের পর্যবেক্ষণ",
  markDate: "দামের তারিখ",
  sourceTime: "উৎসে পর্যবেক্ষণ",
  previousClose: "আগের সমাপনী দাম",
  sinceCost: "ক্রয়মূল্যের তুলনায়",
  pendingValues: "সেভ হচ্ছে · সর্বশেষ নিশ্চিত হিসাব দেখানো হচ্ছে",
  editFailed: "সেভ হয়নি। আগের হিসাব অপরিবর্তিত আছে। আবার চেষ্টা করুন।",
  partialPL: "ক্রয়মূল্য ও ব্যবহারযোগ্য দাম জানা পজিশনগুলোর লাভ/ক্ষতি দেখানো হচ্ছে।",
  partialDaily: "তুলনাযোগ্য দামের পরিবর্তন জানা পজিশনগুলো দৈনিক হিসাবে আছে।",
  partialInvestment: "পরিমাণ ও ক্রয়মূল্য জানা পজিশনগুলোর বিনিয়োগ দেখানো হচ্ছে।",
  comparisonChanged: "আগের সেশনের তুলনায় বদলেছে",
  comparisonUnchanged: "আগের সেশনের তুলনায় অপরিবর্তিত",
  comparisonUnavailable: "আগের সেশনের তুলনা পাওয়া যায়নি",
  actionLabels: { ...holderActionLabels.bn, WAIT: "অপেক্ষা করুন", POTENTIAL_BUY: "সম্ভাব্য ক্রয়" },

  partialExposure:
    "যেসব holding-এর current value হিসাব করা গেছে, শুধু সেগুলো দিয়েই এই চিত্র দেখানো হচ্ছে।",

  concentration: "এক জায়গায় বেশি ওজন",
  insights: "পোর্টফোলিও ইনসাইট",
  highestRisk: "আজ সবচেয়ে বেশি ঝুঁকিতে",
  lowestDailyContribution: "দৈনিক রিটার্নে সর্বনিম্ন অবদান",
  dailyContributionBasis: "পোর্টফোলিওর দৈনিক রিটার্নে · তুলনাযোগ্য হোল্ডিংস",
  percentagePoints: "শতাংশ পয়েন্ট",

  emailSummary: "Daily portfolio email",
  emailSummaryDetail:
    "Market close-এর পর portfolio value, লাভ/ক্ষতি আর যেগুলো নজরে রাখা দরকার—সব মিলিয়ে একটি ছোট email পেতে চাইলে চালু করুন।",

  emailSummaryEnabled: "Daily email চালু",
  emailSummaryDisabled: "Daily email বন্ধ",

  emailSummaryNote:
    "market close-এর পর email পাঠানো হবে। Preference আপনার account-এ save থাকে।",

  viewStock: "শেয়ারটি দেখুন",

  groupHoldings: (count) => `হোল্ডিং · ${count}`,
  groupWatching: (count) => `নজরে রাখা · ${count}`,
  filterAttention: "যেগুলো দেখা দরকার",

  guidance: {
    REVIEW_HOLDER_GUIDANCE: "প্রকাশিত holder নির্দেশনা ও সীমাবদ্ধতা পর্যালোচনা করুন।",
    DATA_INCOMPLETE:
      "কিছু তথ্য এখনও বাকি। Quantity, average price বা market data পূরণ করুন।",

    PRICE_STALE_OR_SUSPENDED:
      "দামের তথ্য পুরোপুরি নির্ভরযোগ্য নয়। সিদ্ধান্তের আগে Stock Details দেখে নিন।",

    REVIEW_SUPPORT_BREAK:
      "দাম গুরুত্বপূর্ণ support-এর নিচে গেছে। Risk আর latest signal আবার দেখে নিন।",

    REVIEW_SELL_OR_REDUCE:
      "বর্তমান signal SELL বা REDUCE দেখাচ্ছে। কারণগুলো দেখে position আবার ভাবুন।",

    REVIEW_ELEVATED_RISK:
      "Risk বেড়েছে। Position size আর বর্তমান signal একটু ভালো করে দেখুন।",

    DO_NOT_AVERAGE_DOWN_FOR_COST_ONLY:
      "শুধু average price কমানোর জন্য আরও কিনবেন না। আগে stock-এর বর্তমান অবস্থা দেখুন।",

    WATCH_RESISTANCE:
      "দাম resistance-এর কাছে। Volume সঙ্গে আছে কি না দেখে পরের move বুঝুন।",

    PROFITABLE_TREND_INTACT:
      "Trend এখনও ভালো আছে। Momentum দুর্বল হলে support-এর দিকে নজর রাখুন।",

    NO_ACTION_NEEDED:
      "এই হোল্ডিংয়ে আলাদা করে কিছু করার নির্দেশনা নেই।",
  },

  attentionLabels: {
    HOLDER_REVIEW: "holder নির্দেশনা পর্যালোচনা করুন",
    SUPPORT_BREAK: "গুরুত্বপূর্ণ support ভেঙেছে",
    SELL_OR_REDUCE: "SELL বা REDUCE signal",
    PRICE_QUALITY: "দামের তথ্য পুরোপুরি পরিষ্কার নয়",
    ELEVATED_RISK: "Risk বেড়েছে",
    INCOMPLETE_HOLDING: "Holding-এর কিছু তথ্য বাকি",
    HIGH_CONCENTRATION: "একটি stock-এ বেশি ওজন",
    WATCH_RESISTANCE: "Resistance-এর কাছে",
    UNUSUAL_VOLUME: "দাম ও volume-এ অস্বাভাবিক move",
    IMPORTANT_EVENT: "গুরুত্বপূর্ণ company event",
  },

  reasonLabels: {
    ACTIONABLE_POTENTIAL_BUY: "শর্ত মিললে সম্ভাব্য buy setup",
    PRICE_VOLUME_BREAKOUT: "দাম ও volume breakout",
    SUPPORT_REBOUND: "Support থেকে ঘুরে দাঁড়াচ্ছে",
    MOMENTUM_CONTINUATION: "Momentum এখনও চলছে",
    LOW_VOLATILITY_COMPRESSION: "দাম ছোট range-এ জমছে",
    BREAKDOWN: "দুর্বল breakdown—সতর্কভাবে দেখুন",
    HIGH_RISK_WATCH: "Risk বেশি, নজরে রাখুন",
    IMPORTANT_EVENT: "গুরুত্বপূর্ণ company event",
    ELEVATED_RISK: "Risk বেড়েছে, সতর্ক থাকুন",
  },

  priceStatus: {
    FINALIZED: "চূড়ান্ত দাম",
    PROVISIONAL: "সাময়িক দাম",
    NON_TRADED: "আজ লেনদেন হয়নি",
    STALE_LAST_KNOWN: "সর্বশেষ পাওয়া পুরোনো দাম",
    SUSPENDED: "লেনদেন স্থগিত",
    SUSPICIOUS: "দামটি যাচাই করা দরকার",
    UNAVAILABLE: "দাম পাওয়া যায়নি",
  },
};

export const portfolioLanguage: Record<AppLocale, PortfolioLanguage> = { en, bn };
