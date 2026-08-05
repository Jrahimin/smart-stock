import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type InvestmentEvaluationLanguage = {
  title: string;
  description: string;
  planTitle: string;
  fields: {
    initialInvestment: string;
    additionalCosts: string;
    monthlyIncome: string;
    monthlyExpenses: string;
    investmentMonths: string;
    exitValue: string;
    ownershipPercentage: string;
    taxRate: string;
    feesRate: string;
    incomeGrowthRate: string;
    expenseGrowthRate: string;
  };
  units: { months: string; percent: string };
  advancedTitle: string;
  advancedOptional: string;
  advancedHint: string;
  outcomeTitle: string;
  monthlyNetIncome: string;
  breakEven: string;
  totalCapital: string;
  totalProfit: string;
  roi: string;
  annualizedReturn: string;
  exitContribution: string;
  notReached: string;
  interpretation: (months: string, income: string) => string;
  incomeGapInsight: string;
  periodInsight: string;
  assumptionsNote: string;
  stressTitle: string;
  stressDescription: string;
  stressMonthlyIncome: string;
  stressBreakEven: string;
  stressTotalProfit: string;
};

export type InvestmentPlannerLanguage = {
  eyebrow: string;
  title: string;
  description: string;
  modeLegend: string;
  modes: {
    grow: { label: string; description: string };
    evaluate: { label: string; description: string };
  };
  growTitle: string;
  growDescription: string;
  planTitle: string;
  fields: {
    principal: string;
    monthlyContribution: string;
    annualRate: string;
    years: string;
    inflationRate: string;
    withdrawalRate: string;
    monthlyIncomeTarget: string;
  };
  units: { percent: string; years: string; months: string };
  advancedTitle: string;
  advancedOptional: string;
  formInsight: string;
  outcomeTitle: string;
  futureValue: (years: number) => string;
  todayValue: string;
  todayValueHelper: (inflationRate: string) => string;
  totalContribution: string;
  estimatedGrowth: string;
  splitTitle: string;
  contribution: string;
  growth: string;
  growthInsight: (growth: string, percent: string, growthLeads: boolean) => string;
  scenarioTitle: string;
  scenarioDescription: (amount: string) => string;
  newMonthlyContribution: string;
  newFutureValue: string;
  additionalGain: string;
  incomePotential: {
    title: string;
    description: string;
    sourceLegend: string;
    fromCapital: string;
    incomeTarget: string;
    monthlyIncome: string;
    annualIncome: string;
    monthlyIncomeTodayValue: string;
    capitalOutlook: string;
    outlook: Record<"growing" | "stable" | "declining", string>;
    requiredCapital: string;
    capitalGap: string;
    additionalMonthlyInvestment: string;
    notNeeded: string;
    assumptionNote: string;
  };
  updating: string;
  error: string;
  evaluation: InvestmentEvaluationLanguage;
};

