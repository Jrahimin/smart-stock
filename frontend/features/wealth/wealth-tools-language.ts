import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type ZakatEducationSection = {
  icon: string;
  title: string;
  body: string;
};

export type ComparisonScenarioChipId =
  | "rate-up"
  | "rate-down"
  | "inflation-up"
  | "save-more"
  | "extend";

type WealthDpsLanguage = {
  eyebrow: string;
  title: string;
  description: string;
  build: string;
  goal: string;
  monthly: string;
  target: string;
  rate: string;
  timeline: string;
  projected: string;
  discipline: string;
  save: string;
  perMonth: string;
  contribution: string;
  contributionTitle: string;
  deposited: string;
  returns: string;
  futureValue: string;
  buyingPower: string;
  futurePath: string;
  futurePathTitle: string;
  futurePathBody: string;
  currentPace: string;
  milestones: string;
  milestoneBody: string;
  beyond: string;
  waiting: string;
  waitingTitle: string;
  delay: string;
  startToday: string;
  startLater: string;
  waitingBody: string;
  keepExploring: string;
  keepExploringTitle: string;
  keepExploringBody: string;
  compareFdr: string;
  compareInvesting: string;
  tryMode: string;
  twentyYears: string;
  disclaimer: string;
  growthEyebrow: string;
  growthTitle: string;
  legendDeposited: string;
  legendWealth: string;
  chartDeposited: string;
  chartWealth: string;
  flowEyebrow: string;
  flowTitle: string;
  flowHabit: string;
  flowPool: string;
  flowEntered: string;
  insightEyebrow: string;
  insightEarlyTitle: string;
  insightEarlyBody: string;
  insightMidTitle: string;
  insightMidBody: string;
  insightLongTitle: string;
  insightLongBody: string;
  insightLateTitle: string;
  insightLateBody: string;
  snapshotTrackTitle: string;
  snapshotEyebrow: string;
  growthShare: string;
  ratioAria: string;
  milestone10Lakh: string;
  milestone50Lakh: string;
  milestone1Crore: string;
  milestone2Crore: string;
};

type WealthTaxLanguage = {
  title: string;
  hero: string;
  potentialSavings: string;
  error: string;
  quick: string;
  detailed: string;
  about: string;
  income: string;
  investments: string;
  review: string;
  heroChips: readonly string[];
  heroAsideCaption: string;
  eduLabel: string;
};

type WealthComparisonLanguage = {
  title: string;
  subtitle: string;
  loading: string;
  error: string;
  heroEyebrow: string;
  prelude: string;
  scenarioEyebrow: string;
  scenarioTitle: string;
  alternateEyebrow: string;
  insightEyebrow: string;
  insightTitle: string;
  powerEyebrow: string;
  powerTitle: string;
  ahead: string;
  realPower: string;
  inflationTakes: string;
  updating: string;
  alternate: string;
  alternateTitle: string;
  insights: string;
  insightsTitle: string;
  power: string;
  continue: string;
  save: string;
  explore: string;
  timeTravel: string;
  horizonEyebrow: string;
  horizonQuestion: string;
  horizonYears: (value: number) => string;
  journeyLabel: string;
  jumpMomentsAria: string;
  travelAria: string;
  journeyStations: string;
  goToStop: string;
  crossover: string;
  today: string;
  retirement: string;
  year: string;
  scenarioChips: Record<ComparisonScenarioChipId, { label: string; description: string }>;
};

type WealthSanchayapatraLanguage = {
  eyebrow: string;
  title: string;
  description: string;
  income: string;
  wealth: string;
  certificate: string;
  investment: string;
  purchaseDate: string;
  governmentRate: string;
  configuredRate: string;
  maturity: string;
  save: string;
  disclaimer: string;
  maturityEyebrow: string;
  incomeEyebrow: string;
  incomeBody: string;
  capitalEyebrow: string;
  capitalTitle: string;
  capitalShare: string;
  capitalAria: string;
  capitalInvestment: string;
  capitalReturn: string;
  purchasingEyebrow: string;
  purchasingTitle: string;
  nominalMaturity: string;
  equivalentToday: string;
  purchasingHelper: string;
  insightEyebrow: string;
  journeyEyebrow: string;
  journeyTitle: string;
  journeyPurchase: string;
  journeyFirstPayment: string;
  journeyPassiveIncome: string;
  journeyMaturity: string;
  atMaturity: string;
  afterPurchase: string;
  yearsDuration: string;
  snapshotTrackTitle: string;
  saveMessage: string;
  headlineIncome: string;
  headlineWealth: string;
  insightApproaching: string;
  insightProtected: string;
  insightSteadyIncome: string;
  insightStability: string;
  profitPayment: string;
};

type WealthEmiLanguage = {
  eyebrow: string;
  title: string;
  prompt: string;
  detailsHint: string;
  principal: string;
  annualRate: string;
  tenureMonths: string;
  loanStartDate: string;
  amountRepaid: string;
  snapshotTitle: string;
  saveMessage: string;
  headlineLabel: string;
  summary: string;
  metrics: Record<string, string>;
  insightPrepayTitle: string;
  insightPrepayBody: string;
  comparePrepay: string;
  addToSnapshot: string;
  disclaimer: string;
};

export type WealthToolsLanguage = {
  common: {
    optional: string;
    detailsTitle: string;
    detailsHint: string;
    inflationRate: string;
    sourceTax: string;
    custom: string;
    sourceTaxHint: string;
    saveToSnapshot: string;
    openSnapshot: string;
    snapshotHelper: string;
    snapshotEyebrow: string;
    snapshotDraftSaved: string;
    nextEyebrow: string;
    nextTitle: string;
    nextDescription: string;
    compareAnother: string;
    addToSnapshot: string;
    saveScenario: string;
    updating: string;
    calculationError: string;
    retry: string;
    inflationAdjusted: string;
    years: (value: number) => string;
    accountIdentifiers: Record<string, string>;
  };
  fdr: Record<string, string>;
  dps: WealthDpsLanguage;
  sanchayapatra: WealthSanchayapatraLanguage;
  emi: WealthEmiLanguage;
  tax: WealthTaxLanguage;
  comparison: WealthComparisonLanguage;
  zakat: {
    heroTitle: string;
    heroDescription: string;
    fixedRate: string;
    learnMore: string;
    detailsTitle: string;
    detailsHint: string;
    modal: {
      title: string;
      eyebrow: string;
      intro: string;
      rateTitle: string;
      rateBody: string;
      sections: ZakatEducationSection[];
      calculatorTitle: string;
      calculatorSteps: string[];
      note: string;
      close: string;
    };
  };
};

