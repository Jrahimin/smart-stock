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
  const rows = state ? [] : signals.slice(0, 3);
  const signalCopy = getDashboardLanguage(locale).signals;
  const waitGroups = new Map<string, { text: string; rows: SignalFeedItemModel[] }>();
  for (const signal of rows) {
    if (signal.signal !== "WAIT") continue;
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
        <h2 className="sw-section-title" id="sw-signals-title">Smart Signals</h2>
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
        const condition = sharedWait ? evidence || copy.evidenceUnavailable : entry || signal.reason;
        return <tr id={index === 0 ? "sw-signal-example" : undefined} key={signal.symbol + "-" + signal.signal} role="row">
          <th scope="row" role="rowheader"><Link href={signal.href} prefetch={false}>{signal.symbol}</Link></th>
          <td role="cell"><span className={"sw-action sw-action-" + signal.signal}>{copy.actions[signal.signal]}</span></td>
          <td role="cell" aria-describedby={sharedWait ? "sw-signal-context" : undefined}>
            {condition?.trim() || copy.conditionUnavailable}
            {entry && evidence ? <small className="sw-signal-evidence">{evidence}</small> : null}
          </td>
          <td role="cell">{copy.risks[risk] ?? copy.missing}</td>
        </tr>;
      })}</tbody>
    </table> : <p className={unavailable ? "sw-state sw-signals-unavailable" : "sw-state"} role={loading || unavailable ? "status" : undefined}>{state}</p>}
  </section>;
});
