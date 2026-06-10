import { WEALTH_DEFAULT_RATES } from "@/features/wealth/catalog/wealth-catalog";
import {
  futureValueAnnuity,
  inflationAdjustedValue,
  lumpSumGrowth,
  yearsFromMonths,
} from "@/features/wealth/lib/wealth-comparison-math";
import type {
  WealthComparisonEvaluateResponse,
  WealthComparisonSlug,
  WealthInsightCard,
} from "@/features/wealth/types/wealth-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

export type ComparisonScenarioState = {
  assumptions: Record<string, unknown>;
  horizonMonths: number;
  leftInputs: Record<string, string>;
  rightInputs: Record<string, string>;
};

export type ComparisonScenarioChip = {
  description: string;
  id: string;
  label: string;
};

export type ComparisonNarrativeBeat = {
  detail: string;
  headline: string;
  id: string;
  isFuture?: boolean;
  isHere?: boolean;
  when: string;
};

export type ComparisonHorizonSnapshot = {
  activeStopId: string;
  favoredKey: "left" | "right" | "tie";
  hasPassedTurningPoint: boolean;
  horizonYears: number;
  leadAmount: number;
  leaderLabel: string;
  leftValue: number;
  narrativeLine: string;
  rightValue: number;
  trailerLabel: string;
};

export type ComparisonMilestone = {
  leftValue: number;
  rightValue: number;
  year: number;
};

export type ComparisonPurchasingPower = {
  finalValue: number;
  inflationImpact: number;
  realValue: number;
};

export type ComparisonChartAnnotation = {
  highlight?: boolean;
  id: string;
  label: string;
  x: number;
  y: number;
  year: number;
};

export type ComparisonChartModel = {
  annotations: ComparisonChartAnnotation[];
  height: number;
  leftLabel: string;
  leftPath: string;
  maxValue: number;
  padding: number;
  points: Array<{ leftValue: number; rightValue: number; x: number; year: number; yLeft: number; yRight: number }>;
  rightLabel: string;
  rightPath: string;
  turningPointYear: number | null;
  width: number;
};

export type ComparisonChartExplanation = {
  body: string;
  title: string;
};

export type UnifiedJourneyStop = {
  extendsScenario?: boolean;
  id: string;
  isTurning?: boolean;
  label: string;
  months: number;
  storyBody: string;
  storyTitle: string;
  year: number;
};

export type JourneyMoment = {
  storyBody: string;
  storyTitle: string;
  summaryLine: string;
  visitHeadline: string;
};

export type JourneyHappyPath = {
  actionLabel: string;
  extendsScenario?: boolean;
  prompt: string;
  targetMonths: number;
};

export type JourneyShortcut = {
  extendsScenario?: boolean;
  id: string;
  label: string;
  months: number;
};

export const COMPARISON_YEARS_BEFORE_RETIREMENT = [10, 5, 3, 1] as const;

export type ComparisonPresentation = {
  catchUpYears: number | null;
  chart: ComparisonChartModel;
  chartExplanation: ComparisonChartExplanation;
  contextualInsights: WealthInsightCard[];
  favoredKey: "left" | "right" | "tie";
  happyPath: JourneyHappyPath | null;
  horizonSnapshot: ComparisonHorizonSnapshot;
  humanOutcome: string;
  journeyMilestones: ComparisonMilestone[];
  journeyMoment: JourneyMoment;
  journeyRoute: JourneyRouteStop[];
  leadAmount: number;
  leaderLabel: string;
  narrativeBeats: ComparisonNarrativeBeat[];
  purchasingPower: {
    left: ComparisonPurchasingPower;
    right: ComparisonPurchasingPower;
  };
  turningPointYear: number | null;
  trailerLabel: string;
  unifiedJourneyStops: UnifiedJourneyStop[];
};

export type JourneyRouteStop = {
  detail: string;
  highlight?: boolean;
  id: string;
  title: string;
  year: number;
  yearLabel: string;
};

export const COMPARISON_MAX_MONTHS = 240;

export const COMPARISON_HORIZON_CHIPS = [
  { label: "Today", months: 0 },
  { label: "1Y", months: 12 },
  { label: "3Y", months: 36 },
  { label: "5Y", months: 60 },
  { label: "10Y", months: 120 },
  { label: "Retirement", months: COMPARISON_MAX_MONTHS },
] as const;

export const COMPARISON_SCENARIO_HORIZON_OPTIONS = [
  { label: "1 Year", months: 12 },
  { label: "3 Years", months: 36 },
  { label: "5 Years", months: 60 },
  { label: "10 Years", months: 120 },
  { label: "Retirement", months: COMPARISON_MAX_MONTHS },
] as const;

export const COMPARISON_SCENARIO_CHIPS: ComparisonScenarioChip[] = [
  { id: "rate-up", label: "Higher Rates", description: "Explore a future where returns rise 1%." },
  { id: "rate-down", label: "Conservative Future", description: "See what happens if rates fall 1%." },
  { id: "inflation-up", label: "Higher Inflation", description: "Prices rise faster — purchasing power shifts." },
  { id: "save-more", label: "Save More", description: "What if you commit 20% more each month?" },
  { id: "extend", label: "Retire Earlier", description: "Stretch the journey five years further." },
];

export function parseHorizonMonths(leftInputs: Record<string, string>, rightInputs: Record<string, string>) {
  const years = Number(leftInputs.years ?? rightInputs.years ?? "5");
  return Math.max(0, Math.round(years * 12));
}

export function syncHorizonToInputs(
  leftInputs: Record<string, string>,
  rightInputs: Record<string, string>,
  horizonMonths: number,
) {
  const years = String(Math.round((horizonMonths / 12) * 100) / 100);
  return {
    left: { ...leftInputs, ...(leftInputs.years != null ? { years } : {}) },
    right: { ...rightInputs, ...(rightInputs.years != null ? { years } : {}) },
  };
}

