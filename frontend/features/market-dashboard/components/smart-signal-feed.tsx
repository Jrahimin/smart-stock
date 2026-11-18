import { TopSetupSummary } from "@/components/market/top-setup-summary";
import { decisionConditionLabel, riskValueLabel } from "@/lib/market/decision-presentation";
import { isInternalFreshnessReason } from "@/lib/market/market-presentation-policy";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { MeasuredDecisionFacts } from "@/components/market/measured-decision-facts";
import { PublishedSetupCondition } from "@/components/market/published-setup-condition";
import { publishedSetupCondition } from "@/lib/market/published-setup-condition";
import { isDatedPlanGuidance, controllingReasonLabel, selectedDecisionExplanation } from "@/lib/market/decision-presentation";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { potentialBuyNextStep } from "@/lib/market/entry-assessment-presentation";
import Link from "next/link";
import { memo } from "react";

import { DecisionPublicationLabel, type DecisionPublication } from "@/components/ui/market-publication-label";
import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { dashboardEntryConditions, getTerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";
import { buildLocalizedSignalSupportingContext, resolveDecisionReasonSummary } from "@/lib/market/trader-decision-reason";

type SmartSignalFeedProps = {
  signals: SignalFeedItemModel[];
  decision?: DecisionPublication;
  locale?: AppLocale;
  loading?: boolean;
  warmingUp?: boolean;
  error?: boolean;
};

export const SmartSignalFeed = memo(function SmartSignalFeed({
  signals, decision, locale = DEFAULT_LOCALE, loading = false, warmingUp = false, error = false,
}: SmartSignalFeedProps) {
  const copy = getTerminalCopy(locale);
  const unavailable = !loading && ((error && !signals.length) || decision?.decision_status === "UNAVAILABLE");
  const state = loading ? copy.loading : error && !signals.length ? copy.signalsUnavailable
    : decision?.decision_status === "UNAVAILABLE" ? copy.signalsUnavailable
    : warmingUp && !signals.length ? copy.signalsUpdating : !signals.length ? copy.signalsEmpty : null;
  const rows = state ? [] : signals.slice(0, 5);
  const heading = locale === "bn" ? "নজরে রাখার মতো শেয়ার" : "Top setups to watch";
  if (rows.length && rows.every(signal => signal.topSetup || signal.reviewOnly)) {
    const plans = rows.filter(row => row.topSetup).length;
    const review = rows.length - plans;
    const allPotentialBuy = !review && rows.every(row => row.signal === "POTENTIAL_BUY" &&
      row.entryApplicability?.status !== "EXPIRED" && row.entryApplicability?.status !== "INVALIDATED");
    const count = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD").format(rows.length);
    const label = allPotentialBuy
      ? locale === "bn" ? `Potential Buy · ${count}টি` : `${count} Potential Buy ${rows.length === 1 ? "idea" : "ideas"}`
      : locale === "bn" ? `নজরে ${count}টি` : `${count} to watch`;
    const note = review
      ? locale === "bn" ? `${plans.toLocaleString("bn-BD")}টি পরিকল্পনা · ${review.toLocaleString("bn-BD")}টির যাচাই বাকি`
        : `${plans} ${plans === 1 ? "plan" : "plans"} · ${review} to review`
      : locale === "bn" ? "কেনার আগে প্রতিটির শর্ত দেখুন" : "Check the entry condition for each stock";
    return <section className="sw-signals setup-reference-panel" aria-labelledby="sw-signals-title" aria-busy={loading}>
      <div className="sw-section-head" data-guide="smart-signals" data-guide-extent="sw-signal-example"><div className="sw-section-heading"><h2 id="sw-signals-title" className="sw-section-title">{heading}</h2><DecisionPublicationLabel decision={decision} locale={locale} /></div><Link className="sw-section-link" href="/signals" prefetch={false}>{copy.signalCenter} ↗</Link></div>
      <p className="setup-reference-summary"><span aria-hidden="true"/><strong>{label}</strong><span className="setup-reference-summary-note">{note}</span></p>
      <div className="setup-reference-table" role="table" aria-label={heading}>
        <div className="setup-reference-columns" role="row">
          <span role="columnheader">{copy.stock}</span>
          <span role="columnheader">{locale === "bn" ? "কেনার শর্ত" : "Entry condition"}</span>
          <span role="columnheader">{locale === "bn" ? "দরসীমা ও স্টপ (৳)" : "Entry range & stop (৳)"}</span>
          <span role="columnheader">{copy.risk}</span>
          <span role="columnheader" className="sr-only">{locale === "bn" ? "বিস্তারিত" : "Details"}</span>
        </div>
        <div role="rowgroup">{rows.map((signal, index) => {
          const rowId = index === 0 ? "sw-signal-example" : undefined;
          if (signal.topSetup) return <TopSetupSummary key={signal.symbol} setup={signal.topSetup} assessment={signal.entryApplicability} recommendation={signal.signal} locale={locale} compact symbol={signal.symbol} href={signal.href} rowId={rowId} />;
          const guidance = potentialBuyNextStep(signal.entryApplicability, signal.measuredFacts, locale).nextStep;
          return <div key={signal.symbol} id={rowId} role="row" className="dashboard-setup-card setup-reference-row">
            <div className="setup-stock-cell" role="rowheader">
              <Link className="setup-symbol" href={signal.href} prefetch={false} title={signal.symbol}>{signal.symbol}</Link>
              <span className="setup-action-pill">{locale === "bn" ? "নজরে রাখুন" : "Watch"}</span>
            </div>
            <div className="setup-trigger-line" role="cell">{guidance}</div>
            <div className="setup-price-cell" role="cell" aria-label={locale === "bn" ? "কেনার দর যাচাই হয়নি" : "Entry levels unverified"}>—</div>
            <div className="setup-risk-cell" role="cell">{riskValueLabel(signal.risk, locale)}</div>
            <div className="setup-detail-cell" role="cell" />
          </div>;
        })}</div>
      </div>
    </section>;
  }
  const signalCopy = getDashboardLanguage(locale).signals;
  const waitGroups = new Map<string, { text: string; rows: SignalFeedItemModel[] }>();
  for (const signal of rows) {
    if (signal.signal !== "WAIT") continue;
    if (isInternalFreshnessReason(signal.reasonKey) || isInternalFreshnessReason(signal.reasonCode)) continue;
    const text = signal.reasonKey === "data_not_eligible" ? copy.sharedWait
      : signal.reasonKey === "stale_sparse_data" ? copy.sharedStaleWait
        : resolveDecisionReasonSummary({ key: signal.reasonKey, params: signal.reasonParams, rawReason: signal.reasonSummary }, signalCopy.decisionReasons);
    if (!text.trim()) continue;
    const key = signal.reasonKey + ":" + text;
    const group = waitGroups.get(key);
    if (group) group.rows.push(signal);
    else waitGroups.set(key, { text, rows: [signal] });
  }
  const shared = Array.from(waitGroups.values()).find((group) => group.rows.length > 1);
  const allShareWait = shared?.rows.length === rows.length;

  return <section className="sw-signals" aria-labelledby="sw-signals-title" aria-busy={loading}>
    <div className="sw-section-head" data-guide="smart-signals" data-guide-extent="sw-signal-example">
      <div className="sw-section-heading">
        <h2 className="sw-section-title" id="sw-signals-title">{heading}</h2>
        <DecisionPublicationLabel decision={decision} locale={locale} />
      </div>
      <Link className="sw-section-link" href="/signals" prefetch={false}>{copy.signalCenter} <span aria-hidden="true">→</span></Link>
    </div>
    {shared ? <p className="sw-signal-note" id="sw-signal-context">
      {!allShareWait ? <strong>{shared.rows.map((signal) => signal.symbol).join(", ")}: </strong> : null}{shared.text}
    </p> : null}
    {rows.length ? <table className="sw-signal-table" role="table">
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">{copy.stock}</th><th scope="col" role="columnheader">{copy.decision}</th>
        <th scope="col" role="columnheader">{allShareWait ? copy.evidence : copy.condition}</th><th scope="col" role="columnheader">{copy.risk}</th>
      </tr></thead>
      <tbody role="rowgroup">{rows.map((signal, index) => {
        const risk = signal.risk.toUpperCase() as keyof typeof copy.risks;
        const { rsi, volumeRatio } = signal.technicalContext;
        const evidence = buildLocalizedSignalSupportingContext({ rsi, volumeRatio }, signalCopy).join(" · ");
        const sharedWait = shared?.rows.includes(signal);
        const entry = signal.signal === "POTENTIAL_BUY" && signal.entryCondition
          ? localizeEntryCondition(signal.entryCondition, locale, dashboardEntryConditions[locale]) : null;
        const selected = selectedDecisionExplanation(signal.decisionSummary, locale);
        const policy = decisionConditionLabel(signal.reasonCode, signal.entryApplicability, locale, signal.decisionSummary?.eligibility_reason_codes);
        const buyIdea = signal.signal === "POTENTIAL_BUY" ? potentialBuyNextStep(signal.entryApplicability, signal.measuredFacts, locale,
          publishedSetupCondition(signal.measuredFacts, signal.entryApplicability, locale, signal.reasonCode) ?? entry) : null;
        const internalReason=isInternalFreshnessReason(signal.reasonCode)||isInternalFreshnessReason(signal.reasonKey);
        const condition = signal.decisionSummary ? policy || selected.limitation : sharedWait ? evidence || copy.evidenceUnavailable : entry ? `${locale === "bn" ? "প্রকাশিত শর্ত" : "Dated condition"}: ${entry}` : signal.reason;
        return <tr id={index === 0 ? "sw-signal-example" : undefined} key={signal.symbol + "-" + signal.signal} role="row">
          <th scope="row" role="rowheader"><Link href={signal.href} prefetch={false}>{signal.symbol}</Link>{signal.decisionDate && signal.decisionDate !== decision?.decision_session_date ? <small>{shortTradeDate(signal.decisionDate, locale)}</small> : null}</th>
          <td role="cell"><span className={"sw-action sw-action-" + (buyIdea?.terminal ? "WAIT" : signal.signal)}>{buyIdea?.headline ?? (signal.signal ? copy.actions[signal.signal] : copy.missing)}</span></td>
          <td role="cell" aria-describedby={sharedWait ? "sw-signal-context" : undefined}>
            {signal.topSetup ? <TopSetupSummary setup={signal.topSetup} assessment={signal.entryApplicability} recommendation={signal.signal} locale={locale} /> : buyIdea ? <>
            <p>{buyIdea.nextStep}</p>
            {!signal.measuredFacts && entry && evidence ? <small className="sw-signal-evidence">{evidence}</small> : null}
            </> : <>
            {internalReason ? null : sharedWait ? signal.measuredFacts ? null : evidence || copy.evidenceUnavailable : isDatedPlanGuidance(signal.reasonCode) ? null : policy || condition?.trim() || copy.conditionUnavailable}
            {signal.entryApplicability?.status !== "UNVERIFIED" ? <EntryApplicabilityLabel assessment={signal.entryApplicability} locale={locale} policyReason={policy} /> : null}
            <PublishedSetupCondition facts={signal.measuredFacts} assessment={signal.entryApplicability} locale={locale} reasonCode={signal.reasonCode} />
            <MeasuredDecisionFacts facts={signal.measuredFacts} locale={locale} />
            {!signal.measuredFacts ? (signal.decisionSummary && selected.support ? <small className="sw-signal-evidence">{selected.support}</small> : entry && evidence ? <small className="sw-signal-evidence">{evidence}</small> : null) : null}
            </>}
          </td>
          <td role="cell">{copy.risks[risk] ?? copy.missing}</td>
        </tr>;
      })}</tbody>
    </table> : <p className={unavailable ? "sw-state sw-signals-unavailable" : "sw-state"} role={loading || unavailable ? "status" : undefined}>{state}</p>}
  </section>;
});
