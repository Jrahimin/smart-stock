import type {
  WealthComparisonCardModel,
  WealthComparisonSlug,
  WealthIntentHref,
  WealthScenarioLauncher,
  WealthToolSlug,
} from "@/features/wealth/types/wealth-types";

export const WEALTH_INTENT_OPTIONS = [
  { href: "/wealth/tools/tax-planner" },
  { href: "/wealth/tools/dps" },
  { href: "/wealth/tools/fdr" },
  { href: "/wealth/tools/sanchayapatra" },
  { href: "/wealth/tools/compound-growth" },
  { href: "/wealth/tools/emi" },
  { href: "/wealth/tools/zakat" },
  { href: "/wealth/tools/retirement" },
] as const satisfies ReadonlyArray<{ href: WealthIntentHref }>;

export const WEALTH_CALCULATOR_NAV_ITEMS = [
  { label: "FDR", href: "/wealth/tools/fdr", icon: "🏦" },
  { label: "DPS", href: "/wealth/tools/dps", icon: "📅" },
  { label: "Sanchayapatra", href: "/wealth/tools/sanchayapatra", icon: "🇧🇩" },
  { label: "Zakat", href: "/wealth/tools/zakat", icon: "🤲" },
  { label: "Loan / EMI", href: "/wealth/tools/emi", icon: "💳" },
  { label: "Invest", href: "/wealth/tools/compound-growth", icon: "📈" },
  { label: "Retirement", href: "/wealth/tools/retirement", icon: "🌅" },
  { label: "Savings goal", href: "/wealth/tools/savings-goal", icon: "🎯" },
  { label: "CAGR", href: "/wealth/tools/cagr", icon: "📊" },
] as const;

export const WEALTH_SCENARIO_LAUNCHERS: WealthScenarioLauncher[] = [
  {
    id: "tax-planning",
    href: "/wealth/tools/tax-planner",
    cue: "planning",
    productLabel: "Tax Planner",
  },
  {
    id: "extra-savings",
    href: "/wealth/tools/fdr",
    cue: "steady",
    productLabel: "FDR",
  },
  {
    id: "passive-income",
    href: "/wealth/tools/sanchayapatra",
    cue: "income",
    productLabel: "Sanchayapatra",
  },
  {
    id: "retire-earlier",
    href: "/wealth/tools/retirement",
    cue: "habit",
    productLabel: "DPS",
  },
  {
    id: "loan",
    href: "/wealth/tools/emi",
    cue: "loan",
    productLabel: "Loan",
  },
  {
    id: "zakat",
    href: "/wealth/tools/zakat",
    cue: "care",
    productLabel: "Zakat",
  },
  {
    id: "compare",
    href: "/wealth/compare/dps-vs-fdr",
    cue: "choice",
    productLabel: "DPS vs FDR",
  },
  {
    id: "inflation",
    href: "/wealth/compare/inflation-impact",
    cue: "real",
    productLabel: "Inflation",
  },
];

/** Bangladesh-oriented default rates (user can override in each tool). */
export const WEALTH_DEFAULT_RATES = {
  fdr: "9",
  dps: "8",
  invest: "12",
  loan: "12",
  inflation: "8",
  sanchayapatra: "10.54",
} as const;

export const WEALTH_COMPARISON_CARDS: WealthComparisonCardModel[] = [
  {
    slug: "dps-vs-fdr",
    title: "Two paths. Different futures.",
    description: "One path rewards consistency. One path rewards certainty. Visit your future and see where each decision leads.",
    cue: "Recommended first",
    accent: "steady",
  },
  {
    slug: "fdr-vs-stocks",
    title: "Steady deposit or market growth?",
    description: "Compare predictability with the patience needed for investing.",
    cue: "Growth path",
    accent: "growth",
  },
  {
    slug: "save-vs-spend",
    title: "Enjoy today or keep future options?",
    description: "See the quiet opportunity cost behind a spending choice.",
    cue: "Life choice",
    accent: "choice",
  },
  {
    slug: "loan-prepayment-vs-investing",
    title: "Clear debt or invest instead?",
    description: "Compare the comfort of certainty with possible upside.",
    cue: "Debt decision",
    accent: "debt",
  },
  {
    slug: "inflation-impact",
    title: "Headline money or real value?",
    description: "See how inflation quietly changes what money feels like.",
    cue: "Reality check",
    accent: "inflation",
  },
];

export const WEALTH_COMPARISON_STORIES: Record<
  WealthComparisonSlug,
  {
    leftIdentity: string;
    leftStrengths: string[];
    leftTitle: string;
    rightIdentity: string;
    rightStrengths: string[];
    rightSubtitle: string;
    rightTitle: string;
    leftSubtitle: string;
    fieldLabels: Record<string, string>;
  }
