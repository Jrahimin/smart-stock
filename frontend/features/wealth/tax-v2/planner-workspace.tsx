"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/context/auth-context";
import type { ProductGuideStepState } from "@/features/guide/components/dashboard-desktop-guide";
import { TaxPlannerGuide } from "@/features/guide/components/tax-planner-guide";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import type { AppLocale } from "@/lib/locale/app-locale";
import { calculateWithRevisionRefresh, getTaxConfig, invalidatesTaxRules, issueFromError, issuesFromError } from "./api";
import type { PublicConfig, SelectedYear, TaxResult } from "./contracts";
import { buildTaxRequest, draftKey, hasPlanningAssumptions, initialFacts, incomeEntry, quickSalary, planningDefaults, readDraft, writeDraft, type Facts } from "./facts";
import { Button, translator } from "./fields";
import { focusField } from "./focus-field";
import { CompactFieldHelp } from "./fields";
import { CreditsStep, IncomeStep, InvestmentsStep, ProfileStep, QuickForm, ScenarioForm } from "./planner-form";
import { PlannerGuide } from "./planner-guide";
import { PlannerResults } from "./planner-results";
import { TaxHero, TaxJourney, TaxSnapshot, type EstimatePresentation } from "./planner-template";
import { InfoDialog } from "./info-dialog";
import { EligibleInvestments } from "./eligible-investments";
import css from "./tax.module.css";
import { fieldIssueText } from "./validation";

const configKey = ["tax-planner-v2", "config", "current"] as const;
const steps = [ProfileStep, IncomeStep, InvestmentsStep];
const blank = initialFacts();
blank.income = [incomeEntry("private_employment", quickSalary, "900000")];
blank.aggregate = "0";
export function usePublicTaxConfig() {
  return useQuery({
    queryKey: configKey,
    queryFn: ({ signal }) => getTaxConfig(signal),
    staleTime: 0, refetchOnWindowFocus: "always", refetchOnReconnect: "always", retry: false,
  });
}

export function TaxPlannerV2Workspace({ locale }: { locale: AppLocale }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const owner = isAuthenticated ? user?.id ?? null : null;
  return <section className="wealth-tool-workspace wealth-tax-planner-workspace">
    <WealthSubNav locale={locale} />
    {isLoading ? <p role="status">{translator(locale)("Preparing Tax Planner…", "কর পরিকল্পক প্রস্তুত হচ্ছে…")}</p> :
      <PlannerSession key={owner ?? "guest"} owner={owner} locale={locale} />}
  </section>;
}

function PlannerSession({ owner, locale }: { owner: string | null; locale: AppLocale }) {
  const t = translator(locale);
  const [session, setSession] = useState<Record<string, Facts>>({});
  const query = usePublicTaxConfig();
  const data = query.data, selected = data?.selected;
  const draft = selected ? "current" : undefined;
  const current = draft ? session[draft] ?? blank : blank;
  return <CompactFieldHelp.Provider value={true}><div className={css.template}>
    {!selected && <TaxHero locale={locale} />}
    {query.isPending && <p role="status" className={css.notice}>{t("Loading published tax rules…", "প্রকাশিত করের নিয়ম লোড হচ্ছে…")}</p>}
    {query.isError && <div role="alert" className={css.notice + " " + css.stack}>
      <p>{t("The published tax rules are unavailable. Try again before calculating.", "প্রকাশিত করের নিয়ম পাওয়া যাচ্ছে না। হিসাব করার আগে আবার চেষ্টা করুন।")}</p>
      <div className={css.row}><Button onClick={() => { void query.refetch(); }}>{t("Retry", "আবার চেষ্টা করুন")}</Button>
        </div>
    </div>}
    {data && !selected && !query.isError && <p className={css.notice}>{t("No active tax rules are available.", "সক্রিয় করের নিয়ম পাওয়া যাচ্ছে না।")}</p>}
    {data && selected && draft && <CurrentPlanner key={draft} owner={owner} locale={locale} config={data} selected={selected}
      configError={query.isError} facts={current}
      update={(f) => setSession((prev) => ({ ...prev, [draft]: f }))} />}
  </div></CompactFieldHelp.Provider>;
}