const language = {
  en: {
    eyebrow: "Investment planner",
    title: "Plan an investment",
    description: "Choose what you want to understand, then shape one simple plan around your numbers.",
    modeLegend: "Choose an investment planning mode",
    modes: {
      grow: { label: "Grow my money", description: "See how your money may grow over time" },
      evaluate: { label: "Evaluate an investment", description: "See income, recovery time, profit and ROI" },
    },
    growTitle: "Grow my money",
    growDescription: "See how a starting amount and a monthly investment could grow over time with compound returns.",
    planTitle: "Your plan",
    fields: {
      principal: "Amount already available",
      monthlyContribution: "Monthly investment",
      annualRate: "Expected yearly return",
      years: "Investment period",
      inflationRate: "Inflation rate (yearly)",
      withdrawalRate: "Yearly withdrawal rate",
      monthlyIncomeTarget: "Monthly income target",
    },
    units: { percent: "%", years: "Years", months: "Months" },
    advancedTitle: "Advanced assumptions",
    advancedOptional: "Optional",
    formInsight: "Small, regular contributions can give compounding more time to work.",
    outcomeTitle: "Your estimated outcome",
    futureValue: (years) => `Future value in ${years} year${years === 1 ? "" : "s"}`,
    todayValue: "Value in today’s money",
    todayValueHelper: (inflationRate) => `Using ${inflationRate}% yearly inflation`,
    totalContribution: "Total contribution",
    estimatedGrowth: "Estimated growth",
    splitTitle: "Contribution vs growth",
    contribution: "Your contribution",
    growth: "Estimated growth",
    growthInsight: (growth, percent, growthLeads) =>
      growthLeads
        ? `About ${growth} (${percent}%) could come from estimated growth — slightly more than your own contributions.`
        : `About ${growth} (${percent}%) could come from estimated growth; your contributions still do most of the work.`,
    scenarioTitle: "What if you invest a little more?",
    scenarioDescription: (amount) => `Invest ${amount} more each month`,
    newMonthlyContribution: "New monthly investment",
    newFutureValue: "New future value",
    additionalGain: "Additional gain",
    incomePotential: {
      title: "Could this future amount generate income?",
      description: "Use a withdrawal-rate assumption to explore income potential. It is not a guaranteed income estimate.",
      sourceLegend: "Choose an income question",
      fromCapital: "From my projected capital",
      incomeTarget: "I have a monthly income target",
      monthlyIncome: "Estimated monthly income",
      annualIncome: "Annual income",
      monthlyIncomeTodayValue: "Monthly income in today’s money",
      capitalOutlook: "Capital outlook at this rate",
      outlook: {
        growing: "Projected capital may continue growing",
        stable: "Projected capital may remain broadly stable",
        declining: "Projected capital may decline over time",
      },
      requiredCapital: "Required capital",
      capitalGap: "Gap from projected capital",
      additionalMonthlyInvestment: "Additional monthly investment needed",
      notNeeded: "No additional monthly investment is indicated",
      assumptionNote: "This compares the withdrawal rate with the return assumption; real investment outcomes can differ.",
    },
    updating: "Updating your plan…",
    error: "The estimate is unavailable right now. Check your inputs and try again.",
    evaluation: {
      title: "Evaluate an investment",
      description: "See what goes in, what may come back each month, and when the original capital may be recovered.",
      planTitle: "Your investment assumptions",
      fields: {
        initialInvestment: "Initial investment",
        additionalCosts: "Additional one-time costs",
        monthlyIncome: "Expected monthly income",
        monthlyExpenses: "Expected monthly expenses",
        investmentMonths: "Investment period",
        exitValue: "Exit / resale value",
        ownershipPercentage: "Ownership percentage",
        taxRate: "Tax on income",
        feesRate: "Fees on income",
        incomeGrowthRate: "Yearly income growth",
        expenseGrowthRate: "Yearly expense growth",
      },
      units: { months: "Months", percent: "%" },
      advancedTitle: "Advanced assumptions",
      advancedOptional: "Optional",
      advancedHint: "Ownership, tax and fees affect monthly income. Income and expenses can change after every 12 months.",
      outcomeTitle: "Investment outlook",
      monthlyNetIncome: "Monthly net income",
      breakEven: "Break-even period",
      totalCapital: "Total capital invested",
      totalProfit: "Estimated total profit",
      roi: "ROI",
      annualizedReturn: "Annualized return",
      exitContribution: "Exit / resale contribution",
      notReached: "Not reached",
      interpretation: (months, income) => `At the current assumptions, you may recover the original capital in about ${months} months and earn around ${income} per month afterward.`,
      incomeGapInsight: "Expected income does not cover the monthly expenses under these assumptions, so a break-even point is not available.",
      periodInsight: "The original capital is not recovered within the selected investment period at these assumptions.",
      assumptionsNote: "This is a planning estimate. Check the income, costs and resale assumptions before deciding.",
      stressTitle: "What if monthly income is 20% lower?",
      stressDescription: "The same assumptions, with expected monthly income reduced by 20%.",
      stressMonthlyIncome: "Revised monthly net income",
      stressBreakEven: "Revised break-even",
      stressTotalProfit: "Revised total profit",
    },
  },
  bn: {
    eyebrow: "Investment planner",
    title: "Investment-এর একটা plan বানান",
    description: "কী বুঝতে চান বেছে নিন, তারপর নিজের amount বসিয়ে সম্ভাব্য outcome দেখুন।",
    modeLegend: "Investment plan-এর ধরন বেছে নিন",
    modes: {
      grow: { label: "আমার টাকা বাড়াতে চাই", description: "সময় গেলে টাকা কোথায় যেতে পারে দেখুন" },
      evaluate: { label: "একটা investment যাচাই করতে চাই", description: "মাসের income, capital recovery আর profit দেখুন" },
    },
    growTitle: "টাকা বাড়ার plan",
    growDescription: "শুরুতে কিছু টাকা আর মাসে মাসে investment—দুটো মিলে সময়ের সাথে কত হতে পারে দেখুন।",
    planTitle: "আপনার plan",
    fields: {
      principal: "এখন হাতে আছে",
      monthlyContribution: "মাসে invest করবেন",
      annualRate: "বছরে সম্ভাব্য return",
      years: "কত বছরের জন্য",
      inflationRate: "বছরে inflation rate",
      withdrawalRate: "বছরে withdrawal rate",
      monthlyIncomeTarget: "মাসে income target",
    },
    units: { percent: "%", years: "বছর", months: "মাস" },
    advancedTitle: "আরও assumption",
    advancedOptional: "ঐচ্ছিক",
    formInsight: "ছোট হলেও নিয়মিত investment করলে compound growth-এর সময়টা একটু বেশি কাজ করতে পারে।",
    outcomeTitle: "সম্ভাব্য outcome",
    futureValue: (years) => `${years} বছর পরে সম্ভাব্য value`,
    todayValue: "আজকের টাকায় value",
    todayValueHelper: (inflationRate) => `বছরে ${inflationRate}% inflation ধরে`,
    totalContribution: "আপনার মোট contribution",
    estimatedGrowth: "সম্ভাব্য growth",
    splitTitle: "Contribution আর growth",
    contribution: "আপনার contribution",
    growth: "সম্ভাব্য growth",
    growthInsight: (growth, percent, growthLeads) =>
      growthLeads
        ? `প্রায় ${growth} (${percent}%) আসতে পারে growth থেকে—আপনার contribution-এর চেয়েও একটু বেশি।`
        : `প্রায় ${growth} (${percent}%) আসতে পারে growth থেকে; এখনো আপনার contribution-ই বড় অংশ।`,
    scenarioTitle: "মাসে আরেকটু দিলে কী বদলাবে?",
    scenarioDescription: (amount) => `মাসে ${amount} বেশি invest করুন`,
    newMonthlyContribution: "নতুন monthly investment",
    newFutureValue: "নতুন future value",
    additionalGain: "বাড়তি gain",
    incomePotential: {
      title: "এই future amount থেকে income আসতে পারে?",
      description: "Withdrawal rate ধরে income potential দেখুন। এটা নিশ্চিত income-এর কথা নয়।",
      sourceLegend: "কোন প্রশ্নের উত্তর চান",
      fromCapital: "আমার projected capital থেকে",
      incomeTarget: "আমার মাসের income target আছে",
      monthlyIncome: "সম্ভাব্য মাসের income",
      annualIncome: "বছরের income",
      monthlyIncomeTodayValue: "আজকের টাকায় মাসের income",
      capitalOutlook: "এই rate-এ capital-এর দিক",
      outlook: {
        growing: "Projected capital বাড়তে থাকতে পারে",
        stable: "Projected capital মোটামুটি একই থাকতে পারে",
        declining: "Projected capital সময়ের সাথে কমতে পারে",
      },
      requiredCapital: "কত capital লাগবে",
      capitalGap: "Projected capital থেকে gap",
      additionalMonthlyInvestment: "মাসে আরও invest করতে হতে পারে",
      notNeeded: "এখন বাড়তি monthly investment লাগছে না",
      assumptionNote: "Withdrawal rate আর return assumption মিলিয়ে দেখা হয়েছে; বাস্তব outcome আলাদা হতে পারে।",
    },
    updating: "Plan-এর হিসাব update হচ্ছে…",
    error: "এখন হিসাবটা পাওয়া যাচ্ছে না। Input দেখে আবার চেষ্টা করুন।",
    evaluation: {
      title: "একটা investment যাচাই করুন",
      description: "কত টাকা যাবে, মাসে কী আসতে পারে আর আসল capital কবে উঠতে পারে—একসাথে দেখুন।",
      planTitle: "আপনার investment-এর assumption",
      fields: {
        initialInvestment: "শুরুতে invest করবেন",
        additionalCosts: "আরও একবারের খরচ",
        monthlyIncome: "মাসে সম্ভাব্য income",
        monthlyExpenses: "মাসে সম্ভাব্য খরচ",
        investmentMonths: "কত মাসের জন্য",
        exitValue: "বের হলে / resale value",
        ownershipPercentage: "আপনার ownership",
        taxRate: "Income-এর tax",
        feesRate: "Income-এর fee",
        incomeGrowthRate: "বছরে income growth",
        expenseGrowthRate: "বছরে expense growth",
      },
      units: { months: "মাস", percent: "%" },
      advancedTitle: "আরও assumption",
      advancedOptional: "ঐচ্ছিক",
      advancedHint: "Ownership, tax আর fee মাসের income বদলায়। প্রতি 12 মাস পর income আর expense growth ধরা হবে।",
      outcomeTitle: "Investment-এর সম্ভাব্য চিত্র",
      monthlyNetIncome: "মাসের net income",
      breakEven: "Break-even period",
      totalCapital: "মোট capital invested",
      totalProfit: "সম্ভাব্য মোট profit",
      roi: "ROI",
      annualizedReturn: "বছর হিসেবে return",
      exitContribution: "Exit / resale contribution",
      notReached: "এখনো উঠবে না",
      interpretation: (months, income) => `এই assumption-এ প্রায় ${months} মাসে আসল capital উঠতে পারে, এরপর মাসে প্রায় ${income} আসতে পারে।`,
      incomeGapInsight: "এই assumption-এ সম্ভাব্য income মাসের খরচ ঢাকছে না, তাই break-even দেখানো যাচ্ছে না।",
      periodInsight: "বাছা সময়ের মধ্যে আসল capital উঠে আসছে না।",
      assumptionsNote: "এটা plan করার estimate। সিদ্ধান্তের আগে income, খরচ আর resale value আবার মিলিয়ে নিন।",
      stressTitle: "মাসের income 20% কম হলে কী হবে?",
      stressDescription: "একই assumption, শুধু মাসের সম্ভাব্য income 20% কম ধরা হয়েছে।",
      stressMonthlyIncome: "নতুন মাসের net income",
      stressBreakEven: "নতুন break-even",
      stressTotalProfit: "নতুন মোট profit",
    },
  },
} as const satisfies Record<AppLocale, InvestmentPlannerLanguage>;

export function getInvestmentPlannerLanguage(
  locale: AppLocale = DEFAULT_LOCALE,
): InvestmentPlannerLanguage {
  return language[locale] ?? language[DEFAULT_LOCALE];
}
