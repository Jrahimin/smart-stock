"use client";

import { TopSetupSummary } from "@/components/market/top-setup-summary";

import { getPulsePresentationLanguage } from "@/features/market-pulse/market-pulse-presentation-language";
import { MeasuredDecisionFacts } from "@/components/market/measured-decision-facts";
import { publishedSetupCondition } from "@/lib/market/published-setup-condition";


import { riskValueLabel, isDatedPlanGuidance } from "@/lib/market/decision-presentation";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { potentialBuyNextStep } from "@/lib/market/entry-assessment-presentation";
import { QuotePublicationLabel } from "@/components/ui/market-publication-label";
import { SignalBadge } from "@/components/ui/signal-badge";
import type { DecisionDisplayAction } from "@/lib/api/backend-api-types";
import Link from "next/link";
import { shortTradeDate, commonTradeDate } from "@/lib/formatters/trader-formatters";
import { Eye } from "lucide-react";

import type { FocusStockModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";
import { MiniSparkline, PulseScoreHeaderCluster } from "@/features/market-pulse/components/pulse-score-badge";

type FocusStockCardProps = {
  stock: FocusStockModel;
  copy: MarketPulseLanguage["focus"];
  scoreCopy: MarketPulseLanguage["score"];
  sharedDecisionDate?: string | null;
  sharedQuoteDate?: string | null;
};

export function FocusStockCard({ stock, copy, scoreCopy, sharedDecisionDate, sharedQuoteDate }: FocusStockCardProps) {
  const language = getPulsePresentationLanguage(stock.locale ?? "en");
  const condition = publishedSetupCondition(stock.measuredFacts, stock.entryApplicability, stock.locale ?? "en", stock.controllingReasonCode);
  const buyIdea = !stock.reviewOnly && stock.recommendation === "POTENTIAL_BUY" ? potentialBuyNextStep(stock.entryApplicability, stock.measuredFacts, stock.locale ?? "en", condition) : null;
  const reviewGuidance = stock.reviewOnly ? potentialBuyNextStep(stock.entryApplicability, stock.measuredFacts, stock.locale ?? "en").nextStep : null;
  const quoteDate = stock.displayQuote?.observation_session_date ?? stock.displayQuote?.as_of_trade_date;
  const quoteCaption = stock.displayQuote?.observation_status === "FINALIZED"
    ? language.closingPrice : stock.locale === "bn" ? "প্রাপ্ত দর" : "Reported price";
  return (
    <article className="pulse-focus-card" data-setup-tone={stock.reviewOnly || stock.topSetup?.readiness === "MARKET_WATCH" ? "watch" : stock.topSetup ? "plan" : undefined}>
      <div className="pulse-focus-card-header">
        <div className="pulse-focus-card-head">
          <span className="pulse-focus-rank">{stock.rank}</span>
          <div className="pulse-focus-identity">
            <strong title={stock.symbol}>{stock.symbol}</strong>
            <span title={stock.name}>{stock.name}</span>
            {!stock.topSetup && !stock.reviewOnly ? buyIdea ? <strong>{buyIdea.headline}</strong> : <SignalBadge signal={["POTENTIAL_BUY", "WAIT", "HOLD", "AVOID", "SELL"].includes(stock.recommendation ?? "") ? stock.recommendation as DecisionDisplayAction : null} locale={stock.locale ?? "en"} /> : null}
          </div>
        </div>
        {!stock.topSetup && !stock.reviewOnly ? <PulseScoreHeaderCluster breakdown={stock.scoreBreakdown} copy={scoreCopy} score={stock.pulseScore} /> : null}
      </div>

      {stock.reviewOnly ? <div className="top-setup-summary">
        <div className="top-setup-action"><strong>{stock.locale === "bn" ? "নজরে রাখুন" : "Watch"}</strong></div>
        <p className="top-setup-condition">{reviewGuidance}</p>
        <MeasuredDecisionFacts facts={stock.measuredFacts} locale={stock.locale ?? "en"} />
      </div> : stock.topSetup ? <TopSetupSummary setup={stock.topSetup} assessment={stock.entryApplicability} recommendation={stock.recommendation} locale={stock.locale ?? "en"} /> : <>
      <div className="pulse-focus-conviction">
        <small>{sharedDecisionDate ? language.forNewBuyers : stock.decisionContext}</small>
        {buyIdea ? <p>{buyIdea.nextStep}</p> : <EntryApplicabilityLabel assessment={stock.entryApplicability} locale={stock.locale ?? "en"} policyReason={stock.controllingReason} />}
        {stock.controllingReason && (!condition || !isDatedPlanGuidance(stock.controllingReasonCode)) ? <small>{stock.controllingReason}</small> : null}
      </div>
      {condition && !buyIdea ? <div className="pulse-next-trigger"><small>{language.nextTrigger}</small><strong>{condition}</strong></div> : null}
      <div className="pulse-focus-evidence">
        <MeasuredDecisionFacts facts={stock.measuredFacts} locale={stock.locale ?? "en"} ratings />
      </div>
      {stock.focusLabel !== "Potential Buy Setup" ? <span className={`pulse-focus-label-badge pulse-focus-label-badge-${stock.labelTone}`}>{copy.label(stock.focusLabel)}</span> : null}
      {stock.whyHere.length > 0 && <div className="pulse-focus-why-block">
        <span className="pulse-focus-why-label">{copy.whySelected}</span>
        <ul className="pulse-focus-reasons">{stock.whyHere.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>}
      <small className="pulse-focus-risk">{scoreCopy.tradingRisk}: <strong>{riskValueLabel(stock.entryRiskLabel, stock.locale ?? "en")}</strong></small>
      {stock.watchLevel != null && !condition ? <small>{copy.watchLevel}: {stock.watchLevel.toFixed(2)}</small> : null}

      </>}
      <div className="pulse-focus-card-footer">
        <div className="pulse-focus-quote-values">
          <span className="pulse-focus-price">{stock.latestPrice}</span>
          <QuotePublicationLabel quote={stock.displayQuote} locale={stock.locale ?? "en"} />
          {quoteDate && !sharedQuoteDate && stock.displayQuote?.observation_status !== "NO_TRADE" ? (
            <small>{quoteCaption} · {shortTradeDate(quoteDate, stock.locale)}</small>
          ) : null}
          <span className={`pulse-focus-change pulse-focus-change-${stock.priceTone}`}>{stock.priceChangePercent}</span>
        </div>
        <MiniSparkline points={stock.sparklinePoints} tone={stock.priceTone} />
        <Link aria-label={stock.locale === "bn" ? `${stock.symbol}-এর বিস্তারিত দেখুন` : `View ${stock.symbol} details`} className="pulse-focus-detail-link" href={stock.href}>{stock.locale === "bn" ? "শেয়ার দেখুন" : "View stock"} <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  );
}

type StocksInFocusSectionProps = {
  locale?: import("@/lib/locale/app-locale").AppLocale;
  stocks: FocusStockModel[];
  stockCount?: number;
  isLoading?: boolean;
  usingMonitorFallback?: boolean;
  copy: MarketPulseLanguage["focus"];
  scoreCopy: MarketPulseLanguage["score"];
};

export function StocksInFocusSection({
  locale = "en",
  stocks,
  stockCount = stocks.length,
  isLoading = false,
  usingMonitorFallback = false,
  copy,
  scoreCopy,
}: StocksInFocusSectionProps) {
  const language = getPulsePresentationLanguage(stocks[0]?.locale ?? "en");
  const sharedDate = commonTradeDate(stocks.map((stock) => stock.decisionDate));
  const sharedQuoteDate = sharedDate && stocks.every((stock) => stock.displayQuote?.observation_status === "FINALIZED" && stock.displayQuote.as_of_trade_date === sharedDate && stock.displayQuote.observation_session_date === sharedDate) ? sharedDate : null;
  const skeletonCount = Math.max(stockCount, 3);
  const gridClass =
    stockCount > 0
      ? `pulse-focus-equal-grid pulse-focus-equal-grid-count-${Math.min(stockCount, 5)}`
      : "pulse-focus-equal-grid";

  return (
    <section className="pulse-section pulse-focus-section" aria-labelledby="pulse-focus-heading">
      <div className="pulse-focus-shell-card">
        <div className="pulse-section-head">
          <div>
            <p className="pulse-section-eyebrow">
              <Eye aria-hidden="true" size={16} />
              {copy.eyebrow}
            </p>
            <h2 id="pulse-focus-heading">
              {copy.titleDefault}
            </h2>
            {sharedDate ? <small className="pulse-shared-date">{sharedQuoteDate ? language.analysisAndClose : language.analysis} · {shortTradeDate(sharedDate, stocks[0]?.locale)}</small> : null}
          </div>
          <Link className="pulse-section-link" href="/scanner">
            {copy.viewAll}
          </Link>
        </div>

        {isLoading ? (
          <div className={`${gridClass} pulse-focus-equal-grid-loading`}>
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <div className="pulse-skeleton pulse-skeleton-card" key={index} />
            ))}
          </div>
        ) : (
          <div className={gridClass}>
            {!stocks.length ? <p className="sw-state">{locale === "bn" ? "এই মুহূর্তে উপযুক্ত setup নেই।" : "No qualified setups at the moment."}</p> : null}
            {stocks.map((stock) => (
              <FocusStockCard copy={copy} key={stock.stockId} scoreCopy={scoreCopy} sharedDecisionDate={sharedDate} sharedQuoteDate={sharedQuoteDate} stock={stock} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