export function applyComparisonScenarioChip(state: ComparisonScenarioState, chipId: string): ComparisonScenarioState {
  const inflation = Number(state.assumptions.inflation_rate ?? WEALTH_DEFAULT_RATES.inflation);

  if (chipId === "rate-up") {
    return {
      ...state,
      leftInputs: bumpRateFields(state.leftInputs, 1),
      rightInputs: bumpRateFields(state.rightInputs, 1),
    };
  }

  if (chipId === "rate-down") {
    return {
      ...state,
      leftInputs: bumpRateFields(state.leftInputs, -1),
      rightInputs: bumpRateFields(state.rightInputs, -1),
    };
  }

  if (chipId === "inflation-up") {
    return {
      ...state,
      assumptions: { ...state.assumptions, inflation_rate: Math.min(20, inflation + 2) },
    };
  }

  if (chipId === "inflation-down") {
    return {
      ...state,
      assumptions: { ...state.assumptions, inflation_rate: Math.max(2, inflation - 2) },
    };
  }

  if (chipId === "extend") {
    const horizonMonths = Math.min(COMPARISON_MAX_MONTHS, state.horizonMonths + 60);
    const synced = syncHorizonToInputs(state.leftInputs, state.rightInputs, horizonMonths);
    return { ...state, ...synced, horizonMonths };
  }

  if (chipId === "save-more") {
    return {
      ...state,
      leftInputs: bumpMonthlyPayment(state.leftInputs, 1.2),
    };
  }

  return state;
}

export function buildComparisonPresentation(
  comparisonSlug: WealthComparisonSlug,
  result: WealthComparisonEvaluateResponse,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  assumptions: Record<string, unknown>,
  scenarioMonths: number,
  viewMonths: number = scenarioMonths,
): ComparisonPresentation {
  const leftValue = Number(result.left.final_value);
  const rightValue = Number(result.right.final_value);
  const difference = Number(result.difference_value);
  const scenarioYears = yearsFromMonths(scenarioMonths);
  const viewYears = yearsFromMonths(viewMonths);
  const inflationRate = Number(assumptions.inflation_rate ?? WEALTH_DEFAULT_RATES.inflation);
  const maxValue = Math.max(leftValue, rightValue, 1);
  const favoredKey = Math.abs(difference) < maxValue * 0.02 ? "tie" : difference >= 0 ? "left" : "right";
  const turningPointYear =
    comparisonSlug === "dps-vs-fdr" ? findTurningPointYear(leftInputs, rightInputs) : null;
  const catchUpYears = turningPointYear != null ? Math.ceil(turningPointYear) : null;
  const leader = favoredKey === "left" ? result.left : favoredKey === "right" ? result.right : result.left;
  const trailer = favoredKey === "left" ? result.right : favoredKey === "right" ? result.left : result.right;

  const journeyRoute = buildJourneyRoute(
    comparisonSlug,
    result,
    leftInputs,
    rightInputs,
    scenarioYears,
    turningPointYear,
    favoredKey,
    Math.abs(difference),
  );
  const unifiedJourneyStops = buildUnifiedJourneyStops(
    scenarioMonths,
    turningPointYear,
    result.left.label,
    result.right.label,
  );
  const horizonSnapshot = buildHorizonSnapshot(
    comparisonSlug,
    result,
    leftInputs,
    rightInputs,
    viewMonths,
    turningPointYear,
    unifiedJourneyStops,
  );
  const activeStop =
    unifiedJourneyStops.find((stop) => stop.id === horizonSnapshot.activeStopId) ?? unifiedJourneyStops[0];
  const journeyMoment = buildJourneyMoment(
    horizonSnapshot,
    activeStop,
    scenarioMonths,
    result.left.label,
    result.right.label,
  );

  return {
    catchUpYears,
    chart: buildComparisonChart(comparisonSlug, result, leftInputs, rightInputs, scenarioYears, turningPointYear),
    chartExplanation: buildChartExplanation(
      horizonSnapshot.activeStopId,
      horizonSnapshot,
      result.left.label,
      result.right.label,
      turningPointYear,
      scenarioYears,
    ),
    contextualInsights: buildContextualInsights(
      comparisonSlug,
      result,
      leftInputs,
      rightInputs,
      inflationRate,
      scenarioYears,
      catchUpYears,
      favoredKey,
    ),
    favoredKey,
    happyPath: buildHappyPath(
      horizonSnapshot,
      turningPointYear,
      result.left.label,
      unifiedJourneyStops,
      scenarioMonths,
      viewMonths,
    ),
    horizonSnapshot,
    humanOutcome: buildHumanOutcome(result, favoredKey, catchUpYears),
    journeyMilestones: buildJourneyMilestones(comparisonSlug, leftInputs, rightInputs, scenarioYears),
    journeyRoute,
    leadAmount: Math.abs(difference),
    leaderLabel: favoredKey === "tie" ? "Both paths" : leader.label,
    narrativeBeats: buildNarrativeBeats(result, horizonSnapshot, turningPointYear, scenarioYears),
    purchasingPower: {
      left: buildPurchasingPower(
        leftValue,
        Number(result.left.real_value ?? inflationAdjustedValue(leftValue, inflationRate, scenarioYears)),
        inflationRate,
        scenarioYears,
      ),
      right: buildPurchasingPower(
        rightValue,
        Number(result.right.real_value ?? inflationAdjustedValue(rightValue, inflationRate, scenarioYears)),
        inflationRate,
        scenarioYears,
      ),
    },
    trailerLabel: trailer.label,
    turningPointYear,
    unifiedJourneyStops,
    journeyMoment,
  };
}

const CHART_WIDTH = 920;
const CHART_HEIGHT = 300;
const CHART_PADDING = 36;