> = {
  "dps-vs-fdr": {
    leftTitle: "Monthly Saver",
    rightTitle: "Lump Sum Investor",
    leftSubtitle: "A habit-led path built month by month.",
    rightSubtitle: "A steadier path when money is already available.",
    leftIdentity: "Building wealth gradually through consistency.",
    rightIdentity: "Growing existing capital with predictable returns.",
    leftStrengths: ["Flexible contributions", "Habit building", "Accessible for most people"],
    rightStrengths: ["High certainty", "Predictable outcome", "Immediate capital deployment"],
    fieldLabels: {
      monthly_payment: "Monthly DPS saving",
      annual_rate: "DPS interest rate (%)",
      principal: "FDR amount to lock",
      years: "Time horizon",
    },
  },
  "fdr-vs-stocks": {
    leftTitle: "Stability Seeker",
    rightTitle: "Market Builder",
    leftSubtitle: "Prefers predictability and a known rate.",
    rightSubtitle: "Accepts uncertainty for possible long-term growth.",
    leftIdentity: "Protecting capital with a calmer, known path.",
    rightIdentity: "Accepting volatility for long-term growth potential.",
    leftStrengths: ["Predictable returns", "Lower daily stress", "Clear maturity outcome"],
    rightStrengths: ["Higher growth potential", "Keeps capital working", "Useful for long horizons"],
    fieldLabels: {
      principal: "Starting amount",
      annual_rate: "Interest / return (%)",
      years: "Time horizon",
    },
  },
  "save-vs-spend": {
    leftTitle: "Future Option Keeper",
    rightTitle: "Today Enjoyer",
    leftSubtitle: "Keeps money working for later flexibility.",
    rightSubtitle: "Chooses the benefit of using money now.",
    leftIdentity: "Trading present comfort for future optionality.",
    rightIdentity: "Choosing immediate value over future growth.",
    leftStrengths: ["Future flexibility", "Compounding potential", "Emergency buffer"],
    rightStrengths: ["Immediate enjoyment", "No ongoing discipline", "Clear present benefit"],
    fieldLabels: {
      amount: "Decision amount",
      years: "Time horizon",
    },
  },
  "loan-prepayment-vs-investing": {
    leftTitle: "Debt Lightener",
    rightTitle: "Opportunity Investor",
    leftSubtitle: "Turns cash into lower interest pressure.",
    rightSubtitle: "Keeps cash aimed at possible growth.",
    leftIdentity: "Buying peace of mind by reducing debt pressure.",
    rightIdentity: "Keeping cash aimed at possible upside instead.",
    leftStrengths: ["Guaranteed interest saved", "Lower monthly pressure", "Psychological relief"],
    rightStrengths: ["Potential upside", "Keeps liquidity invested", "Useful when returns exceed loan cost"],
    fieldLabels: {
      extra_amount: "Extra amount",
      loan_rate: "Loan rate (%)",
      annual_rate: "Expected investment return (%)",
      years: "Time horizon",
    },
  },
  "inflation-impact": {
    leftTitle: "Headline Value",
    rightTitle: "Real-World Value",
    leftSubtitle: "The number you see on paper.",
    rightSubtitle: "What that number may feel like after prices rise.",
    leftIdentity: "The balance your statement shows today.",
    rightIdentity: "What that money may actually feel like later.",
    leftStrengths: ["Easy to track", "Motivating headline", "Useful for planning targets"],
    rightStrengths: ["More honest planning", "Better lifestyle comparison", "Future-aware decisions"],
    fieldLabels: {
      amount: "Amount",
      years: "Time horizon",
    },
  },
};

export const WEALTH_TOOL_DETAILS_DEFAULTS = {
  title: "Better forecasts",
  hint: "Optional — sharpen timelines, purchasing power, and Snapshot.",
} as const;

export const WEALTH_TOOL_CONFIG: Record<
  WealthToolSlug,
  {
    title: string;
    prompt: string;
    detailsTitle?: string;
    detailsHint?: string;
    includeInflationAssumption?: boolean;
    fields: Array<{
      key: string;
      label: string;
      type?: "number" | "date" | "select" | "text";
      defaultValue?: string;
      optional?: boolean;
      group?: "tenure" | "details";
      options?: Array<{ value: string; label: string }>;
    }>;
  }
