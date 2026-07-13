export type WealthToolSlug =
  | "fdr"
  | "dps"
  | "sanchayapatra"
  | "compound-growth"
  | "emi"
  | "cagr"
  | "zakat"
  | "retirement"
  | "savings-goal"
  | "tax-planner";

export type WealthComparisonSlug =
  | "dps-vs-fdr"
  | "fdr-vs-stocks"
  | "save-vs-spend"
  | "loan-prepayment-vs-investing"
  | "inflation-impact";

export type WealthInsightSeverity = "INFO" | "POSITIVE" | "WARNING" | "NEUTRAL";

export type WealthScenarioId =
  | "tax-planning"
  | "extra-savings"
  | "passive-income"
  | "retire-earlier"
  | "loan"
  | "zakat"
  | "compare"
  | "inflation";

export type WealthIntentHref =
  | "/wealth/tools/tax-planner"
  | "/wealth/tools/dps"
  | "/wealth/tools/fdr"
  | "/wealth/tools/sanchayapatra"
  | "/wealth/tools/compound-growth"
  | "/wealth/tools/emi"
  | "/wealth/tools/zakat"
  | "/wealth/tools/retirement";

export type WealthInsightCard = {
  id: string;
  title: string;
  body: string;
  severity: WealthInsightSeverity;
  action_label?: string | null;
  action_href?: string | null;
};

export type WealthTimelinePoint = {
  label: string;
  value: string | number;
  real_value?: string | number | null;
};

export type WealthToolCalculateResponse = {
  tool_slug: string;
  headline_value: string | number;
  headline_label: string;
  summary: string;
  metrics: Array<{ label: string; value: string | number | null }>;
  timeline: WealthTimelinePoint[];
  insights: WealthInsightCard[];
  next_steps: Array<{ label: string; href: string }>;
  assumptions_used: Record<string, unknown>;
  disclaimer: string;
};

export type WealthComparisonOptionResult = {
  key: string;
  label: string;
  final_value: string | number;
  real_value?: string | number | null;
  liquidity_note: string;
  behavior_note: string;
  risk_note: string;
};

export type WealthComparisonEvaluateResponse = {
  comparison_slug: string;
  title: string;
  summary: string;
  left: WealthComparisonOptionResult;
  right: WealthComparisonOptionResult;
  difference_value: string | number;
  difference_percent?: string | number | null;
  insights: WealthInsightCard[];
  next_steps: Array<{ label: string; href: string }>;
  disclaimer: string;
};

export type WealthSeasonalContext = {
  season_key: string;
  title: string;
  description: string;
  featured_tool_slug?: string | null;
  featured_comparison_slug?: string | null;
  cta_label: string;
  cta_href: string;
};

export type MoneySnapshotAsset = {
  id: string;
  category: string;
  label: string;
  value: string | number;
  currency: string;
  liquidity_tier: string;
  metadata_json?: Record<string, unknown>;
};

export type MoneySnapshotLiability = {
  id: string;
  category: string;
  label: string;
  balance: string | number;
  interest_rate?: string | number | null;
  monthly_emi?: string | number | null;
  remaining_months?: number | null;
  metadata_json?: Record<string, unknown>;
};

export type MoneySnapshot = {
  id: string;
  country_code: string;
  currency: string;
  monthly_savings?: string | number | null;
  primary_goal?: string | null;
  assets: MoneySnapshotAsset[];
  liabilities: MoneySnapshotLiability[];
};

export type WealthDashboard = {
  net_worth: string | number;
  total_assets: string | number;
  total_liabilities: string | number;
  monthly_savings?: string | number | null;
  passive_income_estimate?: string | number | null;
  clarity_score: number;
  asset_mix: Array<{ category: string; value: string | number }>;
  goals: Array<Record<string, unknown>>;
  saved_scenarios: Array<Record<string, unknown>>;
  insights: WealthInsightCard[];
};

export type WealthScenarioLauncher = {
  id: WealthScenarioId;
  href: string;
  cue: string;
  productLabel?: string;
};

export type WealthComparisonCardModel = {
  slug: WealthComparisonSlug;
  title: string;
  description: string;
  cue: string;
  accent: "steady" | "growth" | "choice" | "debt" | "inflation";
};

export type LocalMoneySnapshotDraft = {
  monthly_savings?: number;
  assets: Array<{ category: string; label: string; value: number; metadata?: Record<string, unknown> }>;
  liabilities: Array<{
    category: string;
    label: string;
    balance: number;
    interest_rate?: number;
    monthly_emi?: number;
    remaining_months?: number;
    metadata?: Record<string, unknown>;
  }>;
  savedScenarioTitles: string[];
};
