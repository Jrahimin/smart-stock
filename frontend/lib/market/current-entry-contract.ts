import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import { compatibleDisplayAction } from "@/lib/market/decision-action-compatibility";

type RecordValue = Record<string, unknown>;
export type CurrentEntryInstrument = { symbol: string; exchange: string };
const record = (value: unknown): RecordValue => value && typeof value === "object" ? value as RecordValue : {};
const timestamp = (value: unknown) => typeof value === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
const dhakaDate = (time: number) => new Date(time + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const states = new Set(["NOT_APPLICABLE", "INVALIDATED", "EXPIRED", "UNVERIFIED", "OUTSIDE_ZONE", "AWAITING_CONFIRMATION", "APPLICABLE"]);
const reasons = new Set(["PUBLICATION_INVALIDATED", "ACTION_NOT_PERMITTED", "ELIGIBILITY_BLOCKED", "NO_ENTRY_PLAN", "STOP_BREACHED", "PRICE_BASIS_CHANGED", "PLAN_EXPIRED", "COVERAGE_UNKNOWN", "QUOTE_UNUSABLE", "PATH_INCOMPLETE", "TERMS_UNKNOWN", "TARGET_REACHED", "BELOW_ENTRY_ZONE", "ABOVE_ENTRY_ZONE", "COMPLETED_BREAKOUT_REQUIRED", "ENTRY_SESSION_PENDING", "ENTRY_TERMS_MET", "MARKET_CLOSED", "SESSION_SETTLING"]);

type EntryRecord = { owner: RecordValue; stamp: RecordValue; lineage: RecordValue[]; stock: RecordValue; quote: RecordValue; assessment: RecordValue };
function entries(data: unknown): EntryRecord[] {
  const payload = record(data);
  if (payload.data) return entries(payload.data);
  if (payload.decision_support) {
    const support = record(payload.decision_support);
    return [{ owner: support, stamp: { ...support, ...payload }, lineage: [support, payload], stock: record(payload.stock), quote: record(payload.display_metrics), assessment: record(support.entry_applicability) }];
  }
  if (Array.isArray(payload.rows)) return payload.rows.map((value) => {
    const row = record(value);
    return { owner: row, stamp: { ...record(payload.meta), ...row }, lineage: [record(payload.meta), row], stock: record(row.stock), quote: record(row.display_quote), assessment: record(row.entry_applicability ?? record(row.decision).entry_applicability) };
  });
  if (Array.isArray(payload.focus_stocks)) return [...payload.focus_stocks, ...(Array.isArray(payload.monitor_candidates) ? payload.monitor_candidates : [])].map((value) => {
    const item = record(value);
    const decision = { display_action: item.recommendation, decision_taxonomy_version: item.decision_taxonomy_version ?? undefined };
    return { owner: { ...item, decision }, stamp: { ...record(payload.coverage), ...payload, ...item }, lineage: [payload, item],
      stock: { id: item.stock_id, symbol: item.symbol, exchange: item.exchange }, quote: record(item.display_quote), assessment: record(item.entry_applicability) };
  });
  return [];
}

function instrumentMatches(entry: EntryRecord, expected?: CurrentEntryInstrument): boolean {
  const { stamp, stock, owner } = entry;
  const decision = record(owner.decision);
  const canonical = record(decision.canonical ?? owner.canonical_decision);
  return !!stock.symbol && !!stock.id &&
    (!expected || stock.symbol === expected.symbol && stock.exchange === expected.exchange) &&
    (!stamp.symbol || stamp.symbol === stock.symbol) && (!stamp.exchange || stamp.exchange === stock.exchange) &&
    (!stamp.stock_id || stamp.stock_id === stock.id) &&
    (!canonical.stock_id || canonical.stock_id === stock.id) && (!canonical.exchange || canonical.exchange === stock.exchange) &&
    (!canonical.as_of_date || !stamp.decision_session_date || canonical.as_of_date === stamp.decision_session_date);
}

function aligned(entry: EntryRecord, freshness?: BackendMarketFreshnessDto | null): boolean {
  const { stamp, stock, assessment } = entry;
  // MarketFreshnessRead names the owning quote publication market_sync_id.
  const quoteGeneration = freshness?.quote_generation_id ?? freshness?.market_sync_id;
  return !!freshness && freshness.exchange === stock.exchange && instrumentMatches(entry) &&
    freshness.decision_status === "CURRENT" && stamp.decision_status === "CURRENT" &&
    !!freshness.decision_generation_id && stamp.decision_generation_id === freshness.decision_generation_id &&
    !!quoteGeneration && stamp.quote_generation_id === quoteGeneration &&
    entry.lineage.every((part) => (part.decision_generation_id === undefined || part.decision_generation_id === freshness.decision_generation_id) &&
      (part.quote_generation_id === undefined || part.quote_generation_id === quoteGeneration) &&
      (part.decision_status === undefined || part.decision_status === freshness.decision_status)) &&
    states.has(String(assessment.status)) && reasons.has(String(assessment.reason_code));
}

/** The source clock and configured exchange close bound reuse, even when IDs never change. */
function positiveDeadline(entry: EntryRecord, freshness?: BackendMarketFreshnessDto | null): number | null {
  if (!aligned(entry, freshness) || !freshness || entry.assessment.status !== "APPLICABLE" || entry.assessment.reason_code !== "ENTRY_TERMS_MET") return null;
  const { quote, assessment } = entry;
  const decision = record(entry.owner.decision);
  if (compatibleDisplayAction(decision) !== "POTENTIAL_BUY") return null;
  const source = timestamp(quote.source_observed_at);
  const assessed = timestamp(assessment.assessed_at);
  const publication = timestamp(assessment.publication_observed_at);
  const age = quote.max_age_seconds;
  const session = quote.as_of_trade_date;
  const closingBasis = assessment.price_basis === "LAST_CLOSE";
  if (!Number.isFinite(source) || !Number.isFinite(assessed) || !Number.isFinite(publication) || publication > assessed || (!closingBasis && publication > source) || source > assessed ||
    timestamp(assessment.source_observed_at) !== source || assessment.quote_session_date !== session || quote.observation_session_date !== session ||
    typeof session !== "string" || session !== freshness.trade_date || dhakaDate(source) !== session || (!closingBasis && (dhakaDate(assessed) !== session || dhakaDate(publication) >= session)) ||
    typeof age !== "number" || !Number.isFinite(age) || age <= 0 ||
    !["PROVISIONAL", "FINALIZED"].includes(String(quote.observation_status)) || quote.data_quality === "SUSPICIOUS" ||
    typeof quote.current_price !== "number" || !Number.isFinite(quote.current_price) || quote.current_price <= 0) return null;
  if (closingBasis) {
    const deadline = timestamp(assessment.recheck_at);
    const close = /^\d{2}:\d{2}(?::\d{2})?$/.test(freshness.market_close_time) ? Date.parse(`${session}T${freshness.market_close_time}+06:00`) : NaN;
    return Number.isFinite(close) && Math.abs(source - close) <= age * 1000 && Number.isFinite(deadline) && assessed < deadline ? deadline : null;
  }
  if (freshness.market_status !== "OPEN") return null;
  const opening = /^\d{2}:\d{2}(?::\d{2})?$/.test(freshness.market_open_time) ? Date.parse(`${session}T${freshness.market_open_time}+06:00`) : NaN;
  if (!Number.isFinite(opening) || source < opening) return null;
  const close = /^\d{2}:\d{2}(?::\d{2})?$/.test(freshness.market_close_time) ? Date.parse(`${session}T${freshness.market_close_time}+06:00`) : NaN;
  const deadline = Math.min(source + age * 1000, close);
  return Number.isFinite(deadline) && assessed < deadline ? deadline : null;
}

function transientClosing(entry: EntryRecord): boolean {
  return entry.assessment.price_basis === "LAST_CLOSE" && !["INVALIDATED", "EXPIRED", "NOT_APPLICABLE"].includes(String(entry.assessment.status));
}

function entryDeadline(entry: EntryRecord, freshness?: BackendMarketFreshnessDto | null): number | null {
  if (entry.assessment.status === "APPLICABLE") return positiveDeadline(entry, freshness);
  const deadline = timestamp(entry.assessment.recheck_at);
  return transientClosing(entry) && aligned(entry, freshness) && timestamp(entry.assessment.assessed_at) < deadline ? deadline : null;
}

export function earliestCurrentEntryDeadline(data: unknown, freshness?: BackendMarketFreshnessDto | null, now = Date.now()): number | null {
  const deadlines = entries(data).map((entry) => entryDeadline(entry, freshness)).filter((value): value is number => value !== null && value > now);
  return deadlines.length ? Math.min(...deadlines) : null;
}

export function expiredCurrentEntryKeys(data: unknown, freshness?: BackendMarketFreshnessDto | null, now = Date.now()): string[] {
  return entries(data).flatMap((entry) => {
    const deadline = entryDeadline(entry, freshness);
    return deadline !== null && deadline <= now ? [`${entry.stock.id}:${entry.quote.source_observed_at}:${deadline}`] : [];
  });
}

export function currentEntryEvidenceTime(data: unknown): number {
  return Math.max(0, ...entries(data).map((entry) => timestamp(entry.assessment.assessed_at)).filter(Number.isFinite));
}

/** IDB never renews source age with cache insertion time. Missing freshness cannot certify permission. */
export function hasUnusablePositiveEntry(data: unknown, freshness?: BackendMarketFreshnessDto | null, now = Date.now()): boolean {
  return entries(data).some((entry) => (entry.assessment.status === "APPLICABLE" || transientClosing(entry)) && !usable(entry, freshness, now));
}

function datedWithdrawal(entry: EntryRecord, freshness: BackendMarketFreshnessDto | null | undefined, now: number): boolean {
  const { stamp, stock, assessment } = entry;
  const published = timestamp(assessment.publication_observed_at);
  const assessed = timestamp(assessment.assessed_at);
  return assessment.status === "INVALIDATED" && assessment.reason_code === "PUBLICATION_INVALIDATED" &&
    !!freshness && freshness.exchange === stock.exchange && freshness.decision_status === "UNAVAILABLE" && !freshness.decision_generation_id &&
    ["CURRENT", "UPDATING", "UNAVAILABLE"].includes(String(stamp.decision_status)) && typeof stamp.decision_generation_id === "string" && !!stamp.decision_generation_id &&
    !!(freshness.quote_generation_id ?? freshness.market_sync_id) && stamp.quote_generation_id === (freshness.quote_generation_id ?? freshness.market_sync_id) &&
    entry.lineage.every((part) => (part.decision_generation_id === undefined || part.decision_generation_id === stamp.decision_generation_id) &&
      (part.quote_generation_id === undefined || part.quote_generation_id === stamp.quote_generation_id)) &&
    typeof stamp.decision_session_date === "string" && Number.isFinite(published) && Number.isFinite(assessed) &&
    dhakaDate(published) >= stamp.decision_session_date && published <= assessed && assessed <= now;
}

function usable(entry: EntryRecord, freshness: BackendMarketFreshnessDto | null | undefined, now: number, expected?: CurrentEntryInstrument): boolean {
  if (!instrumentMatches(entry, expected)) return false;
  if (datedWithdrawal(entry, freshness, now)) return true;
  if (!aligned(entry, freshness)) return false;
  if (entry.assessment.status !== "APPLICABLE" && !transientClosing(entry)) return true;
  if (transientClosing(entry) && freshness?.market_status === "OPEN") return false;
  const deadline = entryDeadline(entry, freshness);
  return deadline !== null && timestamp(entry.assessment.assessed_at) <= now && now < deadline;
}

/** Preserve dated thesis/levels; null means a client display fallback, not server UNVERIFIED. */
export function fenceCurrentEntryPayload<T>(data: T, freshness?: BackendMarketFreshnessDto | null, now = Date.now(), expected?: CurrentEntryInstrument, suppressPositive = false): T {
  const payload = record(data);
  if (payload.data) return { ...payload, data: fenceCurrentEntryPayload(payload.data, freshness, now, expected, suppressPositive) } as T;
  const assessments = entries(data);
  if (payload.decision_support) {
    const support = record(payload.decision_support);
    const assessment = assessments[0] && !(suppressPositive && assessments[0].assessment.status === "APPLICABLE") && usable(assessments[0], freshness, now, expected) ? support.entry_applicability : null;
    return { ...payload, decision_support: { ...support, entry_applicability: assessment, decision: { ...record(support.decision), entry_applicability: assessment } } } as T;
  }
  if (Array.isArray(payload.rows)) return { ...payload, rows: payload.rows.map((value, i) => {
    const row = record(value);
    const assessment = !(suppressPositive && assessments[i].assessment.status === "APPLICABLE") && usable(assessments[i], freshness, now, expected) ? assessments[i].assessment as EntryApplicabilityDto : null;
    return { ...row, entry_applicability: assessment, decision: row.decision ? { ...record(row.decision), entry_applicability: assessment } : null };
  }) } as T;
  if (Array.isArray(payload.focus_stocks)) {
    let index = 0;
    const mapItem = (value: unknown) => {
      const item = record(value);
      const entry = assessments[index++];
      const assessment = !(suppressPositive && entry.assessment.status === "APPLICABLE") && usable(entry, freshness, now, expected) ? entry.assessment : null;
      return { ...item, entry_applicability: assessment, actionable_trigger: assessment?.status === "APPLICABLE" && assessment.price_basis !== "LAST_CLOSE" };
    };
    return { ...payload, focus_stocks: payload.focus_stocks.map(mapItem), monitor_candidates: Array.isArray(payload.monitor_candidates) ? payload.monitor_candidates.map(mapItem) : [] } as T;
  }
  return data;
}