> = {
  "tax-planner": {
    title: "Tax Planner",
    prompt: "Estimate yearly tax and explore how tax saving investments may affect it.",
    fields: [],
  },
  fdr: {
    title: "FDR — lock money",
    prompt: "What could a lump-sum FDR grow into, and how much flexibility would you trade for it?",
    detailsHint: "Profit payout style and inflation shape how returns feel over time.",
    includeInflationAssumption: true,
    fields: [
      { key: "principal", label: "Deposit amount", defaultValue: "500000" },
      { key: "annual_rate", label: "FDR interest rate (%)", defaultValue: WEALTH_DEFAULT_RATES.fdr },
      { key: "tenure_value", label: "Duration", defaultValue: "3", group: "tenure" },
      {
        key: "tenure_unit",
        label: "Duration unit",
        type: "select",
        defaultValue: "years",
        group: "tenure",
        options: [
          { value: "months", label: "Months" },
          { value: "quarters", label: "Quarters" },
          { value: "years", label: "Years" },
        ],
      },
      {
        key: "profit_distribution_type",
        label: "Profit sharing",
        type: "select",
        defaultValue: "maturity",
        group: "details",
        options: [
          { value: "maturity", label: "Compound at maturity" },
          { value: "monthly", label: "Monthly profit payout" },
          { value: "quarterly", label: "Quarterly profit payout" },
          { value: "yearly", label: "Yearly profit payout" },
        ],
      },
    ],
  },
  dps: {
    title: "DPS — save monthly",
    prompt: "What happens if you keep saving every month into a DPS-style plan?",
    includeInflationAssumption: true,
    fields: [
      { key: "monthly_payment", label: "Monthly savings", defaultValue: "10000" },
      { key: "annual_rate", label: "DPS interest rate (%)", defaultValue: WEALTH_DEFAULT_RATES.dps },
      { key: "tenure_value", label: "Duration", defaultValue: "5", group: "tenure" },
      {
        key: "tenure_unit",
        label: "Duration unit",
        type: "select",
        defaultValue: "years",
        group: "tenure",
        options: [
          { value: "months", label: "Months" },
          { value: "quarters", label: "Quarters" },
          { value: "years", label: "Years" },
        ],
      },
    ],
  },
  sanchayapatra: {
    title: "Government Savings Planner",
    prompt: "Turn today's savings into years of predictable family income.",
    fields: [
      {
        key: "certificate_type",
        label: "Certificate type",
        type: "select",
        defaultValue: "family-savings",
        options: [
          { value: "family-savings", label: "Family Savings Certificate" },
          { value: "five-year-bangladesh", label: "5-Year Bangladesh Savings Certificate" },
          { value: "pensioner-savings", label: "Pensioner Savings Certificate" },
          { value: "three-month-profit", label: "3-Month Profit Based Savings Certificate" },
        ],
      },
      { key: "principal", label: "Investment amount", defaultValue: "1000000" },
      { key: "purchase_date", label: "Purchase date", type: "date", optional: true },
      {
        key: "annual_rate",
        label: "Interest rate override (%)",
        defaultValue: WEALTH_DEFAULT_RATES.sanchayapatra,
        optional: true,
      },
      {
        key: "profit_distribution_type",
        label: "Profit distribution",
        type: "select",
        defaultValue: "configured",
        optional: true,
        options: [
          { value: "configured", label: "Use certificate default" },
          { value: "monthly", label: "Monthly" },
          { value: "quarterly", label: "Quarterly" },
          { value: "yearly", label: "Yearly" },
          { value: "maturity", label: "At maturity" },
        ],
      },
      { key: "notes", label: "Optional notes", type: "text", optional: true },
    ],
  },
  "compound-growth": {
    title: "What could my money become?",
    prompt: "Explore long-term growth with patience and consistency.",
    includeInflationAssumption: true,
    fields: [
      { key: "principal", label: "Starting with", defaultValue: "100000" },
      { key: "monthly_contribution", label: "Monthly saving", defaultValue: "5000" },
      { key: "annual_rate", label: "Expected return (%)", defaultValue: WEALTH_DEFAULT_RATES.invest },
      { key: "tenure_value", label: "Time horizon", defaultValue: "10", group: "tenure" },
      {
        key: "tenure_unit",
        label: "Duration unit",
        type: "select",
        defaultValue: "years",
        group: "tenure",
        options: [
          { value: "months", label: "Months" },
          { value: "quarters", label: "Quarters" },
          { value: "years", label: "Years" },
        ],
      },
    ],
  },
  emi: {
    title: "Loan / EMI",
    prompt: "What might this loan ask from your monthly life?",
    detailsHint: "Add a start date or repayments made so far to unlock payoff timelines and progress.",
    includeInflationAssumption: true,
    fields: [
      { key: "principal", label: "Loan amount", defaultValue: "1000000" },
      { key: "annual_rate", label: "Loan interest rate (%)", defaultValue: WEALTH_DEFAULT_RATES.loan },
      { key: "tenure_months", label: "Tenure (months)", defaultValue: "60" },
      { key: "loan_start_date", label: "Loan start date", type: "date", group: "details", optional: true },
      { key: "amount_repaid", label: "Amount repaid so far", group: "details", optional: true },
    ],
  },
  cagr: {
    title: "Understand past growth",
    prompt: "What average growth rate connects these two values?",
    fields: [
      { key: "beginning_value", label: "Starting value", defaultValue: "100000" },
      { key: "ending_value", label: "Ending value", defaultValue: "180000" },
      { key: "years", label: "Years", defaultValue: "5" },
    ],
  },
  zakat: {
    title: "Zakat estimate",
    prompt: "A calm educational estimate of eligible wealth. Zakat is applied at 2.5% when wealth is above nisab.",
    detailsTitle: "Threshold assumptions",
    detailsHint: "Adjust nisab only if you follow a different scholarly reference for your context.",
    fields: [
      { key: "cash", label: "Cash & savings", defaultValue: "200000" },
      { key: "gold", label: "Gold value", defaultValue: "150000" },
      { key: "investments", label: "Investments", defaultValue: "300000" },
      { key: "receivables", label: "Receivables", defaultValue: "0" },
      { key: "liabilities", label: "Liabilities", defaultValue: "0" },
      { key: "nisab_amount", label: "Nisab threshold", group: "details", optional: true },
    ],
  },
  retirement: {
    title: "Retirement goal",
    prompt: "How close could you be to your future goal?",
    includeInflationAssumption: true,
    fields: [
      { key: "target_amount", label: "Goal amount", defaultValue: "5000000" },
      { key: "current_amount", label: "Already saved", defaultValue: "500000" },
      { key: "monthly_contribution", label: "Monthly savings", defaultValue: "15000" },
      { key: "annual_rate", label: "Expected return (%)", defaultValue: WEALTH_DEFAULT_RATES.invest },
      { key: "tenure_value", label: "Duration", defaultValue: "15", group: "tenure" },
      {
        key: "tenure_unit",
        label: "Duration unit",
        type: "select",
        defaultValue: "years",
        group: "tenure",
        options: [
          { value: "months", label: "Months" },
          { value: "quarters", label: "Quarters" },
          { value: "years", label: "Years" },
        ],
      },
    ],
  },
  "savings-goal": {
    title: "How close am I?",
    prompt: "See how today's savings move toward your target.",
    includeInflationAssumption: true,
    fields: [
      { key: "target_amount", label: "Goal", defaultValue: "1000000" },
      { key: "current_amount", label: "Saved", defaultValue: "100000" },
      { key: "monthly_contribution", label: "Monthly saving", defaultValue: "10000" },
      { key: "annual_rate", label: "Expected return (%)", defaultValue: WEALTH_DEFAULT_RATES.invest },
      { key: "tenure_value", label: "Time horizon", defaultValue: "5", group: "tenure" },
      {
        key: "tenure_unit",
        label: "Duration unit",
        type: "select",
        defaultValue: "years",
        group: "tenure",
        options: [
          { value: "months", label: "Months" },
          { value: "quarters", label: "Quarters" },
          { value: "years", label: "Years" },
        ],
      },
    ],
  },
};

export const WEALTH_COMPARISON_DEFAULTS: Record<WealthComparisonSlug, { left: Record<string, string>; right: Record<string, string> }> = {
  "dps-vs-fdr": {
    left: { monthly_payment: "10000", annual_rate: WEALTH_DEFAULT_RATES.fdr, years: "5" },
    right: { principal: "600000", annual_rate: WEALTH_DEFAULT_RATES.fdr, years: "5" },
  },
  "fdr-vs-stocks": {
    left: { principal: "500000", annual_rate: WEALTH_DEFAULT_RATES.fdr, years: "5" },
    right: { principal: "500000", annual_rate: WEALTH_DEFAULT_RATES.invest, years: "5" },
  },
  "save-vs-spend": {
    left: { amount: "50000", years: "3" },
    right: { amount: "50000", years: "3" },
  },
  "loan-prepayment-vs-investing": {
    left: { extra_amount: "100000", loan_rate: WEALTH_DEFAULT_RATES.loan, years: "5" },
    right: { extra_amount: "100000", annual_rate: WEALTH_DEFAULT_RATES.invest, years: "5" },
  },
  "inflation-impact": {
    left: { amount: "1000000", years: "10" },
    right: { amount: "1000000", years: "10" },
  },
};