function buildComparisonChart(
  comparisonSlug: WealthComparisonSlug,
  result: WealthComparisonEvaluateResponse,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  horizonYears: number,
  turningPointYear: number | null,
): ComparisonChartModel {
  const sampleCount = Math.max(12, Math.min(40, Math.ceil(horizonYears * 4)));
  const points: ComparisonChartModel["points"] = [];

  for (let index = 0; index <= sampleCount; index += 1) {
    const year = (horizonYears * index) / sampleCount;
    const leftValue = previewOptionValue(comparisonSlug, "left", leftInputs, rightInputs, year);
    const rightValue = previewOptionValue(comparisonSlug, "right", leftInputs, rightInputs, year);
    points.push({ year, leftValue, rightValue, x: 0, yLeft: 0, yRight: 0 });
  }

  const maxValue = Math.max(...points.flatMap((point) => [point.leftValue, point.rightValue]), 1);
  const plotWidth = CHART_WIDTH - CHART_PADDING * 2;
  const plotHeight = CHART_HEIGHT - CHART_PADDING * 2;

  for (const point of points) {
    const ratio = horizonYears > 0 ? point.year / horizonYears : 0;
    point.x = CHART_PADDING + ratio * plotWidth;
    point.yLeft = CHART_HEIGHT - CHART_PADDING - (point.leftValue / maxValue) * plotHeight;
    point.yRight = CHART_HEIGHT - CHART_PADDING - (point.rightValue / maxValue) * plotHeight;
  }

  const leftPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.yLeft}`).join(" ");
  const rightPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.yRight}`).join(" ");

  const annotations: ComparisonChartAnnotation[] = [];

  if (turningPointYear != null && horizonYears > 0 && turningPointYear <= horizonYears + 0.1) {
    const turningPoint = points.reduce((closest, point) =>
      Math.abs(point.year - turningPointYear) < Math.abs(closest.year - turningPointYear) ? point : closest,
    );
    annotations.push({
      highlight: true,
      id: "turning-point",
      label: "DPS catches up",
      year: turningPointYear,
      x: turningPoint.x,
      y: Math.min(turningPoint.yLeft, turningPoint.yRight) - 28,
    });
  }

  return {
    annotations,
    height: CHART_HEIGHT,
    leftLabel: result.left.label,
    leftPath,
    maxValue,
    padding: CHART_PADDING,
    points,
    rightLabel: result.right.label,
    rightPath,
    turningPointYear,
    width: CHART_WIDTH,
  };
}

function findTurningPointYear(leftInputs: Record<string, number>, rightInputs: Record<string, number>) {
  const monthly = Number(leftInputs.monthly_payment ?? 0);
  const dpsRate = Number(leftInputs.annual_rate ?? WEALTH_DEFAULT_RATES.dps);
  const principal = Number(rightInputs.principal ?? 0);
  const fdrRate = Number(rightInputs.annual_rate ?? WEALTH_DEFAULT_RATES.fdr);

  for (let month = 1; month <= 360; month += 1) {
    const years = month / 12;
    const dpsValue = futureValueAnnuity(monthly, dpsRate, years);
    const fdrValue = lumpSumGrowth(principal, fdrRate, years);
    if (dpsValue > fdrValue) {
      return Math.round(years * 10) / 10;
    }
  }

  return null;
}

function buildJourneyRoute(
  comparisonSlug: WealthComparisonSlug,
  result: WealthComparisonEvaluateResponse,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  horizonYears: number,
  turningPointYear: number | null,
  favoredKey: "left" | "right" | "tie",
  leadAmount: number,
): JourneyRouteStop[] {
  const stops: JourneyRouteStop[] = [
    {
      detail: "Both futures begin from the choices you make today.",
      id: "start",
      title: "Start",
      year: 0,
      yearLabel: "Today",
    },
  ];

  const yearOneLeft = previewOptionValue(comparisonSlug, "left", leftInputs, rightInputs, 1);
  const yearOneRight = previewOptionValue(comparisonSlug, "right", leftInputs, rightInputs, 1);
  if (horizonYears >= 1) {
    stops.push({
      detail:
        yearOneRight > yearOneLeft
          ? `${result.right.label} leads early with existing capital working immediately.`
          : `${result.left.label} starts building rhythm from month one.`,
      id: "year-1",
      title: yearOneRight > yearOneLeft ? "FDR leads" : "DPS builds",
      year: 1,
      yearLabel: "Year 1",
    });
  }

  if (horizonYears >= 3) {
    const yearThreeLeft = previewOptionValue(comparisonSlug, "left", leftInputs, rightInputs, 3);
    const yearThreeRight = previewOptionValue(comparisonSlug, "right", leftInputs, rightInputs, 3);
    const gapAtOne = Math.abs(yearOneLeft - yearOneRight);
    const gapAtThree = Math.abs(yearThreeLeft - yearThreeRight);
    stops.push({
      detail:
        gapAtThree < gapAtOne
          ? "The distance between paths begins to close."
          : "One path keeps its early advantage.",
      id: "year-3",
      title: gapAtThree < gapAtOne ? "Gap shrinking" : "Gap holds",
      year: 3,
      yearLabel: "Year 3",
    });
  }

  if (turningPointYear != null) {
    stops.push({
      detail: `${result.left.label} overtakes ${result.right.label} after about ${formatJourneyYear(turningPointYear)}.`,
      highlight: true,
      id: "turning-point",
      title: "Turning point",
      year: turningPointYear,
      yearLabel: formatJourneyYear(turningPointYear),
    });
  }

  const crossingValue = 2_000_000;
  const crossingYear = findValueCrossingYear(comparisonSlug, "left", leftInputs, rightInputs, crossingValue, horizonYears);
  if (crossingYear != null) {
    stops.push({
      detail: `${result.left.label} crosses ${formatWealthCurrency(crossingValue)} around ${formatJourneyYear(crossingYear)}.`,
      id: "crossing",
      title: "Momentum builds",
      year: crossingYear,
      yearLabel: formatJourneyYear(crossingYear),
    });
  }

  if (horizonYears > 0) {
    const leaderLabel = favoredKey === "tie" ? "Both paths" : favoredKey === "left" ? result.left.label : result.right.label;
    stops.push({
      detail:
        favoredKey === "tie"
          ? "Both paths arrive in a similar place under these assumptions."
          : `${leaderLabel} leads by ${formatWealthCurrency(leadAmount)} at the horizon.`,
      id: "destination",
      title: "Final destination",
      year: horizonYears,
      yearLabel: formatJourneyYear(horizonYears),
    });
  }

  return stops;
}

function findValueCrossingYear(
  comparisonSlug: WealthComparisonSlug,
  side: "left" | "right",
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  targetValue: number,
  horizonYears: number,
) {
  for (let month = 1; month <= Math.round(horizonYears * 12); month += 1) {
    const years = month / 12;
    if (previewOptionValue(comparisonSlug, side, leftInputs, rightInputs, years) >= targetValue) {
      return Math.round(years * 10) / 10;
    }
  }
  return null;
}

function formatJourneyYear(year: number) {
  if (year < 1) {
    return "Today";
  }
  return Number.isInteger(year) ? `Year ${year}` : `Year ${year}`;
}

function bumpRateFields(inputs: Record<string, string>, delta: number) {
  if (inputs.annual_rate == null && inputs.loan_rate == null) {
    return inputs;
  }
  const next = { ...inputs };
  if (next.annual_rate != null) {
    next.annual_rate = String(Math.max(0, Number(next.annual_rate) + delta));
  }
  if (next.loan_rate != null) {
    next.loan_rate = String(Math.max(0, Number(next.loan_rate) + delta));
  }
  return next;
}

