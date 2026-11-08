import { backendApiRequest, BackendApiError } from "@/lib/api/backend-api-client";
import type { Preview, PreviewStamp, PublicConfig, Revision, RevisionSummary, RulePack, TaxRequest, TaxResult, Year } from "./contracts";
import type { Issue } from "./facts";

const publicPath = "/wealth/tax-planner/v2";
const adminPath = "/admin/tax-planner/v2";
const noStore = (signal?: AbortSignal): RequestInit => ({ cache: "no-store", signal });

export function issuesFromError(error: unknown): Issue[] {
  if (!(error instanceof BackendApiError) || error.status !== 422) return [];
  const details = error.details?.errors;
  if (!Array.isArray(details) || !details.length) {
    const field = error.details?.field;
    return typeof field === "string" ? [{ path: field, message: error.message, code: error.code }] : [];
  }
  return details.map((detail: { loc?: (string | number)[]; msg?: string; type?: string }) => {
    const loc = detail.loc?.filter((part) => part !== "body" && part !== "query") ?? [];
    if (loc[0] === "income" && loc.length > 3 && typeof loc[1] === "number" && incomeDiscriminators.has(String(loc[2]))) loc.splice(2, 1);
    if ((loc[0] === "investments" || loc[0] === "scenario") && (loc[1] === "itemized" || loc[1] === "confirmed_eligible_total" || loc[1] === "planning_category_totals")) loc.splice(1, 1);
    return { path: loc.join("."), message: detail.msg, code: detail.type };
  });
}
export function issueFromError(error: unknown): Issue | null { return issuesFromError(error)[0] ?? null; }
export function invalidatesTaxRules(error: unknown) {
  return error instanceof BackendApiError && ["RULESET_CHANGED", "TAX_CALCULATIONS_SUSPENDED", "TAX_RULES_UNAVAILABLE"].includes(error.code ?? "");
}

const incomeDiscriminators = new Set([
  "private_employment", "government_employment", "ordinary_other", "ordinary_rent", "ordinary_business",
  "bank_interest", "fdr_profit", "dps_profit", "savings_certificate_profit", "domestic_dividend",
  "listed_gain", "foreign", "conditional_exemption", "property_gain", "precious_metal_gain",
  "partnership_or_aop", "final_tax", "restricted_tax", "unclassified",
]);

export function getTaxConfig(signal?: AbortSignal) {
  return backendApiRequest<PublicConfig>(publicPath + "/config", { init: noStore(signal) });
}
export function calculateTax(request: TaxRequest, signal?: AbortSignal) {
  return backendApiRequest<TaxResult>(publicPath + "/calculate", { method: "POST", body: (({ assessment_year, purpose, ...facts }) => facts)(request), init: noStore(signal) });
}

export async function calculateWithRevisionRefresh(
  request: TaxRequest,
  signal: AbortSignal,
  onRefresh: (config: PublicConfig) => void,
  onRulesInvalidated?: () => void,
) {
  try {
    return await calculateTax(request, signal);
  } catch (error) {
    if (invalidatesTaxRules(error)) onRulesInvalidated?.();
    if (!(error instanceof BackendApiError) || error.code !== "RULESET_CHANGED") throw error;
    const config = await getTaxConfig(signal);
    signal.throwIfAborted();
    onRefresh(config);
    const revision = config.selected?.identity.revision_id;
    if (!revision || config.calculations_suspended) {
      throw new BackendApiError("Tax estimates are temporarily unavailable", 503, "TAX_RULES_UNAVAILABLE");
    }
    return calculateTax({ ...request, assessment_year: config.selected!.identity.assessment_year, purpose: "forward_planning", expected_ruleset_revision: revision }, signal);
  }
}

export function listTaxRevisions(signal?: AbortSignal) {
  return backendApiRequest<RevisionSummary[]>(adminPath + "/rulesets", { init: noStore(signal) });
}
export function getTaxRevision(id: string, signal?: AbortSignal) {
  return backendApiRequest<Revision>(adminPath + "/rulesets/" + encodeURIComponent(id), { init: noStore(signal) });
}
export function createTaxDraft(year: Year, copyFrom?: string) {
  return backendApiRequest<Revision>(adminPath + "/drafts", {
    method: "POST", body: { assessment_year: year, copy_from_revision_id: copyFrom ?? null }, init: noStore(),
  });
}
const draftPath = (id: string) => adminPath + "/drafts/" + encodeURIComponent(id);
export function discardTaxDraft(draft: Pick<Revision, "id" | "edit_version" | "content_hash">, reason: string, copyFrom?: string) {
  return backendApiRequest<{ discarded: Revision; replacement: Revision | null }>(draftPath(draft.id) + "/discard", {
    method: "POST", body: {
      edit_version: draft.edit_version, content_hash: draft.content_hash, change_reason: reason.trim(),
      confirm_discard: true, copy_from_revision_id: copyFrom ?? null,
    }, init: noStore(),
  });
}
export function saveTaxDraft(id: string, editVersion: number, rules: RulePack) {
  return backendApiRequest<Revision>(draftPath(id), {
    method: "PUT", body: { edit_version: editVersion, rules }, init: noStore(),
  });
}
export function previewTaxDraft(id: string, editVersion: number) {
  return backendApiRequest<Preview>(draftPath(id) + "/preview", {
    method: "POST", body: { edit_version: editVersion }, init: noStore(),
  });
}
export function publishTaxDraft(id: string, stamp: PreviewStamp, reason: string, acknowledge: boolean) {
  return backendApiRequest<Revision>(draftPath(id) + "/publish", {
    method: "POST",
    body: {
      edit_version: stamp.edit_version, content_hash: stamp.content_hash,
      expected_published_revision_id: stamp.against_published_revision_id,
      change_reason: reason.trim(), acknowledge_fixture_deltas: acknowledge,
    },
    init: noStore(),
  });
}