export function stepForPath(path: string) {
  if (path.startsWith("income.")) return 1;
  if (path.startsWith("investments") || path.startsWith("planning-investments") || path.startsWith("income_deductions") || path === "coverage.other_part2_donation_claims") return 2;
  if (path.startsWith("credits") || path.startsWith("filing") || path === "profile.first_return") return 3;
  return 0;
}

function CurrentPlanner({ owner, locale, config, selected, configError, facts, update }: {
  owner: string | null; locale: AppLocale; config: PublicConfig; selected: SelectedYear;
  configError: boolean; facts: Facts; update: (facts: Facts) => void;
}) {
  const t = translator(locale), queryClient = useQueryClient();
  const purpose = "forward_planning";
  const [provenance, setProvenance] = useState<EstimatePresentation["provenance"]>("example");
  const [mode, setMode] = useState<"quick" | "detailed">("quick");
  const [step, setStep] = useState(0);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(true);
  const [restoredNeedsReview, setRestoredNeedsReview] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ key: string; baseKey: string; defaults: string[]; result?: TaxResult; error?: unknown }>();
  const [successful, setSuccessful] = useState<{ baseKey: string; defaults: string[]; result: TaxResult }>();
  const [methodNotice, setMethodNotice] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [focusPath, setFocusPath] = useState<string>();
  const [savedRevision, setSavedRevision] = useState<string>();
  const root = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const reachedGuideFinish = useRef(false);
  const completed = useRef<string | undefined>(undefined);
  const immediateCalculation = useRef<string | undefined>(undefined);
  // Layout changes must not change the calculation or silently confirm saved facts.
  const conditional = hasPlanningAssumptions(facts, selected);
  const { request, issue, issues } = useMemo(() => buildTaxRequest(facts, selected, purpose, true), [facts, selected, purpose]);
  const disabled = config.calculations_suspended || configError;
  const inputKey = request ? String(attempt) + ":" + JSON.stringify(request) : "";
  const normalizedBase = useMemo(() => buildTaxRequest({ ...facts, scenario: null, scenarioConfirmed: false }, selected, purpose, true).request, [facts, selected, purpose]);
  const baseKey = normalizedBase ? JSON.stringify(normalizedBase) : "invalid-base";
  const defaults = planningDefaults(facts, selected);
  const current = outcome?.key === inputKey && !disabled ? outcome : undefined;
  const result = outcome?.result ?? successful?.result, identity = selected.identity;
  const matchesSelectedRules = result?.assessment_year === identity.assessment_year
    && result.revision_id === identity.revision_id && result.content_hash === identity.content_hash
    && result.schema_version === selected.rules.schema_version && result.engine_policy_version === identity.engine_policy_version
    && result.income_period_start === identity.income_period_start && result.income_period_end === identity.income_period_end;
  const resultBaseKey = outcome?.result ? outcome.baseKey : successful?.baseKey;
  const comparable = resultBaseKey === baseKey && matchesSelectedRules && !disabled ? result : undefined;
  const updating = submitted && !!request && !current && !disabled;
  const retained = submitted && !restoredNeedsReview && !current && matchesSelectedRules && !disabled ? result : undefined;
  const visibleResult = current?.result && matchesSelectedRules ? current.result : (comparable || retained ? { ...(comparable ?? retained)!, scenario: null } : undefined);
  const scenarioOnly = !!comparable && !!facts.scenario;
  const presentation: EstimatePresentation = { provenance, defaults: outcome?.result ? outcome.defaults : successful?.defaults, freshness: comparable && (facts.scenario || !issue && !current?.error) ? "current" : issue || current?.error ? "last" : updating ? "updating" : "current" };
  const formProps = { facts, selected, locale, focusPath, base: comparable?.base, onEditStep: (next: number) => {
    setAdjustmentsOpen(false); setMode("detailed"); if (next === 3) setAdjustmentsOpen(true); else setStep(next);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("#tax-v2-form-heading")?.focus());
  }, change: (patch: Partial<Facts>) => {
    const financialEdit = patch.aggregate !== undefined && patch.aggregate !== facts.aggregate
      || patch.categoryAmounts && Object.entries(patch.categoryAmounts).some(([key, amount]) => amount !== (facts.categoryAmounts?.[key] ?? "") && amount !== "")
      || patch.income && (patch.income.length < facts.income.length || patch.income.some((row) => row.amount !== "" && JSON.stringify(row) !== JSON.stringify(facts.income.find((previous) => previous.id === row.id))))
      || ["investments", "deductions", "credits"].some((key) => key in patch);
    if (financialEdit) setProvenance("personal");
    const resetCategoryScenario = patch.investmentMode && patch.investmentMode !== "itemized" && facts.scenario?.mode === "itemized";
    if (resetCategoryScenario) setMethodNotice(true);
    update({ ...facts, ...patch, ...(resetCategoryScenario ? { scenario: null, scenarioConfirmed: false } : {}) });
    if (!restoredNeedsReview) setSubmitted(true);
  } };

  useEffect(() => {
    if (!submitted || !request || disabled || completed.current === inputKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let refreshed: PublicConfig | undefined;
      try {
        const invalidate = () => { if (!controller.signal.aborted) { setSuccessful(undefined); setOutcome(undefined); } };
        const result = await calculateWithRevisionRefresh(request, controller.signal, (next) => {
          refreshed = next;
        }, invalidate);
        if (controller.signal.aborted) return;
        const key = String(attempt) + ":" + JSON.stringify({ ...request, assessment_year: result.assessment_year, purpose: "forward_planning", expected_ruleset_revision: result.revision_id });
        completed.current = key;
        const responseSelected = refreshed?.selected ?? selected;
        const responseBase = buildTaxRequest({ ...facts, scenario: null, scenarioConfirmed: false }, responseSelected, purpose, true).request;
        const responseBaseKey = responseBase ? JSON.stringify(responseBase) : "invalid-base";
        const responseDefaults = planningDefaults(facts, responseSelected);
        setOutcome({ key, baseKey: responseBaseKey, defaults: responseDefaults, result });
        setSuccessful({ baseKey: responseBaseKey, defaults: responseDefaults, result });
      } catch (error) {
        if (!controller.signal.aborted) {
          completed.current = inputKey;
          if (invalidatesTaxRules(error)) setSuccessful(undefined);
          setOutcome({ key: inputKey, baseKey, defaults, error });
        }
      } finally {
        // Invalidate the old amount immediately, then install any authoritative
        // refresh even if its retry fails. Committing here lets the single
        // revision retry finish without a config-driven effect aborting it.
        if (refreshed && !controller.signal.aborted) queryClient.setQueryData(configKey, refreshed);
      }
    }, immediateCalculation.current === inputKey ? 0 : 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [submitted, request, disabled, inputKey, baseKey, attempt, queryClient]);

  const edit = useCallback((path: string) => {
    if (!path.startsWith("scenario")) {
      setMode("detailed");
      const adjustment = stepForPath(path) === 3;
      setAdjustmentsOpen(adjustment);
      if (!adjustment) setStep(stepForPath(path));
    } else setAdjustmentsOpen(false);
    setFocusPath(path);
  }, []);
  const apiIssue = issueFromError(current?.error);
  const validations = submitted ? issues.length ? issues : issuesFromError(current?.error) : [];
  const validation = validations[0];
  const invalidPaths = JSON.stringify(validations.map((item) => item.path));
  useEffect(() => {
    const issue = issueFromError(current?.error);
    if (issue) edit(issue.path);
  }, [current?.error, edit]);
  useEffect(() => {
    if (focusPath === undefined) return;
    const frame = requestAnimationFrame(() => {
      if (!focusField(adjustmentsOpen ? document.querySelector<HTMLElement>("dialog") : root.current, focusPath)) root.current?.querySelector<HTMLElement>("#tax-v2-form-heading")?.focus();
      setFocusPath(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPath, adjustmentsOpen]);
  useEffect(() => {
    const paths = JSON.parse(invalidPaths) as string[];
    const scope = adjustmentsOpen ? document.querySelector<HTMLElement>("dialog") : root.current;
    const labels = [...(scope?.querySelectorAll<HTMLElement>("[data-path]") ?? [])];
    const restore: (() => void)[] = [];
    for (const path of paths) {
      const input = labels.find((element) => element.dataset.path === path)?.querySelector<HTMLElement>("input,select,textarea");
      if (!input) continue;
      const previousDescription = input.getAttribute("aria-describedby"), previousInvalid = input.getAttribute("aria-invalid");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", [previousDescription, "tax-v2-field-error"].filter(Boolean).join(" "));
      restore.push(() => {
        if (previousInvalid) input.setAttribute("aria-invalid", previousInvalid); else input.removeAttribute("aria-invalid");
        if (previousDescription) input.setAttribute("aria-describedby", previousDescription); else input.removeAttribute("aria-describedby");
      });
    }
    return () => restore.forEach((reset) => reset());
  }, [invalidPaths, step, mode, adjustmentsOpen]);

  const guideStep = useCallback((state: ProductGuideStepState) => {
    if (!state.active) {
      if (reachedGuideFinish.current) { reachedGuideFinish.current = false; setHelpOpen(true); }
      return;
    }
    if (state.stepId === "quick") setMode("quick");
    if (state.stepId === "detailed") { setMode("detailed"); setStep(0); }
    if (state.stepId === "finish") reachedGuideFinish.current = true;
  }, []);
  const year = selected.identity.assessment_year, revision = selected.identity.revision_id;
  function saveBrowserDraft() {
    if (!owner) return;
    try {
      writeDraft(window.localStorage, owner, year, purpose, revision, facts);
      setSavedRevision(revision);
      setDraftNotice(t("Draft saved on this browser for your account and active rules.", "এই ব্রাউজারে আপনার অ্যাকাউন্ট ও সক্রিয় নিয়মের জন্য খসড়া রাখা হয়েছে।"));
    } catch { setDraftNotice(t("Browser storage is unavailable.", "ব্রাউজারে সংরক্ষণ সম্ভব নয়।")); }
  }
  function restoreBrowserDraft() {
    if (!owner) return;
    let value: ReturnType<typeof readDraft>;
    try { value = readDraft(window.localStorage, owner, year, purpose); }
    catch { setDraftNotice(t("Browser storage is unavailable.", "ব্রাউজারে সংরক্ষণ সম্ভব নয়।")); return; }
    if (!value) { setDraftNotice(t("No saved draft for the active rules.", "সক্রিয় নিয়মের জন্য সংরক্ষিত খসড়া নেই।")); return; }
    update(value.facts);
    setProvenance("restored");
    setSavedRevision(value.revision);
    setMode("detailed");
    setStep(0);
    setSubmitted(false);
    setRestoredNeedsReview(true);
    setOutcome(undefined);
    setSuccessful(undefined);
    completed.current = undefined;
    setDraftNotice(t("Draft restored. Review the entries before calculating.", "খসড়া ফিরেছে। হিসাবের আগে তথ্য যাচাই করুন।"));
  }
  const labels = [t("Profile", "পরিচয়"), t("Income", "আয়"), t("Investments", "বিনিয়োগ")];
  const Step = steps[step];
  function runEstimate(scroll = false) {
    setRestoredNeedsReview(false);
    setSubmitted(true);
    immediateCalculation.current = String(attempt + 1) + ":" + JSON.stringify(request);
    setAttempt((value) => value + 1);
    if (issue) edit(issue.path);
    else if (scroll) requestAnimationFrame(() => root.current?.querySelector(".wealth-tax-results-region")?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }
  function chooseMode(next: "quick" | "detailed") {
    setMode(next); setStep(0);
  }
  function exploreSavings() {
    const simulator = root.current?.querySelector<HTMLElement>("#tax-planner-play-explore");
    simulator?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    simulator?.focus({ preventScroll: true });
  }
  const validationNotice = validations.length > 0 && <div id="tax-v2-field-error" role="alert" className={css.notice}>{validations.map((item, i) => <div key={item.path + ":" + i}><p>{fieldIssueText(item, locale)}</p><Button onClick={() => edit(item.path)}>{t("Go to the affected field", "সংশ্লিষ্ট ঘরে যান")}</Button></div>)}</div>;
  return <div className={css.stack} ref={root}>
    <TaxHero locale={locale} identity={selected.identity} rules={selected.rules} policies={selected.investment_policies} base={visibleResult?.base} />
    {provenance === "example" && <p className={css.exampleHint}>{t("Editable example · replace the salary with your yearly amount", "নমুনা হিসাব · নিজের বার্ষিক বেতন দিয়ে বদলে নিন")}</p>}
    {disabled && <p role="alert" className={css.notice}>{t("Estimates are temporarily unavailable. Your entries are kept in this tab.", "হিসাব সাময়িকভাবে পাওয়া যাচ্ছে না। এই ট্যাবে আপনার তথ্য থাকছে।")}</p>}
    <div className="wealth-tax-mode-segment" data-guide="tax-planner-mode">
      <span className="wealth-tax-mode-segment-label" id="tax-planner-mode-label">{t("Estimate mode", "হিসাবের ধরন")}</span>
      <div className="wealth-tax-mode-segment-track" role="tablist" aria-labelledby="tax-planner-mode-label" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "quick" : event.key === "End" ? "detailed" : mode === "quick" ? "detailed" : "quick";
        chooseMode(next);
        requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("#tax-planner-tab-" + next)?.focus());
      }}>
        <button type="button" role="tab" aria-controls="tax-planner-panel" id="tax-planner-tab-quick" aria-selected={mode === "quick"} tabIndex={mode === "quick" ? 0 : -1} className={mode === "quick" ? "wealth-tax-segment-active" : ""} data-guide="tax-planner-quick" onClick={() => chooseMode("quick")}><span aria-hidden="true">⚡</span> {t("Quick estimate", "দ্রুত হিসাব")}</button>
        <button type="button" role="tab" aria-controls="tax-planner-panel" id="tax-planner-tab-detailed" aria-selected={mode === "detailed"} tabIndex={mode === "detailed" ? 0 : -1} className={mode === "detailed" ? "wealth-tax-segment-active" : ""} data-guide="tax-planner-detailed" onClick={() => chooseMode("detailed")}><span aria-hidden="true">✦</span> {t("Detailed planner", "বিস্তারিত হিসাব")}</button>
      </div>
    </div>
    <p className={css.modeScope}>{mode === "quick" ? t("Quick: yearly totals. Resident individual · check special situations in Detailed.", "দ্রুত হিসাব: বছরের মোট অঙ্ক। নিবাসী ব্যক্তি করদাতা · বিশেষ পরিস্থিতি বিস্তারিত অংশে যাচাই করুন।") : t("Detailed: check supported income sources and Investment conditions. This is an annual estimate, not a filing-ready return.", "বিস্তারিত হিসাব: সমর্থিত আয়ের উৎস ও বিনিয়োগের শর্ত যাচাই করুন। এটি বার্ষিক অনুমান, দাখিলের জন্য প্রস্তুত রিটার্ন নয়।")}</p>
    <form noValidate className="wealth-tax-workspace-card wealth-panel" onSubmit={(event) => {
          event.preventDefault();
          runEstimate(true);
        }}>
          {mode === "quick" ? <div role="tabpanel" id="tax-planner-panel" aria-labelledby="tax-planner-tab-quick"><QuickForm {...formProps} openDetailed={() => chooseMode("detailed")} openInvestments={() => { chooseMode("detailed"); setStep(2); }} disabled={disabled} /></div> : <div className="wealth-tax-wizard" role="tabpanel" id="tax-planner-panel" aria-labelledby="tax-planner-tab-detailed">
            <ol className="wealth-tax-stepper" aria-label={t("Detailed planner steps", "বিস্তারিত হিসাবের ধাপ")}>{labels.map((label, i) =>
              <li className={`wealth-tax-step wealth-tax-step-${i === step ? "active" : "todo"}`} key={label}><button type="button" aria-current={i === step ? "step" : undefined} aria-label={(i + 1) + ". " + label} onClick={() => setStep(i)}><span className="wealth-tax-step-index">{i + 1}</span><span className="wealth-tax-step-label">{label}{validations.some((item) => stepForPath(item.path) === i) && <small>{t("Needs attention", "যাচাই প্রয়োজন")}</small>}</span></button></li>)}</ol>
            <div className="wealth-tax-step-body"><Step {...formProps} /></div>
            <div className="wealth-tax-wizard-nav">
              <button type="button" className="wealth-tax-back-button" disabled={!step} onClick={() => setStep(step - 1)}>{t("← Back", "← পেছনে")}</button>
              <button type={step === 2 ? "submit" : "button"} className="wealth-tax-next-button" disabled={disabled} onClick={step < 2 ? () => setStep(step + 1) : undefined}>{step === 2 ? t("Calculate estimate", "আনুমানিক হিসাব করুন") : t("Next →", "পরের ধাপ →")}</button>
            </div>
          </div>}
          {!adjustmentsOpen && validationNotice}
    </form>
    {methodNotice && <p role="status" className={css.notice}>{t("Category comparison reset because the counted Investment method changed. Your entered contributions are kept.", "হিসাবে ধরা Investment-এর পদ্ধতি বদলানোয় শ্রেণিভিত্তিক তুলনা ফিরিয়ে নেওয়া হয়েছে। দেওয়া জমার তথ্য রাখা আছে।")}</p>}
    {<InfoDialog title={t("Optional tax adjustments", "ঐচ্ছিক কর সমন্বয়")} compact open={adjustmentsOpen} onOpenChange={setAdjustmentsOpen}>
      <CreditsStep {...formProps} />{adjustmentsOpen && validationNotice}<Button onClick={() => { setAdjustmentsOpen(false); runEstimate(true); }}>{t("Apply adjustments", "সমন্বয় প্রয়োগ করুন")}</Button>
    </InfoDialog>}
    <div className="wealth-tax-results-region" data-guide="tax-planner-result" aria-busy={updating}>
        <p role="status" className={css.updateStatus}>{visibleResult && (updating || issue || current?.error) ? scenarioOnly ? t("Current estimate kept. The proposed comparison is updating or needs attention.", "বর্তমান হিসাব রাখা আছে। প্রস্তাবিত তুলনা হালনাগাদ হচ্ছে বা যাচাই প্রয়োজন।") : issue || current?.error ? t("Last calculated estimate · check the affected entry to update it.", "শেষ হিসাব করা ফল · হালনাগাদ করতে সংশ্লিষ্ট তথ্য যাচাই করুন।") : t("Updating estimate… Previous estimate shown until you pause typing.", "হিসাব হালনাগাদ হচ্ছে… লেখা থামানো পর্যন্ত আগের ফল দেখাবে।") : ""}</p>
        {!!current?.error && !apiIssue && visibleResult && <div role="alert" className={css.notice}><p>{scenarioOnly ? t("The proposed comparison is unavailable. Your current estimate is preserved.", "প্রস্তাবিত তুলনা পাওয়া যাচ্ছে না। বর্তমান হিসাব রাখা আছে।") : t("The estimate could not update. Your entries are preserved.", "হিসাব হালনাগাদ হয়নি। আপনার তথ্য রাখা আছে।")}</p><Button onClick={() => runEstimate()}>{t("Try again", "আবার চেষ্টা করুন")}</Button></div>}
        {visibleResult ? <PlannerResults result={visibleResult} rules={selected.rules} locale={locale} onEdit={edit} conditional={conditional} presentation={presentation} onExploreSavings={exploreSavings} /> : <>
          <TaxSnapshot locale={locale} rules={selected.rules} presentation={{ provenance }} state={disabled || current?.error ? "unavailable" : restoredNeedsReview ? "restored" : updating ? "pending" : "idle"} />
          <section aria-label={t("Tax estimate", "কর হিসাব")}>
            {submitted && request && !current && !disabled ? <p role="status">{t("Calculating using the active published rules…", "সক্রিয় প্রকাশিত নিয়মে হিসাব হচ্ছে…")}</p> :
              current?.error && !apiIssue ? <div role="alert" className={css.notice + " " + css.stack}>
                <p>{t("The estimate is unavailable. Your entries are preserved.", "হিসাব পাওয়া যাচ্ছে না। আপনার তথ্য থাকছে।")}</p>
                <div><Button onClick={() => setAttempt((value) => value + 1)}>{t("Try again", "আবার চেষ্টা করুন")}</Button></div>
              </div> : <p className={css.muted}>{t("Enter your facts to see the annual estimate and any available filing balance.", "বার্ষিক কর ও উপলভ্য দাখিলের বাকি কর দেখতে তথ্য দিন।")}</p>}
          </section></>}
    </div>
    <ScenarioForm {...formProps} asOf={config.as_of} calculate={() => runEstimate()} disabled={disabled || !comparable} base={comparable?.base} result={current?.result} pending={updating && !!facts.scenario} invalid={validations.some((item) => item.path.startsWith("scenario")) || !!current?.error} />
    {visibleResult && <TaxJourney result={visibleResult} locale={locale} incomeFacts={facts.income} rules={selected.rules} presentation={presentation} onExploreSavings={exploreSavings} />}
    {owner && <details className={css.browserDraft} open>
          <summary>{t("Browser draft", "ব্রাউজারে খসড়া")}</summary>
          <div className={css.row}><Button onClick={saveBrowserDraft}>{t("Save on this browser", "এই ব্রাউজারে সংরক্ষণ করুন")}</Button>
            <Button onClick={restoreBrowserDraft}>{t("Restore saved draft", "সংরক্ষিত খসড়া ফিরিয়ে আনুন")}</Button>
            <Button onClick={() => {
              try {
                window.localStorage.removeItem(draftKey(owner, year, purpose));
                setSavedRevision(undefined);
                setDraftNotice(t("Saved draft cleared. Current entries remain in this tab.", "সংরক্ষিত খসড়া মুছেছে। বর্তমান তথ্য এই ট্যাবে আছে।"));
              } catch { setDraftNotice(t("Browser storage is unavailable.", "ব্রাউজারে সংরক্ষণ সম্ভব নয়।")); }
            }}>{t("Clear saved draft", "সংরক্ষিত খসড়া সরান")}</Button></div>
          <div aria-live="polite">{draftNotice}</div>
          {savedRevision && savedRevision !== revision && <p className={css.notice}>{t("The rules changed since this draft was saved. Review the entries and recalculate.", "খসড়া রাখার পর নিয়ম বদলেছে। তথ্য দেখে আবার হিসাব করুন।")}</p>}
        </details>}
    <InfoDialog title={t("Official rules and help", "সরকারি নিয়ম ও সাহায্য")} subtitle={t("Your illustrated guide to this year’s tax rules", "এই বছরের করের নিয়ম সহজভাবে জানুন")} icon="✧" anchor="tax-planner-help" open={helpOpen} onOpenChange={setHelpOpen}>
      <PlannerGuide rules={selected.rules} identity={selected.identity} locale={locale} onStartTour={() => setHelpOpen(false)} />
    </InfoDialog>
    <TaxPlannerGuide locale={locale} onGuideStepChange={guideStep} />
  </div>;
}