function bumpMonthlyPayment(inputs: Record<string, string>, multiplier: number) {
  if (inputs.monthly_payment == null) {
    return inputs;
  }
  return {
    ...inputs,
    monthly_payment: String(Math.max(0, Math.round(Number(inputs.monthly_payment) * multiplier))),
  };
}

function buildPurchasingPower(finalValue: number, realValue: number, inflationRate: number, years: number) {
  const resolvedReal = realValue || inflationAdjustedValue(finalValue, inflationRate, years);
  return {
    finalValue,
    inflationImpact: Math.max(0, finalValue - resolvedReal),
    realValue: resolvedReal,
  };
}

function buildHumanOutcome(
  result: WealthComparisonEvaluateResponse,
  favoredKey: "left" | "right" | "tie",
  catchUpYears: number | null,
) {
  if (favoredKey === "tie") {
    return "Both paths produce similar outcomes under these assumptions.";
  }

  const leader = favoredKey === "left" ? result.left : result.right;
  const trailer = favoredKey === "left" ? result.right : result.left;
  const gap = Math.abs(Number(result.difference_value));

  if (catchUpYears && trailer.key === "dps") {
    return `${leader.label} leads by ${formatWealthCurrency(gap)} now, but ${trailer.label} catches up after ${catchUpYears} years.`;
  }

  if (catchUpYears && leader.key === "dps") {
    return `${leader.label} leads by ${formatWealthCurrency(gap)} under current assumptions.`;
  }

  return `${leader.label} leads by ${formatWealthCurrency(gap)} under current assumptions.`;
}

function buildJourneyMilestones(
  comparisonSlug: WealthComparisonSlug,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  horizonYears: number,
): ComparisonMilestone[] {
  const milestoneYears = [1, 3, 5, 10].filter((year) => year <= Math.max(horizonYears, 1));

  return milestoneYears.map((year) => ({
    year,
    leftValue: previewOptionValue(comparisonSlug, "left", leftInputs, rightInputs, year),
    rightValue: previewOptionValue(comparisonSlug, "right", leftInputs, rightInputs, year),
  }));
}

function previewOptionValue(
  comparisonSlug: WealthComparisonSlug,
  side: "left" | "right",
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  years: number,
) {
  if (comparisonSlug === "dps-vs-fdr") {
    if (side === "left") {
      return futureValueAnnuity(Number(leftInputs.monthly_payment ?? 0), Number(leftInputs.annual_rate ?? WEALTH_DEFAULT_RATES.dps), years);
    }
    return lumpSumGrowth(Number(rightInputs.principal ?? 0), Number(rightInputs.annual_rate ?? WEALTH_DEFAULT_RATES.fdr), years);
  }

  if (comparisonSlug === "fdr-vs-stocks") {
    const principal = Number(leftInputs.principal ?? rightInputs.principal ?? 0);
    const rate = Number((side === "left" ? leftInputs.annual_rate : rightInputs.annual_rate) ?? WEALTH_DEFAULT_RATES.fdr);
    return lumpSumGrowth(principal, rate, years);
  }

  if (comparisonSlug === "save-vs-spend") {
    if (side === "right") {
      return 0;
    }
    const amount = Number(leftInputs.amount ?? rightInputs.amount ?? 0);
    return lumpSumGrowth(amount, Number(WEALTH_DEFAULT_RATES.invest), years);
  }

  if (comparisonSlug === "loan-prepayment-vs-investing") {
    const amount = Number(leftInputs.extra_amount ?? rightInputs.extra_amount ?? 0);
    if (side === "left") {
      return lumpSumGrowth(amount, Number(leftInputs.loan_rate ?? WEALTH_DEFAULT_RATES.loan), years);
    }
    return lumpSumGrowth(amount, Number(rightInputs.annual_rate ?? WEALTH_DEFAULT_RATES.invest), years);
  }

  const amount = Number(leftInputs.amount ?? rightInputs.amount ?? 0);
  return lumpSumGrowth(amount, Number(WEALTH_DEFAULT_RATES.fdr), years);
}

function buildContextualInsights(
  comparisonSlug: WealthComparisonSlug,
  result: WealthComparisonEvaluateResponse,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  inflationRate: number,
  years: number,
  catchUpYears: number | null,
  favoredKey: "left" | "right" | "tie",
): WealthInsightCard[] {
  const insights: WealthInsightCard[] = [];
  const leftReal = Number(result.left.real_value ?? inflationAdjustedValue(Number(result.left.final_value), inflationRate, years));
  const rightReal = Number(result.right.real_value ?? inflationAdjustedValue(Number(result.right.final_value), inflationRate, years));
  const inflationDrag = Math.max(Number(result.left.final_value) - leftReal, Number(result.right.final_value) - rightReal);

  if (comparisonSlug === "dps-vs-fdr" && Number(leftInputs.monthly_payment ?? 0) > 0) {
    insights.push({
      id: "consistency-momentum",
      title: "Consistency creates momentum",
      body: "Monthly saving keeps capital working even when lump-sum certainty looks stronger early on.",
      severity: "POSITIVE",
    });
  }

  if (comparisonSlug === "dps-vs-fdr" && favoredKey === "right") {
    insights.push({
      id: "lump-sum-early",
      title: "The lump-sum advantage appears early",
      body: "When money is already available, predictable lock-in can pull ahead before monthly savings compound fully.",
      severity: "INFO",
    });
  }

  if (catchUpYears) {
    insights.push({
      id: "catch-up-horizon",
      title: "Longer horizons can change the leader",
      body: `DPS catches up after about ${catchUpYears} years if contributions stay steady.`,
      severity: "INFO",
    });
  }

  if (years >= 10 && favoredKey === "tie") {
    insights.push({
      id: "long-horizon-gap",
      title: "Longer horizons narrow the gap",
      body: "As time stretches, small rate differences matter less than contribution rhythm and starting capital.",
      severity: "NEUTRAL",
    });
  }

  if (inflationDrag > Math.max(Number(result.left.final_value), Number(result.right.final_value)) * 0.12) {
    insights.push({
      id: "inflation-drag",
      title: "Inflation reduces both outcomes",
      body: `Rising prices could quietly take away about ${formatWealthCurrency(inflationDrag)} of purchasing power in this scenario.`,
      severity: "WARNING",
    });
  }

  if (insights.length === 0) {
    insights.push(...result.insights.slice(0, 2));
  }

  return insights.slice(0, 4);
}