const english: WealthToolsLanguage = {
  common: {
    optional: "Optional",
    detailsTitle: "Make the estimate more useful",
    detailsHint: "Add a few assumptions for a clearer estimate.",
    inflationRate: "Inflation rate (%)",
    sourceTax: "Source tax on interest (%)",
    custom: "Custom",
    sourceTaxHint:
      "Applied to earned interest only. Principal stays intact.",
    saveToSnapshot: "Save to Snapshot",
    openSnapshot: "Open Money Snapshot",
    snapshotHelper:
      "The more financial information you save, the richer future projections become.",
    nextEyebrow: "This is not the end",
    nextTitle: "Keep exploring your money story",
    nextDescription:
      "A result is a starting point: compare it, save it, or add it to your bigger picture.",
    compareAnother: "Compare another option",
    addToSnapshot: "Add to Money Snapshot",
    saveScenario: "Save this scenario",
    updating: "Updating your estimate...",
    calculationError: "Could not reach the calculator right now.",
    retry: "Try again",
    inflationAdjusted: "Inflation-adjusted",
    years: (value) => `${value} year${value === 1 ? "" : "s"}`,
    snapshotEyebrow: "Save to Money Snapshot",
    snapshotDraftSaved: "Added to your Money Snapshot draft.",
    accountIdentifiers: {
      fdr: "FDR account number (optional)",
      dps: "DPS account number (optional)",
      sanchayapatra: "Certificate / SP number (optional)",
      emi: "Loan account number (optional)",
      "compound-growth": "Portfolio reference (optional)",
    },
  },

  fdr: {
    title: "See what a fixed deposit could become.",
    prompt:
      "Check the trade-off between a steadier return and keeping your money available.",
    helper:
      "Choose a term and payout style, then see the numbers calmly.",
    deposit: "Deposit amount",
    rate: "FDR interest rate (%)",
    duration: "Duration",
    months: "Months",
    quarters: "Quarters",
    years: "Years",
    commitment: "Commitment",
    maturity: "Maturity at unlock",
    payout: "Profit payout style",
    payoutTitle:
      "See how returns feel under different payout choices.",
    payoutMonthly: "Monthly",
    payoutQuarterly: "Quarterly",
    payoutYearly: "Yearly",
    payoutMaturity: "At maturity",
    payoutMonthlyHint: "Profit paid monthly",
    payoutQuarterlyHint: "Profit paid quarterly",
    payoutYearlyHint: "Profit paid yearly",
    payoutMaturityHint: "Compound until unlock",
    liquidity: "Liquidity trade-off",
    save: "Save FDR",
    monthlyIncome: "Monthly income equivalent",
    perDay: "per day",
    perWeek: "per week",
    buyingPower: "Your maturity amount may feel closer to {real} in today’s buying power.",
    liquidityTitle: "Your money stays committed for about {tenure}.",
    liquidityBody: "FDR trades flexibility for a steadier outcome. Know what you are choosing.",
    snapshotTitle: "Keep this deposit, maturity date, and projected return in your snapshot.",
    otherPaths: "Explore other paths",
    otherPathsTitle: "See how this fits into your bigger picture.",
    dpsPath: "Build gradually through a monthly habit.",
    sanchayapatraPath: "Government savings certificate options.",
    compare: "Compare",
    saveScenario: "Save this FDR scenario",
    disclaimer:
      "Educational projection only. Actual FDR terms, taxes, early-break penalties, and bank rules may differ.",
    netMaturityValue: "Net maturity value",
    summaryMaturity:
      "After an estimated {tax}% source tax on interest, a {principal} FDR could grow to about {maturity} over {tenure}.",
    summaryPayout:
      "After an estimated {tax}% source tax on profit, a {principal} FDR can show about {payout} as {frequency} under this rate.",
    profitMonthly: "Monthly profit",
    profitQuarterly: "Quarterly profit",
    profitYearly: "Yearly profit",
    metricPrincipal: "Principal",
    metricGrossInterest: "Gross interest earned",
    metricSourceTaxDeduction: "Source tax deduction",
    metricNetInterest: "Net interest earned",
    metricInflationAdjusted: "Inflation-adjusted value",
    metricMonthlyIncome: "Monthly income equivalent",
    metricMaturityValue: "Maturity value",
    saveSnapshotDone: "FDR added to your Money Snapshot draft.",
    saveScenarioDone: "FDR scenario saved to your local history.",
  },

  dps: {
    eyebrow: "DPS wealth simulator",
    title: "See how a monthly habit can grow into future wealth.",
    description:
      "Move the timeline, adjust the habit, and see how regular saving adds up.",
    build: "Build Wealth",
    goal: "Reach Goal",
    monthly: "Monthly saving",
    target: "Target amount",
    rate: "DPS interest rate (%)",
    timeline: "Timeline",
    projected: "Projected future value",
    discipline: "Monthly discipline needed",
    save: "Save to Snapshot",
    perMonth: "per month",
    contribution: "Contribution vs growth",
    contributionTitle: "Your deposits start it. Time does the quiet work.",
    deposited: "Deposited",
    returns: "Returns",
    futureValue: "Future value",
    buyingPower: "May feel like about {real} in today’s buying power.",
    futurePath: "Your future path",
    futurePathTitle: "If you continue this habit...",
    futurePathBody: "Each milestone uses the same saving and rate, so comparison stays simple.",
    currentPace: "At your current pace",
    milestones: "Milestone engine",
    milestoneBody: "Dates are approximate if the same monthly habit continues.",
    beyond: "Beyond 50 years",
    waiting: "The cost of waiting",
    waitingTitle: "Starting later quietly changes the ending.",
    delay: "Delay start by {years} years",
    startToday: "Start today",
    startLater: "Start later",
    waitingBody: "Starting today could create about {amount} more future wealth.",
    keepExploring: "Keep exploring",
    keepExploringTitle: "The result is the beginning of the journey.",
    keepExploringBody: "Change the timeline, compare options, or keep this habit in your snapshot.",
    compareFdr: "Compare with FDR",
    compareInvesting: "Compare with Investing",
    tryMode: "Try {mode}",
    twentyYears: "See 20-Year Projection",
    disclaimer:
      "Educational projection only. Actual DPS terms, taxes, fees, and bank rules may differ.",
    growthEyebrow: "Visual wealth growth",
    growthTitle: "Watch compound growth separate from deposits.",
    legendDeposited: "Total Deposited",
    legendWealth: "Total Wealth",
    chartDeposited: "Deposited {amount}",
    chartWealth: "Wealth {amount}",
    flowEyebrow: "Money flow",
    flowTitle: "Monthly deposits flowing into a growing asset pool.",
    flowHabit: "Monthly habit",
    flowPool: "Wealth pool",
    flowEntered: "{amount} of habit has entered the pool so far.",
    insightEyebrow: "Dynamic insight",
    insightEarlyTitle: "Your habit matters more than your returns.",
    insightEarlyBody: "{monthly} saved every month is the main engine in these first years.",
    insightMidTitle: "Your earlier deposits are beginning to compound.",
    insightMidBody: "{growth} of the projection now comes from accumulated returns.",
    insightLongTitle: "Time is now contributing almost as much as you are.",
    insightLongBody: "Returns represent about {pct}% of the projected wealth at this horizon.",
    insightLateTitle: "A large part of your future wealth now comes from accumulated returns.",
    insightLateBody: "{growth} is projected growth created by consistency and time.",
    snapshotTrackTitle:
      "Track this monthly habit and projected DPS wealth in your snapshot.",
    snapshotEyebrow: "Save to Money Snapshot",
    growthShare: "{pct}% growth",
    ratioAria: "Deposits and investment growth ratio",
    milestone10Lakh: "First 10 Lakh",
    milestone50Lakh: "First 50 Lakh",
    milestone1Crore: "First 1 Crore",
    milestone2Crore: "First 2 Crore",
  },

  sanchayapatra: {
    eyebrow: "Government Savings Planner",
    title:
      "See how today’s savings could support future family income.",
    description:
      "Explore government savings certificates for steady cash flow and capital planning.",
    income: "Generate Income",
    wealth: "Preserve Wealth",
    certificate: "Certificate type",
    investment: "Investment amount",
    purchaseDate: "Purchase date",
    governmentRate: "Government rate",
    configuredRate: "Current official configured rate",
    maturity: "Estimated maturity value",
    save: "Save Certificate",
    disclaimer:
      "Educational projection only. Actual certificate terms, taxes, and government rules may differ.",
    maturityEyebrow: "Estimated maturity value",
    incomeEyebrow: "Steady income potential",
    incomeBody: "Estimated {payout} from government profit payouts.",
    capitalEyebrow: "Your savings at work",
    capitalTitle: "Your original capital stays protected. Government returns quietly build the rest.",
    capitalShare: "{pct}% generated through returns",
    capitalAria: "Investment versus earned return",
    capitalInvestment: "Your investment {amount}",
    capitalReturn: "Earned return {amount}",
    purchasingEyebrow: "Today's buying power",
    purchasingTitle: "What maturity may feel like later",
    nominalMaturity: "Nominal maturity value",
    equivalentToday: "Equivalent value in today's money",
    purchasingHelper: "Inflation may reduce future purchasing power over time.",
    insightEyebrow: "Insight",
    journeyEyebrow: "Certificate journey",
    journeyTitle: "Savings → Security → Monthly income → Future maturity",
    journeyPurchase: "Certificate Purchased",
    journeyFirstPayment: "First Profit Payment",
    journeyPassiveIncome: "Years of Passive Income",
    journeyMaturity: "Certificate Matures",
    atMaturity: "At maturity",
    afterPurchase: "After purchase",
    yearsDuration: "{years} years",
    snapshotTrackTitle:
      "Track this certificate, future profit payments, and maturity automatically.",
    saveMessage: "Certificate added to your Money Snapshot draft.",
    headlineIncome:
      "Your {investment} investment could provide steady government-backed income over {years} years and grow into approximately {maturity} by maturity.",
    headlineWealth:
      "Your {investment} investment could preserve capital while government returns quietly build toward approximately {maturity} over the certificate period.",
    insightApproaching: "Your investment is approaching maturity.",
    insightProtected: "Most of your capital remains protected while profits accumulate.",
    insightSteadyIncome: "Your certificate is beginning to generate steady income through {payout} payouts.",
    insightStability:
      "{name} offers government-backed stability rather than aggressive growth over {years} years.",
    profitPayment: "Profit payment",
  },

  emi: {
    eyebrow: "Loan / EMI",
    title: "Loan / EMI",
    prompt: "What might this loan ask from your monthly life?",
    detailsHint: "Add a start date or repayments made so far to unlock payoff timelines and progress.",
    principal: "Loan amount",
    annualRate: "Loan interest rate (%)",
    tenureMonths: "Tenure (months)",
    loanStartDate: "Loan start date",
    amountRepaid: "Amount repaid so far",
    snapshotTitle: "Carry this loan scenario into your bigger financial picture.",
    saveMessage: "Added to your Money Snapshot draft.",
    headlineLabel: "Monthly EMI",
    summary:
      "A loan of {principal} may require about {emi}/month for {months} months.",
    metrics: {
      "Total payment": "Total payment",
      "Total interest": "Total interest",
      "Tenure (months)": "Tenure (months)",
      "Payoff date": "Payoff date",
      "Amount repaid so far": "Amount repaid so far",
      "Remaining to pay": "Remaining to pay",
      "Repayment progress": "Repayment progress",
    },
    insightPrepayTitle: "Prepaying can change the picture",
    insightPrepayBody: "Extra payments reduce interest over time, but may reduce cash flexibility.",
    comparePrepay: "Compare prepayment vs investing",
    addToSnapshot: "Add to Money Snapshot",
    disclaimer: "Educational estimate only. Actual loan terms, fees, and bank rules may differ.",
  },

  tax: {
    title: "Tax Planner",
    hero:
      "Get a clearer estimate before you make a tax-saving decision.",
    potentialSavings: "Potential Annual Tax Savings",
    error:
      "Could not calculate this estimate right now. Check your connection and try again.",
    quick: "Quick estimate",
    detailed: "Detailed planner",
    about: "About you",
    income: "Income sources",
    investments: "Tax-saving investments",
    review: "Review & calculate",
    heroChips: ["No tax forms", "No uploads", "Plain language", "Planning focused"],
    heroAsideCaption: "More money kept in your pocket.",
    eduLabel: "What usually helps",
  },

  comparison: {
    title: "Two paths. Different futures.",
    subtitle:
      "One path rewards consistency. One path rewards certainty. Move through time and see where each decision leads.",
    loading: "Exploring futures...",
    error:
      "Could not evaluate this comparison right now.",
    heroEyebrow: "Future simulator",
    prelude:
      "You are about to explore two possible futures.",
    scenarioEyebrow: "Your scenario",
    scenarioTitle: "What you’re comparing",
    alternateEyebrow: "Alternate futures",
    insightEyebrow: "What this future teaches",
    insightTitle: "Observations from your journey",
    powerEyebrow: "Purchasing power",
    powerTitle:
      "What each future may feel like after inflation",
    ahead: "Ahead",
    realPower: "Real purchasing power",
    inflationTakes: "Inflation takes",
    updating: "Updating your futures...",
    alternate: "Alternate futures",
    alternateTitle: "Try another possible path",
    insights: "What this future teaches",
    insightsTitle: "Observations from your journey",
    power: "Purchasing power",
    continue: "Continue the story",
    save: "Save this scenario",
    explore: "Explore a different assumption",
    timeTravel: "View in Time Travel",
    horizonEyebrow: "Comparison horizon",
    horizonQuestion: "How long should this comparison run?",
    horizonYears: (value) => (value === 1 ? "1 Year" : `${value} Years`),
    journeyLabel: "Your journey",
    jumpMomentsAria: "Jump to key moments",
    travelAria: "Travel through financial time",
    journeyStations: "Journey stations",
    goToStop: "Go to {label}",
    crossover: "Crossover",
    today: "Today",
    retirement: "Retirement",
    year: "Year {value}",
    scenarioChips: {
      "rate-up": {
        label: "Higher Rates",
        description: "Explore a future where returns rise 1%.",
      },
      "rate-down": {
        label: "Conservative Future",
        description: "See what happens if rates fall 1%.",
      },
      "inflation-up": {
        label: "Higher Inflation",
        description: "Prices rise faster — purchasing power shifts.",
      },
      "save-more": {
        label: "Save More",
        description: "What if you commit 20% more each month?",
      },
      extend: {
        label: "Retire Earlier",
        description: "Stretch the journey five years further.",
      },
    },
  },

  zakat: {
    heroTitle: "Estimate your Zakat with a clearer checklist.",
    heroDescription:
      "Start with what you own today, note near-term obligations, then check the nisab threshold.",
    fixedRate:
      "This calculator uses the familiar 2.5% rate for eligible wealth above nisab.",
    learnMore: "Know about zakat",
    detailsTitle: "nisab check",
    detailsHint:
      "Change this only if you use a different scholarly reference.",
    modal: {
      title: "Zakat, made clearer",
      eyebrow: "A 60-second guide",
      intro:
        "Know what belongs in your estimate before you begin.",
      rateTitle: "The familiar 2.5%",
      rateBody:
        "Applied after eligible wealth meets the nisab conditions.",
      sections: [
        {
          icon: "calendar",
          title: "When",
          body:
            "Commonly after one Hijri year above nisab. Keep one personal Zakat date.",
        },
        {
          icon: "wallet",
          title: "Include",
          body:
            "Cash, balances, eligible investments, business stock, and money owed to you.",
        },
        {
          icon: "receipt",
          title: "Deduct",
          body:
            "Genuine near-term obligations. Do not guess on large or long-term debt.",
        },
        {
          icon: "heart",
          title: "Keep the intention close",
          body:
            "Ramadan is popular, but your own due date still matters.",
        },
      ],
      calculatorTitle: "Use this estimate",
      calculatorSteps: [
        "Add eligible assets at today’s value.",
        "Add near-term obligations only.",
        "Check nisab, then use the result as a starting point.",
      ],
      note:
        "For a binding religious answer, consult a qualified local Islamic scholar.",
      close: "Got it",
    },
  },
};

