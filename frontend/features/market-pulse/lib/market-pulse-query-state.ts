import type { BackendMarketBriefingDto } from "@/lib/api/backend-api-types";
import type { BackendMarketPulseSummaryDto } from "@/lib/api/market-pulse-api";
import type { MarketPulseCorePayload } from "@/lib/api/pulse-server";
import { responseMatchesMarketFreshness, summaryMatchesFreshness } from "@/lib/market/pulse-generation";
import { isSectionLoading } from "@/lib/ui/section-loading";

type SummaryQueryState = {
  data?: BackendMarketPulseSummaryDto | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  isFetching: boolean;
};

type BriefingQueryState = {
  data?: BackendMarketBriefingDto | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
};

function resolveSeededAnonymousSummary(initialCore: MarketPulseCorePayload | null) {
  if (!initialCore?.summary || !initialCore.freshness) {
    return null;
  }

  return summaryMatchesFreshness(initialCore.summary, initialCore.freshness)
    ? initialCore.summary
    : null;
}

function resolveSeededAnonymousBriefing(initialCore: MarketPulseCorePayload | null) {
  if (!initialCore?.briefing || !initialCore.summary) {
    return null;
  }

  return summaryMatchesFreshness(initialCore.briefing, initialCore.freshness) &&
    initialCore.briefing.decision_generation_id === initialCore.summary.decision_generation_id ? initialCore.briefing : null;
}

export function resolveMarketPulseSummary(
  initialCore: MarketPulseCorePayload | null,
  anonymousSummaryQuery: SummaryQueryState,
  personalizedSummaryQuery: SummaryQueryState,
  freshnessLastSyncedAt: string | null | undefined,
) {
  const seededAnonymousSummary = resolveSeededAnonymousSummary(initialCore);
  const anonymousSummary = anonymousSummaryQuery.data ?? seededAnonymousSummary ?? null;
  const personalizedSummary = personalizedSummaryQuery.data ?? null;

  const freshnessStamp = { last_synced_at: freshnessLastSyncedAt };

  const personalizedValid =
    Boolean(personalizedSummaryQuery.isSuccess && personalizedSummary) &&
    summaryMatchesFreshness(personalizedSummary, freshnessStamp);

  const anonymousValid =
    Boolean(anonymousSummary) && summaryMatchesFreshness(anonymousSummary, freshnessStamp);

  const resolvedSummary = personalizedValid
    ? personalizedSummary
    : anonymousValid
      ? anonymousSummary
      : null;

  return {
    anonymousSummary,
    personalizedSummary,
    resolvedSummary,
    summaryOwner: personalizedValid ? "personalized" as const : anonymousValid ? "anonymous" as const : null,
  };
}

export function resolveMarketPulseBriefing(
  initialCore: MarketPulseCorePayload | null,
  anonymousBriefingQuery: BriefingQueryState,
  personalizedBriefingQuery: BriefingQueryState,
  freshnessGeneration?: string | null,
  decisionGenerationId?: string | null,
) {
  const seededAnonymousBriefing = resolveSeededAnonymousBriefing(initialCore);
  const anonymousBriefing = anonymousBriefingQuery.data ?? seededAnonymousBriefing ?? null;
  const personalizedBriefing = personalizedBriefingQuery.data ?? null;

  const candidate = personalizedBriefingQuery.isSuccess && personalizedBriefing ? personalizedBriefing : anonymousBriefing;
  const resolvedBriefing = candidate && responseMatchesMarketFreshness(candidate, freshnessGeneration) &&
    (decisionGenerationId === undefined || candidate.decision_generation_id === decisionGenerationId) ? candidate : null;

  return {
    anonymousBriefing,
    personalizedBriefing,
    resolvedBriefing,
  };
}

export function resolveMarketPulseBriefingFlags(
  resolvedBriefing: BackendMarketBriefingDto | null,
  anonymousBriefingQuery: Pick<BriefingQueryState, "isLoading" | "isError">,
  personalizedBriefingQuery: Pick<BriefingQueryState, "isError" | "data">,
  anonymousBriefing: BackendMarketBriefingDto | null,
) {
  return {
    isBriefingLoading: !resolvedBriefing && anonymousBriefingQuery.isLoading,
    isBriefingError: anonymousBriefingQuery.isError && !resolvedBriefing,
    showBriefingPersonalizationWarning:
      Boolean(anonymousBriefing) && personalizedBriefingQuery.isError,
  };
}

export function resolveMarketPulsePresentationFlags(
  anonymousSummary: BackendMarketPulseSummaryDto | null,
  resolvedSummary: BackendMarketPulseSummaryDto | null,
  anonymousSummaryQuery: Pick<SummaryQueryState, "isLoading" | "isSuccess" | "isError" | "isFetching">,
  personalizedSummaryQuery: Pick<SummaryQueryState, "isError" | "isFetching" | "data">,
  freshnessLastSyncedAt: string | null | undefined,
) {
  const anonymousSettled = anonymousSummaryQuery.isSuccess || anonymousSummaryQuery.isError;
  const anonymousSummaryStale =
    Boolean(anonymousSummary) &&
    Boolean(freshnessLastSyncedAt) &&
    !summaryMatchesFreshness(anonymousSummary, { last_synced_at: freshnessLastSyncedAt });
  const awaitingAnonymousSummary = isSectionLoading(anonymousSummaryQuery.isLoading, anonymousSummary);
  const showFullPageLoader =
    !resolvedSummary && (awaitingAnonymousSummary || anonymousSummaryStale);
  const showUnavailable = anonymousSettled && !resolvedSummary && !anonymousSummaryStale;
  const showPersonalizationWarning = Boolean(anonymousSummary) && personalizedSummaryQuery.isError;
  const isPersonalizedSummaryLoading =
    personalizedSummaryQuery.isFetching && !personalizedSummaryQuery.data;

  return {
    anonymousSettled,
    showFullPageLoader,
    showUnavailable,
    showPersonalizationWarning,
    isPersonalizedSummaryLoading,
    sectionLoading: {
      focus: isSectionLoading(showFullPageLoader || isPersonalizedSummaryLoading, resolvedSummary),
    },
  };
}

export function shouldWriteMarketPulseSnapshot(params: {
  hasPersonalizationInputs: boolean;
  anonymousSettled: boolean;
  anonymousSummary: BackendMarketPulseSummaryDto | null;
  personalizedSummaryQuerySuccess: boolean;
  personalizedSummary: BackendMarketPulseSummaryDto | null;
  lastSyncedAt: string | null | undefined;
  resolvedSummary: BackendMarketPulseSummaryDto | null;
}): boolean {
  if (!params.lastSyncedAt || !params.resolvedSummary) {
    return false;
  }

  if (!summaryMatchesFreshness(params.resolvedSummary, { last_synced_at: params.lastSyncedAt })) {
    return false;
  }

  if (!params.hasPersonalizationInputs) {
    return params.anonymousSettled && Boolean(params.anonymousSummary);
  }

  return params.personalizedSummaryQuerySuccess && Boolean(params.personalizedSummary);
}

export function shouldInvalidatePulseSsrSeed(
  initialCore: MarketPulseCorePayload,
  liveFreshnessSyncedAt: string | null | undefined,
  hasInvalidated: boolean,
): boolean {
  if (hasInvalidated || !liveFreshnessSyncedAt) {
    return false;
  }

  return Boolean(initialCore.lastSyncedAt) && liveFreshnessSyncedAt !== initialCore.lastSyncedAt;
}