export const UNIFIED_JOURNEY_RAIL_MONTHS = COMPARISON_MAX_MONTHS;

export function buildUnifiedJourneyStops(
  scenarioMonths: number,
  turningPointYear: number | null,
  leftLabel: string,
  rightLabel: string,
): UnifiedJourneyStop[] {
  const stops: UnifiedJourneyStop[] = [
    {
      id: "today",
      label: "Today",
      months: 0,
      storyBody: "Both futures begin from the choices you make today.",
      storyTitle: "Today",
      year: 0,
    },
    {
      id: "year-1",
      label: "Year 1",
      months: 12,
      storyBody: `${rightLabel} often leads early because the full amount starts earning immediately.`,
      storyTitle: "Year 1",
      year: 1,
    },
    {
      id: "year-3",
      label: "Year 3",
      months: 36,
      storyBody: "The gap starts closing as monthly savings keep building momentum.",
      storyTitle: "Year 3",
      year: 3,
    },
    {
      id: "year-5",
      extendsScenario: 60 > scenarioMonths,
      label: "Year 5",
      months: 60,
      storyBody: "Your 5-year result — see which path is ahead at this familiar milestone.",
      storyTitle: "Year 5",
      year: 5,
    },
  ];

  if (turningPointYear != null) {
    const months = Math.round(turningPointYear * 12);
    stops.push({
      extendsScenario: months > scenarioMonths,
      id: "turning-point",
      isTurning: true,
      label: "Crossover",
      months,
      storyBody: `This is the turning point. ${leftLabel} finally catches up.`,
      storyTitle: formatJourneyYear(turningPointYear),
      year: turningPointYear,
    });
  }

  stops.push(
    {
      extendsScenario: 120 > scenarioMonths,
      id: "year-10",
      label: "Year 10",
      months: 120,
      storyBody: "Consistent saving wins over time if you stay patient.",
      storyTitle: "Year 10",
      year: 10,
    },
    {
      extendsScenario: COMPARISON_MAX_MONTHS > scenarioMonths,
      id: "retirement",
      label: "Retirement",
      months: COMPARISON_MAX_MONTHS,
      storyBody: "A long view of how these two futures might play out.",
      storyTitle: "Retirement",
      year: COMPARISON_MAX_MONTHS / 12,
    },
  );

  return stops;
}

export function buildJourneyMoment(
  snapshot: ComparisonHorizonSnapshot,
  activeStop: UnifiedJourneyStop,
  scenarioMonths: number,
  leftLabel: string,
  rightLabel: string,
): JourneyMoment {
  const scenarioYears = yearsFromMonths(scenarioMonths);
  const viewYears = snapshot.horizonYears;

  let visitHeadline = "You're starting from today";
  if (viewYears > 0) {
    if (scenarioYears > 0 && Math.abs(viewYears - scenarioYears) < 0.08) {
      visitHeadline =
        scenarioYears >= COMPARISON_MAX_MONTHS / 12
          ? "Looking ahead to retirement"
          : `Looking ahead ${formatHorizonYearLabel(scenarioYears)} year${scenarioYears === 1 ? "" : "s"}`;
    } else if (activeStop.isTurning) {
      visitHeadline = "Future stop: the crossover";
    } else if (Number.isInteger(viewYears)) {
      visitHeadline = `You're visiting Year ${viewYears}`;
    } else {
      visitHeadline = `Future stop: Year ${formatHorizonYearLabel(viewYears)}`;
    }
  }

  return {
    storyBody: enrichJourneyStoryBody(activeStop, snapshot, leftLabel, rightLabel),
    storyTitle: activeStop.storyTitle,
    summaryLine: buildJourneySummaryLine(snapshot, activeStop, leftLabel, rightLabel),
    visitHeadline,
  };
}

export function buildHappyPath(
  snapshot: ComparisonHorizonSnapshot,
  turningPointYear: number | null,
  leftLabel: string,
  unifiedStops: UnifiedJourneyStop[],
  scenarioMonths: number,
  viewMonths: number,
): JourneyHappyPath | null {
  const viewYears = viewMonths / 12;
  const turningStop = unifiedStops.find((stop) => stop.id === "turning-point");
  const yearFiveStop = unifiedStops.find((stop) => stop.id === "year-5");
  const yearTenStop = unifiedStops.find((stop) => stop.id === "year-10");
  const retirementStop = unifiedStops.find((stop) => stop.id === "retirement");

  const nudge = (stop: UnifiedJourneyStop, actionLabel: string, prompt: string): JourneyHappyPath => ({
    actionLabel,
    extendsScenario: Boolean(stop.extendsScenario && stop.months > scenarioMonths),
    prompt,
    targetMonths: stop.months,
  });

  if (viewYears < 4.5 && yearFiveStop && yearFiveStop.months > viewMonths + 1) {
    const actionLabel = viewYears < 0.5 ? "Jump to Year 5" : viewYears < 2 ? "See Year 5" : "Continue to Year 5";
    const prompt =
      viewYears < 0.5 ? "See how this plays out in five years." : "Keep moving forward in time.";
    return nudge(yearFiveStop, actionLabel, prompt);
  }

  if (viewYears >= 4.5 && viewYears < 9.5) {
    if (
      turningStop &&
      turningPointYear != null &&
      snapshot.favoredKey === "right" &&
      turningStop.months > viewMonths + 1
    ) {
      return nudge(turningStop, "Jump to turning point", `Want to see if ${leftLabel} catches up?`);
    }

    if (yearTenStop && yearTenStop.months > viewMonths + 1) {
      return nudge(yearTenStop, "View Year 10", "What happens if you wait longer?");
    }
  }

  if (viewYears >= 9.5 && retirementStop && retirementStop.months > viewMonths + 1) {
    return nudge(retirementStop, "See retirement", "Stretch to the full horizon.");
  }

  const nextStop = unifiedStops
    .filter((stop) => stop.months > viewMonths + 1)
    .sort((left, right) => left.months - right.months)[0];

  if (nextStop) {
    return nudge(nextStop, `Go to ${nextStop.label}`, "Explore the next chapter.");
  }

  return null;
}

export type ScenarioContributionSummary =
  | {
      dpsTotal: string;
      fdrTotal: string;
      horizon: string;
      kind: "dps-vs-fdr";
      monthly: string;
    }
  | {
      horizon: string;
      kind: "generic";
    };