const bangla: WealthToolsLanguage = {
  common: {
    optional: "ঐচ্ছিক",
    detailsTitle: "হিসাবটা আরও নিখুঁত করতে পারেন (ঐচ্ছিক)",
    detailsHint:
      "আরও কিছু তথ্য দিলে estimate-টা আপনার অবস্থার কাছাকাছি হবে।",
    inflationRate: "Inflation rate (%)",
    sourceTax: "Interest-এর source tax (%)",
    custom: "নিজের rate",
    sourceTaxHint:
      "Tax শুধু interest-এর অংশে ধরা হবে; আসল টাকা একই থাকবে।",
    saveToSnapshot: "Money Snapshot-এ রাখুন",
    openSnapshot: "Money Snapshot খুলুন",
    snapshotHelper:
      "তথ্য যত যোগ করবেন, আপনার financial picture তত পরিষ্কার হবে।",
    nextEyebrow: "এরপর কী?",
    nextTitle: "এই হিসাব থেকে পরের ধাপে যান",
    nextDescription:
      "অন্য option compare করুন, এই হিসাবটা save করুন, অথবা Money Snapshot-এ রেখে পুরো ছবিটা গড়ে তুলুন।",
    compareAnother: "আরেকটি option compare করুন",
    addToSnapshot: "Money Snapshot-এ যোগ করুন",
    saveScenario: "এই হিসাবটা save করুন",
    updating: "হিসাবটা update হচ্ছে...",
    calculationError:
      "এখন হিসাবটা করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
    inflationAdjusted: "Inflation ধরলে",
    years: (value) => `${value} বছর`,
    snapshotEyebrow: "Money Snapshot-এ রাখুন",
    snapshotDraftSaved: "Money Snapshot draft-এ রাখা হয়েছে।",
    accountIdentifiers: {
      fdr: "FDR account number (ঐচ্ছিক)",
      dps: "DPS account number (ঐচ্ছিক)",
      sanchayapatra: "Certificate / SP number (ঐচ্ছিক)",
      emi: "Loan account number (ঐচ্ছিক)",
      "compound-growth": "Portfolio reference (ঐচ্ছিক)",
    },
  },

  fdr: {
    title: "FDR-এ রাখলে টাকাটা কোথায় যেতে পারে?",
    prompt:
      "Return তুলনামূলক স্থির হতে পারে, তবে মেয়াদের আগে টাকা ব্যবহারে সীমাবদ্ধতা থাকতে পারে—দুই দিকই আগে দেখুন।",
    helper:
      "Amount, মেয়াদ আর profit নেওয়ার ধরন বেছে নিন। হিসাবটা দেখলেই পার্থক্য পরিষ্কার হবে।",
    deposit: "কত টাকা রাখবেন",
    rate: "FDR interest rate (%)",
    duration: "মেয়াদ",
    months: "মাস",
    quarters: "Quarter-এ",
    years: "বছর",
    commitment: "টাকা কতদিন আটকে থাকবে",
    maturity: "মেয়াদ শেষে কত হতে পারে",
    payout: "Profit কীভাবে নেবেন",
    payoutTitle:
      "Profit মাসে নেবেন, প্রতি Quarter-এ নেবেন, নাকি maturity-তে—পাশাপাশি মিলিয়ে দেখুন।",
    payoutMonthly: "মাসে",
    payoutQuarterly: "প্রতি Quarter",
    payoutYearly: "বছরে",
    payoutMaturity: "Maturity-তে",
    payoutMonthlyHint: "প্রতি মাসে profit পাবেন",
    payoutQuarterlyHint: "প্রতি Quarter শেষে profit পাবেন",
    payoutYearlyHint: "বছরে একবার profit পাবেন",
    payoutMaturityHint: "Profit মেয়াদ পর্যন্ত জমতে থাকবে",
    liquidity: "প্রয়োজনে টাকা পাওয়ার সুবিধা",
    save: "FDR হিসাবটা save করুন",
    monthlyIncome: "মাসিক আয়ের হিসাবে",
    perDay: "দিনে",
    perWeek: "সপ্তাহে",
    buyingPower:
      "Inflation ধরলে maturity-র amount-এর আসল value আজকের দামে প্রায় {real} হতে পারে।",
    liquidityTitle:
      "প্রায় {tenure} সময় টাকাটা সহজে ব্যবহার করা যাবে না।",
    liquidityBody:
      "FDR কিছু flexibility ছেড়ে তুলনামূলক স্থির return দেয়। আপনার plan-এর সঙ্গে এই trade-off মানায় কি না, দেখে নিন।",
    snapshotTitle:
      "এই FDR-এর amount, maturity date আর expected return Money Snapshot-এ রাখুন।",
    otherPaths: "আরও option দেখুন",
    otherPathsTitle:
      "আপনার বড় financial plan-এ এই FDR কোথায় মানায়, মিলিয়ে দেখুন।",
    dpsPath: "মাসে মাসে savings করে ধীরে ধীরে গড়ে তুলুন।",
    sanchayapatraPath:
      "Sanchayapatra-র income আর maturity option দেখুন।",
    compare: "Compare করে দেখুন",
    saveScenario: "এই FDR হিসাবটি save করুন",
    disclaimer:
      "এই estimate দেখে সিদ্ধান্ত নেওয়ার আগে ব্যাংকের actual rate, tax, early-break charge আর শর্ত মিলিয়ে নিন।",
    netMaturityValue: "Maturity-র net amount",
    summaryMaturity:
      "Interest-এ আনুমানিক {tax}% source tax ধরলে {principal} FDR {tenure} পরে প্রায় {maturity} হতে পারে।",
    summaryPayout:
      "Profit-এ আনুমানিক {tax}% source tax ধরলে {principal} FDR থেকে {frequency} প্রায় {payout} দেখা যেতে পারে।",
    profitMonthly: "মাসিক profit",
    profitQuarterly: "Quarter-এ profit",
    profitYearly: "বছরে profit",
    metricPrincipal: "মূল amount",
    metricGrossInterest: "মোট interest",
    metricSourceTaxDeduction: "Source tax কাটা",
    metricNetInterest: "Net interest",
    metricInflationAdjusted: "Inflation ধরলে",
    metricMonthlyIncome: "মাসিক আয়ের হিসাবে",
    metricMaturityValue: "Maturity-তে মোট",
    saveSnapshotDone: "FDR Money Snapshot draft-এ যোগ হয়েছে।",
    saveScenarioDone: "FDR হিসাবটি save হয়েছে।",
  },

  dps: {
    eyebrow: "DPS Wealth Simulator",
    title: "মাসে মাসে রাখা টাকা কয়েক বছর পর কত হতে পারে?",
    description:
      "সময়, monthly saving আর rate বদলে দেখুন—ছোট ছোট saving কীভাবে ধীরে ধীরে বড় amount বানায়।",
    build: "Wealth গড়ুন",
    goal: "Goal ধরে দেখি",
    monthly: "মাসে কত রাখবেন",
    target: "কত টাকার Goal",
    rate: "DPS interest rate (%)",
    timeline: "কত বছরের জন্য",
    projected: "ভবিষ্যতে মোট কত হতে পারে",
    discipline: "Goal পেতে মাসে কত রাখবেন",
    save: "Money Snapshot-এ রাখুন",
    perMonth: "প্রতি মাসে",
    contribution: "জমা আর Growth-এর ভাগ",
    contributionTitle:
      "শুরুটা আপনার জমায়, সময় ধীরে ধীরে Growth যোগ করে।",
    deposited: "আপনার মোট জমা",
    returns: "Growth থেকে এসেছে",
    futureValue: "ভবিষ্যতে মোট amount",
    buyingPower:
      "Inflation ধরলে এটি আজকের প্রায় {real}-এর মতো মনে হতে পারে।",
    futurePath: "ভবিষ্যতের পথ",
    futurePathTitle: "এই saving habit চালিয়ে গেলে...",
    futurePathBody:
      "একই monthly saving আর rate ধরে কোন সময়ে কত হতে পারে, সেটাই দেখানো হচ্ছে।",
    currentPace: "এখনকার গতিতে",
    milestones: "কোন সময়ে কোন milestone",
    milestoneBody:
      "একই saving habit চলতে থাকলে এই milestone-গুলো আনুমানিক সময়ে আসতে পারে।",
    beyond: "50 বছরের পরে",
    waiting: "দেরি করলে কী বদলায়",
    waitingTitle:
      "শুরুটা যত পিছোয়, শেষের amount-ও তত বদলে যায়।",
    delay: "{years} বছর পরে শুরু",
    startToday: "আজ শুরু",
    startLater: "পরে শুরু",
    waitingBody:
      "আজ শুরু করলে ভবিষ্যতে প্রায় {amount} বেশি হতে পারে।",
    keepExploring: "আরও দেখুন",
    keepExploringTitle:
      "এই হিসাব থেকেই পরের প্রশ্নটা আসছে",
    keepExploringBody:
      "সময় বা monthly saving বদলান, FDR-এর সঙ্গে compare করুন, অথবা হিসাবটা Money Snapshot-এ রাখুন।",
    compareFdr: "FDR-এর সঙ্গে compare করুন",
    compareInvesting: "Investing-এর সঙ্গে compare করুন",
    tryMode: "{mode} দেখে নিন",
    twentyYears: "20 বছরের হিসাব দেখুন",
    disclaimer:
      "এই estimate ধরে plan করার আগে ব্যাংকের actual rate, tax, fee আর DPS-এর শর্ত দেখে নিন।",
    growthEyebrow: "সম্পদের growth দেখুন",
    growthTitle: "জমা আর compound growth আলাদা করে দেখুন।",
    legendDeposited: "মোট জমা",
    legendWealth: "মোট সম্পদ",
    chartDeposited: "জমা {amount}",
    chartWealth: "সম্পদ {amount}",
    flowEyebrow: "টাকার প্রবাহ",
    flowTitle: "মাসিক জমা ধীরে ধীরে বড় asset pool-এ ঢুকছে।",
    flowHabit: "মাসিক অভ্যাস",
    flowPool: "Wealth pool",
    flowEntered: "এখন পর্যন্ত {amount} এই pool-এ ঢুকেছে।",
    insightEyebrow: "Live insight",
    insightEarlyTitle: "প্রথম দিকে অভ্যাসটা সবচেয়ে বড় কথা।",
    insightEarlyBody: "প্রথম কয়েক বছরে প্রতি মাসে {monthly} রাখাই মূল engine।",
    insightMidTitle: "আগের জমাগুলো compound হতে শুরু করেছে।",
    insightMidBody: "এখন projection-এর {growth} return থেকে এসেছে।",
    insightLongTitle: "সময় এখন প্রায় আপনার সমান কাজ করছে।",
    insightLongBody: "এই horizon-এ projected wealth-এর প্রায় {pct}% return থেকে আসছে।",
    insightLateTitle: "ভবিষ্যতের সম্পদের বড় অংশ এখন return থেকে আসছে।",
    insightLateBody: "{growth} হলো consistency আর সময়ে তৈরি সম্ভাব্য growth।",
    snapshotTrackTitle:
      "এই monthly habit আর DPS wealth projection Money Snapshot-এ রাখুন।",
    snapshotEyebrow: "Money Snapshot-এ রাখুন",
    growthShare: "{pct}% growth",
    ratioAria: "জমা বনাম investment growth",
    milestone10Lakh: "প্রথম 10 লাখ",
    milestone50Lakh: "প্রথম 50 লাখ",
    milestone1Crore: "প্রথম 1 কোটি",
    milestone2Crore: "প্রথম 2 কোটি",
  },

  sanchayapatra: {
    eyebrow: "Government Savings Planner",
    title:
      "আজ টাকা রাখলে মাসে কত income, আর শেষে কত হতে পারে?",
    description:
      "Certificate-এর ধরন, rate আর payout বদলে দেখুন—এখনকার income আর শেষে capital কোথায় দাঁড়ায়।",
    income: "Income দেখি",
    wealth: "Capital রাখি",
    certificate: "সঞ্চয়পত্রের ধরন",
    investment: "কত টাকা রাখবেন",
    purchaseDate: "কেনার তারিখ",
    governmentRate: "সরকারি rate",
    configuredRate: "বর্তমান official rate",
    maturity: "Maturity-তে কত হতে পারে",
    save: "এই Sanchayapatra হিসাব save করুন",
    disclaimer:
      "এখানকার ফলাফল আনুমানিক। সরকারি সিদ্ধান্তের সাথে হিসাব পরিবর্তন হতে পারে।",
    maturityEyebrow: "Maturity-তে মোট কত হতে পারে",
    incomeEyebrow: "নিয়মিত income-এর সম্ভাবনা",
    incomeBody: "সরকারি profit payout থেকে আনুমানিক {payout}।",
    capitalEyebrow: "আপনার savings কাজ করছে",
    capitalTitle: "মূল investment-টা থাকে, return ধীরে ধীরে তার সঙ্গে যোগ হয়।",
    capitalShare: "return থেকে {pct}%",
    capitalAria: "Investment আর earned return-এর ভাগ",
    capitalInvestment: "আপনার investment {amount}",
    capitalReturn: "Return থেকে {amount}",
    purchasingEyebrow: "আজকের কেনার ক্ষমতা",
    purchasingTitle: "Maturity-র টাকা ভবিষ্যতে কেমন মনে হতে পারে",
    nominalMaturity: "Maturity-র মোট value",
    equivalentToday: "আজকের দামে প্রায়",
    purchasingHelper: "সময়ের সাথে inflation কেনার ক্ষমতা কমাতে পারে।",
    insightEyebrow: "Insight",
    journeyEyebrow: "Certificate-এর পথ",
    journeyTitle: "Savings → স্থিরতা → মাসিক income → Maturity",
    journeyPurchase: "Certificate কেনা",
    journeyFirstPayment: "প্রথম profit payment",
    journeyPassiveIncome: "Passive income-এর সময়",
    journeyMaturity: "Certificate maturity",
    atMaturity: "Maturity-তে",
    afterPurchase: "কেনার পর",
    yearsDuration: "{years} বছর",
    snapshotTrackTitle:
      "এই certificate, profit payment আর maturity Money Snapshot-এ রেখে দিন।",
    saveMessage: "Certificate Money Snapshot draft-এ যোগ হয়েছে।",
    headlineIncome:
      "{investment} রাখলে {years} বছরে সরকারি income পাওয়া যেতে পারে, maturity-তে প্রায় {maturity} হতে পারে।",
    headlineWealth:
      "{investment} রাখলে capital ধরে রেখে certificate period শেষে প্রায় {maturity} হতে পারে।",
    insightApproaching: "Investment maturity-র কাছাকাছি চলে এসেছে।",
    insightProtected: "মূল investment-এর পাশে profit ধীরে ধীরে জমছে।",
    insightSteadyIncome: "Certificate {payout} payout দিয়ে নিয়মিত income দিতে শুরু করেছে।",
    insightStability:
      "{name} {years} বছরে aggressive growth-এর বদলে তুলনামূলক স্থিরতার দিকে যায়।",
    profitPayment: "Profit payment",
  },

  emi: {
    eyebrow: "Loan / EMI",
    title: "Loan / EMI",
    prompt: "এই loan মাসে আপনার জীবন থেকে কতটা চাইতে পারে?",
    detailsHint:
      "Loan শুরুর তারিখ বা এখন পর্যন্ত কতটা পরিশোধ করেছেন দিলে payoff timeline আর progress আরও পরিষ্কার হবে।",
    principal: "Loan amount",
    annualRate: "Loan interest rate (%)",
    tenureMonths: "মেয়াদ (মাস)",
    loanStartDate: "Loan শুরুর তারিখ",
    amountRepaid: "এখন পর্যন্ত পরিশোধ",
    snapshotTitle: "এই loan scenario Money Snapshot-এ রাখুন।",
    saveMessage: "Money Snapshot draft-এ যোগ হয়েছে।",
    headlineLabel: "মাসিক EMI",
    summary: "প্রায় {principal} loan নিলে {months} মাস ধরে মাসে {emi} করে দিতে হতে পারে।",
    metrics: {
      "Total payment": "মোট পরিশোধ",
      "Total interest": "মোট সুদ",
      "Tenure (months)": "মেয়াদ (মাস)",
      "Payoff date": "শেষ পরিশোধের তারিখ",
      "Amount repaid so far": "এখন পর্যন্ত পরিশোধ",
      "Remaining to pay": "বাকি আছে",
      "Repayment progress": "পরিশোধের অগ্রগতি",
    },
    insightPrepayTitle: "আগে কিছুটা শোধ করলে ছবিটা বদলাতে পারে",
    insightPrepayBody:
      "Extra payment সুদ কমাতে পারে, তবে হাতে cash কমে যেতে পারে।",
    comparePrepay: "Prepayment আর investing compare করুন",
    addToSnapshot: "Money Snapshot-এ যোগ করুন",
    disclaimer:
      "এটি শেখার জন্য estimate। সিদ্ধান্তের আগে ব্যাংকের actual শর্ত দেখে নিন।",
  },

  tax: {
    title: "Tax Planner",
    hero:
      "Tax-saving investment করার আগে বছরে tax কত হতে পারে, আর কতটা কমানো সম্ভব—একবার দেখে নিন।",
    potentialSavings: "বছরে tax কতটা কমতে পারে",
    error:
      "এখন tax estimate তৈরি করা যাচ্ছে না। Internet connection ঠিক আছে কি না দেখে আবার চেষ্টা করুন।",
    quick: "Quick estimate",
    detailed: "Detailed planner",
    about: "আপনার তথ্য",
    income: "Income sources",
    investments: "Tax-saving investments",
    review: "সব দেখে হিসাব করুন",
    heroChips: [
      "Tax form লাগবে না",
      "কোনো upload নেই",
      "সহজ ভাষায়",
      "Planning-এর জন্য",
    ],
    heroAsideCaption: "Tax কমলে পকেটে কতটা বেশি থাকতে পারে",
    eduLabel: "সাধারণত কী কাজে আসে",
  },

  comparison: {
    title: "দুই পথ, দুই রকম ভবিষ্যৎ",
    subtitle:
      "এক পথে মাসে মাসে saving, অন্য পথে শুরুতেই lump sum। সময় এগিয়ে দেখে নিন, কোনটা আপনার পরিকল্পনার সঙ্গে বেশি মেলে।",
    loading: "দুই option পাশাপাশি মিলিয়ে দেখা হচ্ছে...",
    error:
      "এখন comparison-টা তৈরি করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
    heroEyebrow: "Future Simulator",
    prelude:
      "একই টাকা দুইভাবে ব্যবহার করলে সামনে কী বদলাতে পারে—এবার সেটাই দেখুন।",
    scenarioEyebrow: "আপনার হিসাব",
    scenarioTitle: "যে দুই option মিলিয়ে দেখছেন",
    alternateEyebrow: "আরেকভাবে হলে",
    insightEyebrow: "এই তুলনা কী বলছে",
    insightTitle: "হিসাব থেকে যে ছবিটা পাওয়া যাচ্ছে",
    powerEyebrow: "Purchasing Power",
    powerTitle:
      "Inflation-এর পরে টাকার কেনার ক্ষমতা কতটা থাকবে",
    ahead: "এগিয়ে",
    realPower: "আজকের দামে value",
    inflationTakes: "Inflation-এ যতটা কমে",
    updating: "নতুন হিসাব তৈরি হচ্ছে...",
    alternate: "আরেকভাবে হলে",
    alternateTitle: "অন্যভাবে হলে দেখুন",
    insights: "এই তুলনা কী বলছে",
    insightsTitle: "হিসাব থেকে যে ছবিটা পাওয়া যাচ্ছে",
    power: "Purchasing Power",
    continue: "এবার কী করবেন",
    save: "এই হিসাবটা save করুন",
    explore: "Assumption বদলে আবার দেখুন",
    timeTravel: "Time Travel-এ দেখুন",
    horizonEyebrow: "Comparison horizon",
    horizonQuestion: "কতদিনের হিসাব দেখতে চান?",
    horizonYears: (value) => `${value} বছর`,
    journeyLabel: "আপনার পথ",
    jumpMomentsAria: "গুরুত্বপূর্ণ সময়ে যান",
    travelAria: "সময় ধরে হিসাব দেখুন",
    journeyStations: "Journey-এর ধাপ",
    goToStop: "{label}-এ যান",
    crossover: "Crossover",
    today: "আজ",
    retirement: "Retirement",
    year: "বছর {value}",
    scenarioChips: {
      "rate-up": {
        label: "Rate বেশি হলে",
        description: "Return 1% বাড়লে সামনের ছবি কেমন বদলাতে পারে, দেখুন।",
      },
      "rate-down": {
        label: "কম rate ধরে দেখুন",
        description: "Rate 1% কমলে দুই পথে কী পার্থক্য হতে পারে, দেখুন।",
      },
      "inflation-up": {
        label: "Inflation বেশি হলে",
        description: "দাম দ্রুত বাড়লে purchasing power কোথায় কমে, দেখুন।",
      },
      "save-more": {
        label: "আরও বেশি save",
        description: "মাসে 20% বেশি রাখলে কী বদলায়, দেখুন।",
      },
      extend: {
        label: "সময় আরও বাড়ান",
        description: "সময় 5 বছর বাড়িয়ে সামনে কী হয়, দেখুন।",
      },
    },
  },

  zakat: {
    heroTitle: "যাকাতের হিসাবটা গুছিয়ে শুরু করুন",
    heroDescription:
      "কোন সম্পদ যোগ হবে, কোন দায় বাদ যাবে, আর নিসাব পূরণ হয়েছে কি না—একসঙ্গে পরিষ্কার করে নিন।",
    fixedRate:
      "নিসাবের ওপরে যাকাতযোগ্য সম্পদ থাকলে এখানে প্রচলিত 2.5% rate ধরে estimate করা হচ্ছে।",
    learnMore: "যাকাতটা কীভাবে হিসাব হয়?",
    detailsTitle: "নিসাব মিলিয়ে নিন",
    detailsHint:
      "আপনি ভিন্ন কোনো শরয়ি মত অনুসরণ করলে তবেই এটি বদলান।",
    modal: {
      title: "যাকাত, সহজ করে",
      eyebrow: "1 মিনিটে বুঝে নিন",
      intro:
        "হিসাব শুরুর আগে তিনটি বিষয় পরিষ্কার করুন—কী যোগ হবে, কী বাদ যাবে, আর আপনার due date কখন।",
      rateTitle: "প্রচলিত 2.5% rate",
      rateBody:
        "যাকাতযোগ্য সম্পদ নিসাবের শর্ত পূরণ করলে সাধারণত এই rate-এ হিসাব করা হয়।",
      sections: [
        {
          icon: "calendar",
          title: "কখন হিসাব করবেন",
          body:
            "নিসাবের ওপরে সম্পদ এক হিজরি বছর থাকলে সাধারণভাবে যাকাত প্রযোজ্য হয়। নিজের একটি due date রাখলে প্রতি বছর হিসাব সহজ হয়।",
        },
        {
          icon: "wallet",
          title: "কী কী যোগ করবেন",
          body:
            "Cash, bank balance, যাকাতযোগ্য investment, ব্যবসার বিক্রিযোগ্য পণ্য আর পাওনা টাকা।",
        },
        {
          icon: "receipt",
          title: "কী কী বাদ যেতে পারে",
          body:
            "শিগগির পরিশোধের বাস্তব দায়। দীর্ঘমেয়াদি debt পুরোটা নিজে থেকে বাদ না দেওয়াই ভালো।",
        },
        {
          icon: "heart",
          title: "নিজের due date মনে রাখুন",
          body:
            "রমজানে অনেকে যাকাত দেন, তবে আপনার যাকাতের নির্ধারিত date-টাই মূল বিষয়।",
        },
      ],
      calculatorTitle: "Calculator-এ কী দেবেন",
      calculatorSteps: [
        "আজকের বাজারমূল্য ধরে যাকাতযোগ্য সম্পদ যোগ করুন।",
        "শুধু শিগগির পরিশোধযোগ্য বাস্তব দায় বাদ দিন।",
        "নিসাব মিলিয়ে পাওয়া হিসাবটাকে শুরু করার estimate হিসেবে নিন।",
      ],
      note:
        "আপনার নির্দিষ্ট পরিস্থিতিতে সঠিক হিসাবের জন্য স্থানীয় যোগ্য আলেমের পরামর্শ নিন।",
      close: "বুঝেছি",
    },
  },
};

const WEALTH_TOOLS_LANGUAGE: Record<
  AppLocale,
  WealthToolsLanguage
> = {
  en: english,
  bn: bangla,
};

export function getWealthToolsLanguage(
  locale: AppLocale = DEFAULT_LOCALE,
) {
  return (
    WEALTH_TOOLS_LANGUAGE[locale] ??
    WEALTH_TOOLS_LANGUAGE[DEFAULT_LOCALE]
  );
}
