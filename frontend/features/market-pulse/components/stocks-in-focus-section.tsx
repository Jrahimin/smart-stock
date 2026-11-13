"use client";

import { getPulsePresentationLanguage } from "@/features/market-pulse/market-pulse-presentation-language";
import { MeasuredDecisionFacts } from "@/components/market/measured-decision-facts";
import { publishedSetupCondition } from "@/lib/market/published-setup-condition";


import { riskValueLabel, isDatedPlanGuidance } from "@/lib/market/decision-presentation";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
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
  return (
    <article className="pulse-focus-card">
      <div className="pulse-focus-card-header">
        <div className="pulse-focus-card-head">
          <span className="pulse-focus-rank">{stock.rank}</span>
          <div className="pulse-focus-identity">
            <strong title={stock.symbol}>{stock.symbol}</strong>
            <span title={stock.name}>{stock.name}</span>
            <SignalBadge signal={["POTENTIAL_BUY", "WAIT", "HOLD", "SELL"].includes(stock.recommendation ?? "") ? stock.recommendation as DecisionDisplayAction : null} locale={stock.locale ?? "en"} />
          </div>
        </div>
        <PulseScoreHeaderCluster breakdown={stock.scoreBreakdown} copy={scoreCopy} score={stock.pulseScore} />
      </div>

      <div className="pulse-focus-conviction">
        <small>{sharedDecisionDate ? language.forNewBuyers : stock.decisionContext}</small>
        <EntryApplicabilityLabel assessment={stock.entryApplicability} locale={stock.locale ?? "en"} policyReason={stock.controllingReason} />
        {stock.controllingReason && (!condition || !isDatedPlanGuidance(stock.controllingReasonCode)) ? <small>{stock.controllingReason}</small> : null}
      </div>
      {condition ? <div className="pulse-next-trigger"><small>{language.nextTrigger}</small><strong>{condition}</strong></div> : null}
      <MeasuredDecisionFacts facts={stock.measuredFacts} locale={stock.locale ?? "en"} ratings />
      <span className={`pulse-focus-label-badge pulse-focus-label-badge-${stock.labelTone}`}>{copy.label(stock.focusLabel)}</span>
      {stock.whyHere.length > 0 && <div className="pulse-focus-why-block">
        <span className="pulse-focus-why-label">{copy.whySelected}</span>
        <ul className="pulse-focus-reasons">{stock.whyHere.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>}
      <small>{scoreCopy.tradingRisk}: {riskValueLabel(stock.entryRiskLabel, stock.locale ?? "en")}</small>
      {stock.watchLevel != null && !condition ? <small>{copy.watchLevel}: {stock.watchLevel.toFixed(2)}</small> : null}

      <div className="pulse-focus-card-footer">
        <div className="pulse-focus-quote-values">
          {sharedQuoteDate ? <small>{language.closingPrice}</small> : stock.displayQuote ? <QuotePublicationLabel quote={stock.displayQuote} locale={stock.locale ?? "en"} /> : <small>{stock.locale === "bn" ? "সেশনের সমাপনী দর" : "Session close"} · {shortTradeDate(stock.decisionDate, stock.locale)}</small>}
          <span className="pulse-focus-price">{stock.latestPrice}</span>
          <span className={`pulse-focus-change pulse-focus-change-${stock.priceTone}`}>{stock.priceChangePercent}</span>
        </div>
        <MiniSparkline points={stock.sparklinePoints} tone={stock.priceTone} />
        <Link className="pulse-focus-detail-link" href={stock.href}>{stock.locale === "bn" ? "বিস্তারিত" : "Detail"} →</Link>
      </div>
    </article>
  );
}

type StocksInFocusSectionProps = {
  stocks: FocusStockModel[];
  stockCount?: number;
  isLoading?: boolean;
  usingMonitorFallback?: boolean;
  copy: MarketPulseLanguage["focus"];
  scoreCopy: MarketPulseLanguage["score"];
};

export function StocksInFocusSection({
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
              {usingMonitorFallback ? copy.titleMonitorFallback : copy.titleDefault}
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
            {stocks.map((stock) => (
              <FocusStockCard copy={copy} key={stock.stockId} scoreCopy={scoreCopy} sharedDecisionDate={sharedDate} sharedQuoteDate={sharedQuoteDate} stock={stock} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
