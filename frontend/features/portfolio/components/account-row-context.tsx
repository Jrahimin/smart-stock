"use client";

import React from "react";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { QuoteObservationTimes } from "@/components/ui/quote-observation-times";
import Link from "next/link";
import { QuotePublicationLabel } from "@/components/ui/market-publication-label";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import { accountQuoteForPrice, financialTone, formatPortfolioMoney, formatSignedPercent, getPortfolioWhatNextCopy, portfolioRowAction, portfolioRowComparison } from "@/features/portfolio/view-models/portfolio-view-model";
import type { BackendPortfolioHoldingDto } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { controllingReasonLabel } from "@/lib/market/decision-presentation";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

export function AccountMarketCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const quote = accountQuoteForPrice(item);
  const hasChange = quote && (item.price_status === "FINALIZED" || item.price_status === "PROVISIONAL");
  return <div className="portfolio-market-cell">
    <strong>{formatPortfolioMoney(item.current_price, locale)}</strong>
    {hasChange && item.price_change_percent != null && <small className={`is-${financialTone(item.price_change_percent)}`}>{formatSignedPercent(item.price_change_percent)}</small>}
    <details className="portfolio-mark-detail">
      <summary>{t.priceStatus[item.price_status]}{item.latest_trade_date ? ` · ${shortTradeDate(item.latest_trade_date, locale)}` : ""}</summary>
      <div>
        {quote && <QuoteObservationTimes quote={quote} locale={locale} />}
        {item.previous_close != null && <small>{t.previousClose}: {formatPortfolioMoney(item.previous_close, locale)}</small>}
      </div>
    </details>
  </div>;
}

export function AccountDecisionCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const action = portfolioRowAction(item);
  const pair = portfolioRowComparison(item);
  const reason = item.is_holding
    ? getPortfolioWhatNextCopy(item, t, locale)
    : controllingReasonLabel(item.primary_reason_code, "", locale);
  return <div className="portfolio-signal portfolio-signal-v2 portfolio-account-decision">
    <small className="portfolio-audience">{item.is_holding ? t.holderInstruction : t.datedAction}{item.decision_session_date ? ` · ${shortTradeDate(item.decision_session_date, locale)}` : ""}</small>
    <span className={`portfolio-status ${action ? `action-${action.toLowerCase()}` : "action-updating"}`}>{action ? t.actionLabels[action] : t.signalUnavailable}</span>
    {reason && <p>{reason}</p>}
    {pair?.status === "CHANGED" ? <details className="portfolio-comparison"><summary>{t.comparisonChanged}</summary>
      <small>{pair.previous_session_date}: {t.actionLabels[pair.previous_action!]} → {t.actionLabels[pair.current_action!]}</small>
    </details> : null}
    {!item.is_holding && item.scanner_conditions[0] && t.reasonLabels[item.scanner_conditions[0]] && <small>{t.reasonLabels[item.scanner_conditions[0]]}</small>}
    <Link className="portfolio-detail-link" href={buildStockDetailPath(item.exchange, item.symbol)}>{t.stockDetails}</Link>
  </div>;
}