export type ScenarioViewProjection = {
  dpsValue: string;
  fdrValue: string;
  yearLabel: string;
};

export function buildScenarioContributionSummary(
  comparisonSlug: WealthComparisonSlug,
  leftInputs: Record<string, string>,
  rightInputs: Record<string, string>,
  scenarioMonths: number,
): ScenarioContributionSummary {
  const years = yearsFromMonths(scenarioMonths);
  const yearsLabel = formatHorizonYearLabel(years);
  const horizonPhrase = years <= 0 ? "today" : `${yearsLabel} year${yearsLabel === "1" ? "" : "s"}`;

  if (comparisonSlug === "dps-vs-fdr") {
    const monthly = Number(leftInputs.monthly_payment ?? 0);
    const principal = Number(rightInputs.principal ?? 0);
    const dpsTotal = monthly * scenarioMonths;
    return {
      dpsTotal: formatCompactWealthAmount(dpsTotal),
      fdrTotal: formatCompactWealthAmount(principal),
      horizon: horizonPhrase,
      kind: "dps-vs-fdr",
      monthly: formatCompactMonthly(monthly),
    };
  }

  return {
    horizon: horizonPhrase,
    kind: "generic",
  };
}

export function buildScenarioViewProjection(
  comparisonSlug: WealthComparisonSlug,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  viewMonths: number,
): ScenarioViewProjection | null {
  const viewYears = yearsFromMonths(viewMonths);
  if (viewYears <= 0) {
    return null;
  }

  const leftValue = previewOptionValue(comparisonSlug, "left", leftInputs, rightInputs, viewYears);
  const rightValue = previewOptionValue(comparisonSlug, "right", leftInputs, rightInputs, viewYears);

  const yearLabel =
    viewMonths >= COMPARISON_MAX_MONTHS
      ? "Retirement"
      : Number.isInteger(viewYears)
        ? `Year ${viewYears}`
        : `Year ${formatHorizonYearLabel(viewYears)}`;

  return {
    dpsValue: formatWealthCurrency(leftValue),
    fdrValue: formatWealthCurrency(rightValue),
    yearLabel,
  };
}

export function buildJourneyShortcuts(
  turningPointYear: number | null,
  scenarioMonths: number,
): JourneyShortcut[] {
  const shortcuts: JourneyShortcut[] = [];

  if (turningPointYear != null) {
    const months = Math.round(turningPointYear * 12);
    shortcuts.push({
      extendsScenario: months > scenarioMonths,
      id: "crossover",
      label: "Crossover",
      months,
    });
  }

  for (const years of COMPARISON_YEARS_BEFORE_RETIREMENT) {
    const months = COMPARISON_MAX_MONTHS - years * 12;
    if (months <= 0) {
      continue;
    }

    shortcuts.push({
      extendsScenario: months > scenarioMonths,
      id: `before-retirement-${years}`,
      label: `${years}yr before retirement`,
      months,
    });
  }

  return shortcuts;
}

