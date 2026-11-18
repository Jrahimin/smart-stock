import { DashboardInfoPanel } from "./dashboard-info-panel";
import Link from "next/link";
import { getPremiumCopy } from "../premium-copy";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import hero from "./market-overview.module.css";

import { sectorName, marketHeadline, breadthContrast, type TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";
import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";
import { formatPercent } from "@/lib/formatters/financial-formatters";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getTraderJourneyLanguage } from "@/lib/market/trader-journey-language";

const dhakaDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });

function Metric({ label, children, note, guide }: { label: string; children: ReactNode; note?: ReactNode; guide?: string }) {
  return <div className="sw-metric" data-guide={guide}>
    <dt>{label}</dt><dd>{children}{note ? <small>{note}</small> : null}</dd>
  </div>;
}

export function MarketOverview({ model, copy, locale, freshness, loading, leadersLoading }: {
  model: MarketDashboardModel; copy: TerminalCopy; locale: AppLocale;
  freshness?: BackendMarketFreshnessDto; loading: boolean; leadersLoading: boolean;
}) {
  const { pulse, breadth, session } = model;
  const premium = getPremiumCopy(locale);
  const journeyCopy = getTraderJourneyLanguage(locale);
  const hasDate = pulse.tradeDateStatus === "available";
  const stale = session.state === "STALE" || freshness?.data_state === "STALE";
  const previousValue = useRef<string | null>(null);
  const [valueUpdated, setValueUpdated] = useState(false);
  useEffect(() => {
    setValueUpdated(false);
    if (loading || !pulse.indexAvailable) return;
    const changed = previousValue.current !== null && previousValue.current !== pulse.indexValue;
    previousValue.current = pulse.indexValue;
    if (!changed || stale || session.state !== "OPEN") return;
    setValueUpdated(true);
    const timer = window.setTimeout(() => setValueUpdated(false), 750);
    return () => window.clearTimeout(timer);
  }, [loading, pulse.indexAvailable, pulse.indexValue, session.state, stale]);
  const tradeDate = hasDate ? new Date(`${pulse.latestTradeDate}T00:00:00+06:00`) : null;
  const leader = pulse.leadingSector;
  const turnover = pulse.turnoverContext;
  const volume = pulse.volumeContext;
  const count = new Intl.NumberFormat("en-BD");
  const sessionSummary = breadth.total > 0 ? locale === "bn"
    ? `${count.format(breadth.advancing)}টি শেয়ার বেড়েছে, ${count.format(breadth.declining)}টি কমেছে।`
    : `${count.format(breadth.advancing)} stocks rose and ${count.format(breadth.declining)} fell.` : null;
  const indexDateDiffers = pulse.indexTradeDate && pulse.indexTradeDate !== pulse.latestTradeDate;
  const activityDateDiffers = pulse.activityTradeDate && pulse.activityTradeDate !== pulse.latestTradeDate;
  const context = [sessionSummary,breadthContrast(model,locale)].filter(Boolean).join(" ");
  const pulseDescription = locale === "bn" ? "খাতের অগ্রগতি ও বাজারের চিত্র দেখুন।" : "Sector leaders and session context.";
  const breadthParts = [[copy.up, breadth.advancing, "positive"], [copy.flat, breadth.unchanged, "neutral"], [copy.down, breadth.declining, "negative"]] as const;
  const dayStats = pulse.indexDayStats ? [
    [copy.dayOpen, pulse.indexDayStats.open], [copy.dayHigh, pulse.indexDayStats.high], [copy.dayLow, pulse.indexDayStats.low],
  ] : [];
  const returns = [pulse.indexPerformance.oneMonth, pulse.indexPerformance.sixMonth, pulse.indexPerformance.oneYear];
  const hasReturns = returns.some(value => value !== "N/A");

  return <section className={`sw-hero ${hero.hero}`} aria-label={copy.overview} aria-busy={loading}>
    <div className="sw-hero-main" data-guide="market-pulse" data-guide-ready={String(!loading)}>
      <div className="sw-index-stack"><div className="sw-index">
        <span>{pulse.indexName}</span>
        <strong data-updated={valueUpdated} className={pulse.indexAvailable ? "sw-index-value" : "sw-index-value sw-index-missing"}>{loading ? "…" : pulse.indexAvailable ? pulse.indexValue : copy.indexMissing}</strong>
        {pulse.indexAvailable && pulse.indexChangePercent !== null ? (
          <b className={`sw-${Math.abs(pulse.indexChangePercent) < 0.005 ? "neutral" : pulse.indexTone}`}>
            {Math.abs(pulse.indexChangePercent) < 0.005 ? (locale === "bn" ? "প্রায় অপরিবর্তিত" : "Nearly flat") : pulse.indexChangeLabel}
          </b>
        ) : null}
      </div>
      {indexDateDiffers ? <small className="sw-index-date">{locale === "bn" ? "সূচক" : "Index"} · {shortTradeDate(pulse.indexTradeDate, locale)}</small> : null}
      <div className="sw-index-details"><DashboardInfoPanel label={copy.indexDetails} title={locale === "bn" ? "DSEX এক নজরে" : "DSEX at a glance"} locale={locale}>
        <div className="sw-index-detail-content">
          {pulse.indexAvailable ? <>
            {dayStats.length > 0 && <dl className="sw-index-detail-grid">
              {dayStats.map(([label, value]) => <Metric key={label} label={label}><strong>{value === "N/A" ? "—" : value}</strong></Metric>)}
            </dl>}
            {hasReturns && <section aria-label={locale === "bn" ? "সূচকের পরিবর্তন" : "Index returns"}>
              <h4>{locale === "bn" ? "সূচকের পরিবর্তন" : "Index returns"}</h4>
              <dl className="sw-index-detail-grid">
                {returns.map((value, index) => <Metric key={copy.returns[index]} label={copy.returns[index]}>
                  <strong className={value.startsWith("-") ? "sw-negative" : value.startsWith("+") ? "sw-positive" : "sw-neutral"}>
                    {value === "N/A" ? <span title={locale === "bn" ? "তথ্য নেই" : "Unavailable"}>—</span> : value}
                  </strong>
                </Metric>)}
              </dl>
            </section>}
            {pulse.indexRange && <dl><Metric label={copy.range}>
              <strong>{pulse.indexRange.lowLabel} – {pulse.indexRange.highLabel}</strong>
              <div className="sw-range" aria-hidden="true"><i style={{ left: `${pulse.indexRange.positionPercent}%` }} /></div>
            </Metric></dl>}
            {!dayStats.length && !hasReturns && !pulse.indexRange &&
              <p>{locale === "bn" ? "বিস্তারিত সূচক তথ্য নেই।" : "Index range and returns are unavailable."}</p>}
          </> : <p>{loading ? copy.loading : copy.indexMissing}</p>}
        </div>
      </DashboardInfoPanel></div>
      </div>
      <div className="sw-hero-story">
        <div className="sw-session">
          {tradeDate && Number.isFinite(+tradeDate) ? <time dateTime={pulse.latestTradeDate}>{locale === "bn" ? "কার্যদিবস" : "Session"} · {dhakaDate.format(tradeDate)}</time> : null}
        </div>
        <h1>{loading ? copy.loading : marketHeadline(model, locale)}</h1>
        {!loading && context ? <p className="sw-hero-context">{context}</p> : null}
      </div>
      <div className={hero.artwork} aria-hidden="true">
        <Image src="/dashboard/market-candlesticks-lens.webp" width={900} height={450} sizes="(max-width: 1100px) 160px, 260px" alt="" priority />
      </div>
    </div>
    <dl className="sw-metrics">
      <Metric label={copy.breadth} guide="market-breadth">
        {breadth.total > 0 ? <>
          <div className="sw-breadth-labels">{breadthParts.map(([label, count, tone]) => <span className={`sw-${tone}`} key={tone}><b>{count}</b> {label}</span>)}</div>
          <div className="sw-breadth-bar" aria-hidden="true">{breadthParts.map(([, count, tone]) => <span key={tone} className={`sw-${tone}`} style={{ flexGrow: count }} />)}</div>
        </> : <strong>{loading ? "…" : copy.missing}</strong>}
      </Metric>
      <Metric label={copy.turnover} note={turnover.vsYesterday !== "N/A" ? `${turnover.vsYesterday} ${copy.vsPrevious}` : null}>
        <strong>{loading ? "…" : turnover.primaryValue === "N/A" ? copy.missing : turnover.primaryValue}</strong>
        {activityDateDiffers && <small>{shortTradeDate(pulse.activityTradeDate, locale)}</small>}
      </Metric>
      <Metric label={copy.volume} note={!loading && volume.primaryValue !== "N/A" ? volume.ratioVsAvg === "N/A" ? copy.noAverage : `${volume.ratioVsAvg.replace("x", "×")} ${volume.priorAverageSessions === undefined ? copy.versusAverage : copy.priorAverage(volume.priorAverageSessions)}` : null}>
        <strong>{loading ? "…" : volume.primaryValue === "N/A" ? copy.missing : volume.primaryValue.replace(/shares/i, copy.shares)}</strong>
        {activityDateDiffers && <small>{shortTradeDate(pulse.activityTradeDate, locale)}</small>}
      </Metric>
      <Metric label={copy.sectorLeader}>
        {leader ? <strong>{sectorName(leader.name, locale)} <b className={`sw-${leader.changePercent > 0 ? "positive" : leader.changePercent < 0 ? "negative" : "neutral"}`}>{formatPercent(leader.changePercent)}</b></strong>
          : <strong>{loading || leadersLoading ? "…" : pulse.leadersContext.leadershipStatus === "NO_ADVANCING_SECTOR" ? journeyCopy.noAdvancingSector : journeyCopy.sectorUnavailable}</strong>}
        {Boolean(pulse.leadersContext.excludedSectorCount) && <small>{journeyCopy.excludedSectors(pulse.leadersContext.excludedSectorCount!)}</small>}
      </Metric>
    </dl>
    <div className="sw-hero-actions" aria-label={locale === "bn" ? "আরও ঘুরে দেখুন" : "Explore workspaces"}>
      <Link aria-labelledby="sw-pulse-title" aria-describedby="sw-pulse-description" className="sw-pulse-entry" data-guide="market-pulse-link" href="/market-pulse" prefetch={false}>
        <span className="sw-pulse-copy">
          <small className="sw-destination-eyebrow">{premium.pulseEyebrow}</small>
          <strong id="sw-pulse-title">{copy.pulse} <span aria-hidden="true">↗</span></strong>
          <span id="sw-pulse-description">{pulseDescription}</span>
        </span>
        <Image className="sw-pulse-art" alt="" sizes="(max-width: 640px) 98px, 150px" height={230} src="/dashboard/market-pulse-ceramic.webp" width={420} />
      </Link>
      <Link className="sw-wealth-card" href="/wealth" prefetch={false} aria-labelledby="sw-wealth-title" aria-describedby="sw-wealth-preview">
        <div className="sw-wealth-content">
          <span className="sw-wealth-label">{locale === "bn" ? "সম্পদের পরিকল্পনা" : "Wealth Workspace"}</span>
          <strong id="sw-wealth-title">{locale === "bn" ? "সঞ্চয় ও সম্পদের পরিকল্পনা করুন" : "Plan savings. Estimate tax."} <span aria-hidden="true">↗</span></strong>
          <span id="sw-wealth-preview">{locale === "bn" ? "ট্যাক্স প্ল্যানার · সঞ্চয়পত্র · যাকাত · DPS · FDR" : "Tax Planner · Sanchayapatra · Zakat · DPS · FDR"}</span>
        </div>
        <Image className="sw-wealth-card-art" alt="" sizes="(max-width: 640px) 76px, 120px" height={320} width={480} src="/dashboard/wealth-workspace-trio-v2.webp" />
      </Link>
    </div>
  </section>;
}
