import type { BackendTopSetupDto } from "@/lib/api/backend-api-types";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";
import { dashboardEntryConditions } from "@/features/market-dashboard/terminal-copy";
import { decisionConditionLabel } from "@/lib/market/decision-presentation";
import Link from "next/link";
import { InfoPanel } from "@/components/ui/info-panel";

const setupNames: Record<string, string> = {BREAKOUT:"Breakout", PULLBACK:"Pullback", CONTINUATION:"Continuation", READY:"Entry setup"};

/** Render backend qualification. This component never grants entry permission. */
export function TopSetupSummary({setup, assessment, locale="en", compact=false, symbol, href, rowId}: {
  setup: BackendTopSetupDto; assessment?: EntryApplicabilityDto | null; locale?: AppLocale; compact?: boolean; symbol?: string; href?: string; rowId?: string;
}) {
  const bn = locale === "bn";
  const met = setup.readiness === "CONDITIONS_MET" && assessment?.status === "APPLICABLE" && assessment.assessed_at === setup.assessed_at && assessment.price_basis === setup.price_basis && ["CURRENT", "SNAPSHOT", "LAST_CLOSE"].includes(setup.price_basis ?? "");
  const price = (value: number) => `৳${value.toFixed(2)}`;
  const range = `${price(setup.entry_low)}–${price(setup.entry_high)}`;
  const type = setupNames[setup.setup_type] ?? "Setup";
  const conditional = setup.readiness === "CONDITIONAL_SETUP" || setup.readiness === "CONDITIONS_MET" && !met;
  const terminal = assessment?.status === "INVALIDATED" || assessment?.status === "EXPIRED";
  const action = terminal ? (assessment.status === "EXPIRED" ? "Plan expired" : "Plan invalidated") : met ? (bn ? "শেষ পর্যবেক্ষণে শর্ত পূরণ হয়েছে" : "Conditions met at the latest observation")
    : conditional ? (bn ? "WAIT · পরিকল্পনার entry condition দেখুন" : "WAIT · Review the defined entry condition")
    : setup.readiness === "WAIT_FOR_PRICE" ? (bn ? "WAIT · Entry range-এ ফেরার অপেক্ষা" : "WAIT · For the entry range")
    : (bn ? "WAIT · Confirmation-এর অপেক্ষা" : "WAIT · For confirmation");
  const condition = localizeEntryCondition(setup.condition, locale, dashboardEntryConditions[locale]);
  const support = setup.supporting_fact === "UPTREND" ? (bn ? "প্রবণতা ঊর্ধ্বমুখী" : "Established uptrend")
    : setup.supporting_fact === "MOMENTUM" && setup.supporting_value != null ? `Momentum · RSI ${setup.supporting_value.toFixed(1)}`
    : setup.supporting_fact === "VOLUME" && setup.supporting_value != null ? (bn ? `লেনদেন আগের 20 session-এর median-এর ${setup.supporting_value.toFixed(1)} গুণ` : `Volume ${setup.supporting_value.toFixed(1)}× prior 20-session median`)
    : setup.supporting_fact === "SUPPORT_ZONE" && setup.supporting_value != null ? (bn ? `Support ${price(setup.supporting_value)}-এর কাছে গঠন টিকে আছে` : `Structure holds near support ${price(setup.supporting_value)}`)
    : (bn ? "দামের গঠন ঊর্ধ্বমুখী" : "Constructive bullish structure");
  const counter = setup.counterargument_code === "PRICE_OUTSIDE_ZONE" ? (bn ? "দাম entry range-এর বাইরে।" : "Price is outside the entry range.")
    : setup.counterargument_code === "volatility_gap" ? (bn ? "Volatility ও gap পরিকল্পিত ক্ষতি বাড়াতে পারে।" : "Volatility and gaps can increase the planned loss.")
    : setup.counterargument_code === "overextension" ? (bn ? "দাম সাম্প্রতিক গড় থেকে বেশি দূরে।" : "Price is extended relative to its recent path.")
    : setup.counterargument_code === "category" ? (bn ? "Category-সংক্রান্ত trading risk বিবেচনা করুন।" : "Consider the category-related trading risk.")
    : setup.counterargument_code === "VOLUME" ? (bn ? "লেনদেনের পরিমাণ setup-এর দুর্বল দিক।" : "Participation is the setup’s weaker supporting factor.")
    : setup.counterargument_code === "MOMENTUM" ? (bn ? `Momentum দুর্বল${setup.counterargument_value != null ? ` · RSI ${setup.counterargument_value.toFixed(1)}` : ""}।` : `Momentum is a weaker factor${setup.counterargument_value != null ? ` · RSI ${setup.counterargument_value.toFixed(1)}` : ""}.`)
    : decisionConditionLabel(setup.counterargument_code, assessment, locale) || null;
  const basis = setup.price_basis === "LAST_CLOSE" ? (bn ? "Closing price" : "Closing price") : setup.price_basis === "SNAPSHOT" ? (bn ? "সর্বশেষ price batch" : "Latest price batch") : (bn ? "দামের পর্যবেক্ষণ" : "Price observation");
  const clock = setup.price_basis === "SNAPSHOT" ? setup.batch_fetched_at : setup.source_observed_at;
  const timestamp = clock ? new Date(clock).toLocaleString(bn ? "bn-BD" : "en-GB", {timeZone:"Asia/Dhaka", day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : setup.price_session_date;
  if (compact) {
    const shortState = terminal ? action : met ? "Conditions met" : "WAIT";
    const priceBlocker = assessment?.status === "OUTSIDE_ZONE" ? decisionConditionLabel(assessment.reason_code, assessment, locale) : null;
    const trigger = setup.setup_type === "BREAKOUT" && setup.trigger_price != null
      ? (bn ? `Close ${price(setup.trigger_price)}-এর ওপরে` : `Close above ${price(setup.trigger_price)}`)
      : setup.setup_type === "PULLBACK" ? (bn ? "Pullback · Entry range দেখুন" : "Pullback into entry range")
      : setup.setup_type === "CONTINUATION" ? (bn ? "Continuation · Entry range দেখুন" : "Continuation in entry range")
      : (bn ? "Entry range-এর শর্ত দেখুন" : "Review the entry range");
    return <div className="dashboard-setup-card setup-reference-row" role="row" id={rowId}>
      <div className="setup-stock-cell" role="rowheader"><div className="setup-symbol-line">{href ? <Link className="setup-symbol" href={href} prefetch={false} title={symbol}>{symbol}</Link> : <strong className="setup-symbol" title={symbol}>{symbol}</strong>}</div><span className="setup-trigger-line"><span className={`setup-action-pill ${met && !terminal ? "is-met" : ""}`}>{shortState}</span>{terminal ? (bn ? "Exit শর্ত দেখুন" : "Review exit conditions") : trigger}</span>{priceBlocker && !terminal ? <small className="top-setup-compact-blocker">{priceBlocker}</small> : null}</div>
      <div className="setup-price-cell" role="cell"><span className="setup-mobile-label">Entry zone · BDT</span>{setup.entry_low.toFixed(2)} <span aria-hidden="true">–</span> {setup.entry_high.toFixed(2)}</div>
      <div className="setup-price-cell setup-stop-cell" role="cell"><span className="setup-mobile-label">Stop · BDT</span>{setup.invalidation.toFixed(2)}</div>
      <div className="setup-risk-cell" role="cell"><span className={`setup-risk-dot risk-${setup.risk_label.toLowerCase()}`} aria-hidden="true"/><span className="setup-risk-value">{setup.risk_label === "MEDIUM" ? "Medium" : setup.risk_label === "LOW" ? "Low" : setup.risk_label === "HIGH" ? "High" : setup.risk_label}</span></div>
      <div className="setup-detail-cell" role="cell"><InfoPanel label={bn ? `${symbol ?? ""} setup-এর বিস্তারিত` : `${symbol ?? "Stock"} setup details`} title={`${symbol ?? "Setup"} · Trade Plan`} locale={locale} triggerContent={<span aria-hidden="true">ⓘ</span>} triggerClassName="setup-row-chevron"><TopSetupSummary setup={setup} assessment={assessment} locale={locale}/></InfoPanel></div>
      {met && !terminal ? <small className="setup-positive-context">{action} · {basis} · {timestamp}{setup.price_basis === "LAST_CLOSE" ? (bn ? " · পরের opening price আবার দেখুন।" : " · Reassess the next opening price.") : ""}</small> : null}
    </div>;
  }
  return <div className="top-setup-summary">
    <div className={`top-setup-action ${met ? "is-met" : ""}`}><strong>{action}</strong><span>{type}</span></div>
    <p className="top-setup-condition">{condition}</p>
    <small>{bn ? "Entry range" : "Entry range"} <b>{range}</b>{setup.trigger_price != null ? ` · Trigger ${price(setup.trigger_price)}` : ""}</small>
    {setup.confirmation_rule === "COMPLETED_PULLBACK_HOLD" && setup.confirmation_support != null ? <small>{bn ? `Entry-এর আগে সম্পূর্ণ session-এ support touch ও closing price ৳${setup.confirmation_support.toFixed(2)} ধরে থাকা প্রয়োজন।` : `Before entry, a completed session must touch the support zone and close at or above ৳${setup.confirmation_support.toFixed(2)}.`}</small> : null}
    <p className="top-setup-support"><span aria-hidden="true">✓</span> {support}</p>
    {met && timestamp ? <small className="top-setup-observation">{basis} · {timestamp}{setup.observation_price != null ? ` · ${price(setup.observation_price)}` : ""}</small> : null}
    {met && setup.price_basis === "LAST_CLOSE" ? <small className="top-setup-caveat">{bn ? "পরের session-এর opening price-এ entry উপযুক্ত কি না আবার দেখুন।" : "Reassess the next session’s opening price before entering."}</small> : null}
    {counter ? <small className="top-setup-caveat">{counter}</small> : null}
    <div className="top-setup-meta"><span>{bn ? "Invalidation" : "Invalidation"} <b>{price(setup.invalidation)}</b></span><span>Opportunity <b>{setup.opportunity_score}/100</b></span><span>Risk <b>{setup.risk_label}</b></span></div>
    <details className="top-setup-holder"><summary>{bn ? "আগে থেকেই শেয়ার থাকলে" : "Existing holders"}</summary><p>{setup.holder_guidance === "HOLD_NO_ADD" ? (bn ? "HOLD · নতুন করে না কিনে invalidation level দেখুন।" : "HOLD existing position; avoid adding at this price and monitor invalidation.") : setup.holder_guidance === "HOLD" ? (bn ? "HOLD · পরিকল্পনার invalidation ও exit শর্ত মেনে চলুন।" : "HOLD subject to the plan’s invalidation and exit conditions.") : (bn ? "REVIEW · বর্তমান অবস্থান ও exit শর্ত মিলিয়ে দেখুন।" : "REVIEW the position against its exit and invalidation conditions.")}</p></details>
  </div>;
}