function formatCompactMonthly(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "BDT 0";
  }

  if (value >= 1000) {
    const thousands = value / 1000;
    return `BDT ${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }

  return formatWealthCurrency(value);
}

function formatCompactWealthAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "BDT 0";
  }

  if (value >= 10_000_000) {
    const crore = value / 10_000_000;
    return `BDT ${Number.isInteger(crore) ? crore.toFixed(0) : crore.toFixed(1)} Cr`;
  }

  if (value >= 100_000) {
    const lakh = value / 100_000;
    return `BDT ${Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)} Lakh`;
  }

  return formatWealthCurrency(value);
}

function enrichJourneyStoryBody(
  stop: UnifiedJourneyStop,
  snapshot: ComparisonHorizonSnapshot,
  leftLabel: string,
  rightLabel: string,
) {
  if (stop.id === "year-1") {
    return snapshot.rightValue > snapshot.leftValue
      ? `${rightLabel} leads early because the full amount starts earning immediately.`
      : `${leftLabel} is already building momentum from month one.`;
  }

  if (stop.id === "year-3") {
    return "The gap starts closing as monthly savings keep building momentum.";
  }

  if (stop.id === "year-5") {
    if (snapshot.favoredKey === "right") {
      return `${rightLabel} is still ahead, but the gap is shrinking.`;
    }
    if (snapshot.favoredKey === "left") {
      return `${leftLabel} has pulled ahead by year five.`;
    }
    return "Both paths are surprisingly close at the five-year mark.";
  }

  if (stop.isTurning) {
    return `This is the turning point. ${leftLabel} finally catches up.`;
  }

  if (stop.id === "year-10") {
    return "Consistent saving wins over time.";
  }

  return stop.storyBody;
}

function buildJourneySummaryLine(
  snapshot: ComparisonHorizonSnapshot,
  activeStop: UnifiedJourneyStop,
  leftLabel: string,
  _rightLabel: string,
) {
  if (snapshot.horizonYears <= 0) {
    return "Both futures start from the choices you make today.";
  }

  const when =
    activeStop.id === "today"
      ? "Today"
      : activeStop.isTurning
        ? `Year ${formatHorizonYearLabel(activeStop.year)}`
        : activeStop.storyTitle;

  if (activeStop.isTurning && Math.abs(snapshot.horizonYears - activeStop.year) < 0.35) {
    return `At ${when}: ${leftLabel} finally catches up and takes the lead.`;
  }

  if (snapshot.favoredKey === "tie") {
    return `At ${when}: both paths are neck and neck.`;
  }

  return `At ${when}: ${snapshot.leaderLabel} is ahead by ${formatWealthCurrency(snapshot.leadAmount)}.`;
}

export const COMPARISON_RAIL_STOP_IDS = ["start", "year-1", "year-3", "turning-point", "destination"] as const;

export function resolveUnifiedActiveStopId(horizonYears: number, stops: UnifiedJourneyStop[]) {
  if (stops.length === 0) {
    return "today";
  }

  const turningStop = stops.find((stop) => stop.isTurning);
  if (turningStop != null && Math.abs(turningStop.year - horizonYears) < 0.25) {
    return turningStop.id;
  }

  let active = stops[0];
  let closestDistance = Math.abs(stops[0].year - horizonYears);

  for (const stop of stops) {
    const distance = Math.abs(stop.year - horizonYears);
    if (distance < closestDistance - 0.001) {
      active = stop;
      closestDistance = distance;
    }
  }

  return active.id;
}

export function resolveActiveStopId(horizonYears: number, stops: JourneyRouteStop[]) {
  const railStops = COMPARISON_RAIL_STOP_IDS.map((id) => stops.find((stop) => stop.id === id)).filter(
    (stop): stop is JourneyRouteStop => stop != null,
  );

  if (railStops.length === 0) {
    return stops[0]?.id ?? "start";
  }

  const turningStop = railStops.find((stop) => stop.id === "turning-point");
  if (turningStop != null && Math.abs(turningStop.year - horizonYears) < 0.2) {
    return turningStop.id;
  }

  let active = railStops[0];
  let closestDistance = Math.abs(railStops[0].year - horizonYears);

  for (const stop of railStops) {
    const distance = Math.abs(stop.year - horizonYears);
    if (distance < closestDistance - 0.001) {
      active = stop;
      closestDistance = distance;
      continue;
    }
    if (Math.abs(distance - closestDistance) <= 0.001 && stop.year > active.year && stop.id !== "destination") {
      active = stop;
    }
  }

  return active.id;
}

export function buildJourneyRailStops(
  journeyStops: JourneyRouteStop[],
  scenarioMonths: number,
  turningPointYear: number | null,
): Array<{ id: string; label: string; months: number; year: number; extendsScenario?: boolean }> {
  const scenarioYears = yearsFromMonths(scenarioMonths);
  const picked = COMPARISON_RAIL_STOP_IDS.map((id) => journeyStops.find((stop) => stop.id === id)).filter(
    (stop): stop is JourneyRouteStop => stop != null,
  );

  const stops = picked.length >= 3 ? picked : journeyStops.slice(0, 5);

  return stops.map((stop) => {
    if (stop.id === "start") {
      return { id: stop.id, label: "Start", months: 0, year: 0 };
    }

    if (stop.id === "destination") {
      return {
        id: stop.id,
        label: "Final destination",
        months: scenarioMonths,
        year: scenarioYears,
      };
    }

    if (stop.id === "turning-point") {
      const months = monthsForJourneyStop(stop, COMPARISON_MAX_MONTHS);
      return {
        extendsScenario: months > scenarioMonths,
        id: stop.id,
        label: "Turning Point",
        months,
        year: stop.year,
      };
    }

    return {
      id: stop.id,
      label: stop.title,
      months: monthsForJourneyStop(stop, COMPARISON_MAX_MONTHS),
      year: stop.year,
    };
  });
}

export function maxRailTimelineMonths(
  scenarioMonths: number,
  railStops: Array<{ months: number }>,
  turningPointYear: number | null,
) {
  const turningMonths = turningPointYear != null ? Math.round(turningPointYear * 12) : 0;
  const stopMonths = railStops.map((stop) => stop.months);
  return Math.max(scenarioMonths, turningMonths, ...stopMonths, 12);
}

export function buildHorizonSnapshot(
  comparisonSlug: WealthComparisonSlug,
  result: WealthComparisonEvaluateResponse,
  leftInputs: Record<string, number>,
  rightInputs: Record<string, number>,
  horizonMonths: number,
  turningPointYear: number | null,
  unifiedStops: UnifiedJourneyStop[],
): ComparisonHorizonSnapshot {
  const horizonYears = yearsFromMonths(horizonMonths);
  const leftValue = previewOptionValue(comparisonSlug, "left", leftInputs, rightInputs, horizonYears);
  const rightValue = previewOptionValue(comparisonSlug, "right", leftInputs, rightInputs, horizonYears);
  const difference = leftValue - rightValue;
  const maxValue = Math.max(leftValue, rightValue, 1);
  const favoredKey = Math.abs(difference) < maxValue * 0.02 ? "tie" : difference >= 0 ? "left" : "right";
  const leader = favoredKey === "left" ? result.left : favoredKey === "right" ? result.right : result.left;
  const trailer = favoredKey === "left" ? result.right : favoredKey === "right" ? result.left : result.right;
  const activeStopId = resolveUnifiedActiveStopId(horizonYears, unifiedStops);
  const hasPassedTurningPoint = turningPointYear != null && horizonYears >= turningPointYear;

  return {
    activeStopId,
    favoredKey,
    hasPassedTurningPoint,
    horizonYears,
    leadAmount: Math.abs(difference),
    leaderLabel: favoredKey === "tie" ? "Both paths" : leader.label,
    leftValue,
    narrativeLine: buildHorizonNarrative(result, favoredKey, leader.label, trailer.label, Math.abs(difference), horizonYears, turningPointYear),
    rightValue,
    trailerLabel: trailer.label,
  };
}

function buildHorizonNarrative(
  result: WealthComparisonEvaluateResponse,
  favoredKey: "left" | "right" | "tie",
  leaderLabel: string,
  trailerLabel: string,
  gap: number,
  horizonYears: number,
  turningPointYear: number | null,
) {
  if (horizonYears <= 0) {
    return "Both futures begin from the choices you make today.";
  }

  const when = horizonYears >= 1 ? `Year ${formatHorizonYearLabel(horizonYears)}` : "today";

  if (favoredKey === "tie") {
    return `At ${when}, both paths arrive in a similar place.`;
  }

  if (turningPointYear != null && horizonYears < turningPointYear && trailerLabel === result.left.label) {
    return `At ${when}, ${leaderLabel} leads by ${formatWealthCurrency(gap)} — but ${trailerLabel} catches up around ${formatJourneyYear(turningPointYear)}.`;
  }

  if (hasPassedTurningPointLabel(horizonYears, turningPointYear) && leaderLabel === result.left.label) {
    return `At ${when}, ${leaderLabel} has taken the lead after the turning point.`;
  }

  return `At ${when}, ${leaderLabel} leads by ${formatWealthCurrency(gap)}.`;
}

function hasPassedTurningPointLabel(horizonYears: number, turningPointYear: number | null) {
  return turningPointYear != null && horizonYears >= turningPointYear;
}

export function buildNarrativeBeats(
  result: WealthComparisonEvaluateResponse,
  snapshot: ComparisonHorizonSnapshot,
  turningPointYear: number | null,
  horizonYears: number,
): ComparisonNarrativeBeat[] {
  const atToday = snapshot.horizonYears <= 0;
  const atTurning = turningPointYear != null && snapshot.hasPassedTurningPoint;
  const atHorizon = !atToday && !atTurning;

  const beats: ComparisonNarrativeBeat[] = [
    {
      detail: "Both futures begin from the choices you make today.",
      headline: "Your story starts here.",
      id: "today",
      isHere: atToday,
      when: "Today",
    },
  ];

  if (horizonYears > 0) {
    beats.push({
      detail:
        snapshot.favoredKey === "tie"
          ? "Both paths look similar at this horizon."
          : `${snapshot.leaderLabel} leads by ${formatWealthCurrency(snapshot.leadAmount)}.`,
      headline:
        snapshot.favoredKey === "tie"
          ? "The paths stay close."
          : `${snapshot.leaderLabel} is ahead.`,
      id: "horizon",
      isHere: atHorizon,
      when: snapshot.horizonYears >= 1 ? `Year ${formatHorizonYearLabel(snapshot.horizonYears)}` : "Your horizon",
    });
  }

  if (turningPointYear != null) {
    const turningStop = result.left.label;
    beats.push({
      detail: `${turningStop} overtakes ${result.right.label} after about ${formatJourneyYear(turningPointYear)}.`,
      headline: "The future flips.",
      id: "turning-point",
      isFuture: snapshot.horizonYears < turningPointYear,
      isHere: atTurning,
      when: formatJourneyYear(turningPointYear),
    });
  }

  return beats;
}

function formatHorizonYearLabel(years: number) {
  return Number.isInteger(years) ? String(years) : years.toFixed(1);
}

export function monthsForJourneyStop(stop: JourneyRouteStop, maxMonths: number) {
  if (stop.id === "start") {
    return 0;
  }
  return Math.min(maxMonths, Math.max(0, Math.round(stop.year * 12)));
}

export function linearRailPercent(months: number, timelineMaxMonths: number) {
  if (timelineMaxMonths <= 0 || months <= 0) {
    return 0;
  }

  return Math.min(100, (months / timelineMaxMonths) * 100);
}

export function railMarkerOffset(percent: number) {
  return `calc(var(--journey-rail-inset) + (100% - 2 * var(--journey-rail-inset)) * ${percent} / 100)`;
}

export function snapJourneySliderMonths(
  months: number,
  _scenarioMonths: number,
  stops: UnifiedJourneyStop[],
): number {
  const clamped = Math.max(0, Math.min(UNIFIED_JOURNEY_RAIL_MONTHS, months));
  const stopMonths = stops.map((stop) => stop.months);

  let nearestStop = -1;
  let nearestDistance = Infinity;
  for (const candidate of stopMonths) {
    const distance = Math.abs(clamped - candidate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStop = candidate;
    }
  }

  if (nearestStop >= 0 && nearestDistance <= 8) {
    return nearestStop;
  }

  const yearSnapped = Math.round(clamped / 12) * 12;
  return Math.max(0, Math.min(UNIFIED_JOURNEY_RAIL_MONTHS, yearSnapped));
}

export function railPositionPercent(months: number, timelineMaxMonths: number) {
  if (timelineMaxMonths <= 0) {
    return 0;
  }

  if (months <= 0) {
    return 2;
  }

  if (months <= 12) {
    return 2 + (months / 12) * 8;
  }

  const remaining = months - 12;
  const remainingMax = Math.max(12, timelineMaxMonths - 12);
  return Math.min(94, 10 + (remaining / remainingMax) * 84);
}

export function monthsFromRailPercent(percent: number, timelineMaxMonths: number) {
  if (timelineMaxMonths <= 0 || percent <= 2) {
    return 0;
  }

  if (percent <= 10) {
    return Math.round(((percent - 2) / 8) * 12);
  }

  const remainingMax = Math.max(12, timelineMaxMonths - 12);
  const remaining = ((Math.min(94, percent) - 10) / 84) * remainingMax;
  return 12 + Math.round(remaining);
}

export function buildChartExplanation(
  activeStopId: string,
  snapshot: ComparisonHorizonSnapshot,
  leftLabel: string,
  rightLabel: string,
  turningPointYear: number | null,
  scenarioYears: number,
): ComparisonChartExplanation {
  const leftValue = formatWealthCurrency(snapshot.leftValue);
  const rightValue = formatWealthCurrency(snapshot.rightValue);
  const leader = snapshot.favoredKey === "left" ? leftLabel : snapshot.favoredKey === "right" ? rightLabel : "Both paths";
  const gap = formatWealthCurrency(snapshot.leadAmount);

  if (snapshot.horizonYears <= 0 || activeStopId === "today" || activeStopId === "start") {
    return {
      title: "Starting from today",
      body: `The purple line is ${leftLabel} — money you save month by month. The green line is ${rightLabel} — a lump sum locked away today. ${rightLabel} usually looks stronger at the start because all the money is already working.`,
    };
  }

  if (activeStopId === "year-1") {
    return {
      title: "The early chapter",
      body: `${rightLabel} often pulls ahead first when you already have a lump sum to invest. At this point, ${leader} leads by about ${gap}. Watch how the gap changes as monthly savings compound.`,
    };
  }

  if (activeStopId === "year-3") {
    return {
      title: "The gap is shifting",
      body: `By now, ${leftLabel} is at ${leftValue} and ${rightLabel} is at ${rightValue}. ${snapshot.narrativeLine} The lines show how patience and monthly discipline slowly reshape the race.`,
    };
  }

  if (activeStopId === "turning-point" || snapshot.hasPassedTurningPoint) {
    return {
      title: "The turning point",
      body: `This is where the story flips. ${leftLabel} overtakes ${rightLabel} after roughly ${turningPointYear != null ? formatJourneyYear(turningPointYear) : "several years"} of steady saving. Right now ${leader} leads by ${gap} at your visited moment.`,
    };
  }

  if (activeStopId === "destination" || snapshot.horizonYears >= scenarioYears - 0.05) {
    return {
      title: "End of your scenario",
      body: `You are viewing the finish line of your ${formatHorizonYearLabel(scenarioYears)}-year comparison. ${leftLabel} reaches ${leftValue}; ${rightLabel} reaches ${rightValue}. ${snapshot.narrativeLine}`,
    };
  }

  return {
    title: "Reading the chart",
    body: `Each line tracks one future. You are visiting ${snapshot.horizonYears >= 1 ? `Year ${formatHorizonYearLabel(snapshot.horizonYears)}` : "a point early in the journey"} — ${leftLabel} at ${leftValue}, ${rightLabel} at ${rightValue}. ${snapshot.narrativeLine}`,
  };
}
