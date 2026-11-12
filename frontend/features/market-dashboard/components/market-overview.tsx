import { breadthCoverageLabel, compactBreadthCoverage } from "@/lib/market/breadth-presentation";
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
import { isCurrentIntradaySession } from "@/lib/market/market-session-engine";
import type { AppLocale } from "@/lib/locale/app-locale";

const dhakaDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
const dhakaTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });

function Metric({ label, children, note, guide }: { label: string; children: ReactNode; note?: ReactNode; guide?: string }) {
  return <div className="sw-metric" data-guide={guide}>
    <dt>{label}</dt><dd>{children}{note ? <small>{note}</small> : null}</dd>
  </div>;
}

export function MarketOverview({ model, copy, locale, freshness, loading, leadersLoading }: {
  model: MarketDashboardModel; copy: TerminalCopy; locale: AppLocale;
  freshness?: BackendMarketFreshnessDto; loading: boolean; leadersLoading: boolean;
}) {
  const { pulse, breadth, session, insights } = model;
  const premium = getPremiumCopy(locale);
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
  const status = {
    OPEN: copy.open, PRE_OPEN: copy.preOpen, POST_CLOSE: copy.postClose, HOLIDAY: copy.closed,
    STALE: copy.stale, PARTIAL: copy.partial, SYNCING: copy.syncing,
  }[session.state];
  const publication = model.overviewPublication;
  const hasMatchingFreshness = hasDate && freshness?.trade_date === pulse.latestTradeDate
    && (!publication?.market_sync_id || !freshness?.market_sync_id || publication.market_sync_id === freshness.market_sync_id);
  const observed = !publication?.last_synced_at && hasMatchingFreshness ? freshness.live_data_as_of : null;
  const timestamp = publication?.last_synced_at ?? (hasMatchingFreshness ? observed ?? freshness.last_synced_at : null);
  const time = timestamp ? new Date(timestamp) : null;
  const tradeDate = hasDate ? new Date(`${pulse.latestTradeDate}T00:00:00+06:00`) : null;
  const leader = pulse.leadingSector;
  const turnover = pulse.turnoverContext;
  const volume = pulse.volumeContext;
  const partial = insights.find(({ id }) => id === "partial-data");
  const count = new Intl.NumberFormat("en-BD");
  const sessionSummary = breadth.total > 0 ? locale === "bn"
    ? `সর্বশেষ পাওয়া কার্যদিবসে ${count.format(breadth.advancing)}টি শেয়ার বেড়েছে, ${count.format(breadth.declining)}টি কমেছে।`
    : `In the latest recorded session, ${count.format(breadth.advancing)} stocks rose and ${count.format(breadth.declining)} fell.` : null;
  const earlierSession = hasDate && freshness?.market_status === "OPEN" && !isCurrentIntradaySession("OPEN", pulse.latestTradeDate);
  const indexDateDiffers = pulse.indexTradeDate && pulse.indexTradeDate !== pulse.latestTradeDate;
  const activityDateDiffers = pulse.activityTradeDate && pulse.activityTradeDate !== pulse.latestTradeDate;
  const context = earlierSession
    ? (locale === "bn" ? `${shortTradeDate(pulse.latestTradeDate, locale)}-এর দাম দেখানো হচ্ছে। আজকের দাম এখনও আসেনি।` : `Showing the ${shortTradeDate(pulse.latestTradeDate, locale)} session. Today's prices are not in yet.`)
    : partial?.description ?? [sessionSummary, breadthContrast(model, locale)].filter(Boolean).join(" ");
  const pulseDescription = locale === "bn"
    ? stale ? "ওই কার্যদিবসের খাতের অগ্রগতি দেখুন।" : "খাতের অগ্রগতি ও বাজারের চিত্র দেখুন।"
    : stale ? "Leaders from the recorded session." : "Sector leaders and session context.";
  const breadthParts = [[copy.up, breadth.advancing, "positive"], [copy.flat, breadth.unchanged, "neutral"], [copy.down, breadth.declining, "negative"]] as const;
  const detailStats = [
    ...(pulse.indexDayStats ? [
      [copy.dayOpen, pulse.indexDayStats.open], [copy.dayHigh, pulse.indexDayStats.high], [copy.dayLow, pulse.indexDayStats.low],
    ] : []),
    ...([pulse.indexPerformance.oneMonth, pulse.indexPerformance.sixMonth, pulse.indexPerformance.oneYear]
      .map((value, index) => [copy.returns[index], value])),
  ];

  return <section className={`sw-hero ${hero.hero}`} aria-label={copy.overview} aria-busy={loading}>
    <div className="sw-hero-main" data-guide="market-pulse" data-guide-ready={String(!loading)}>
      <div className="sw-index-stack"><div className="sw-index">
        <span>{pulse.indexName}</span>
        <strong data-updated={valueUpdated} className={pulse.indexAvailable ? "sw-index-value" : "sw-index-value sw-index-missing"}>{loading ? "…" : pulse.indexAvailable ? pulse.indexValue : copy.indexMissing}</strong>
        {pulse.indexAvailable && pulse.indexChangePercent !== null ? <b className={`sw-${pulse.indexTone}`}>{pulse.indexChangeLabel}</b> : null}
      </div>
      {indexDateDiffers ? <small className="sw-index-date">{locale === "bn" ? "সূচক" : "Index"} · {shortTradeDate(pulse.indexTradeDate, locale)}</small> : null}
      <div className="sw-index-details"><DashboardInfoPanel label={copy.indexDetails} locale={locale}>
        <div className="sw-detail-body">
          {pulse.indexAvailable ? <dl className="sw-detail-stats">
            {detailStats.filter(([, value]) => value !== "N/A").map(([label, value]) => <Metric key={label} label={label}><strong>{value}</strong></Metric>)}
            {detailStats.some(([, value]) => value === "N/A") ? <p className="sw-returns-unavailable">{locale === "bn" ? "কিছু সময়কালের রিটার্নের তথ্য নেই।" : "Some period returns are unavailable."}</p> : null}
            {pulse.indexRange ? <Metric label={copy.range}>
              <strong>{pulse.indexRange.lowLabel} – {pulse.indexRange.highLabel}</strong>
              <div className="sw-range" aria-hidden="true"><i style={{ left: `${pulse.indexRange.positionPercent}%` }} /></div>
            </Metric> : null}
          </dl> : <p>{loading ? copy.loading : copy.indexMissing}</p>}
        </div>
      </DashboardInfoPanel></div>
      </div>
      <div className="sw-hero-story">
        <div className="sw-session">
          <span className={`sw-session-state${stale || session.state === "PARTIAL" ? " sw-session-caution" : ""}`}>
            {loading ? copy.syncing : !hasDate ? copy.overview : earlierSession ? (locale === "bn" ? "আগের কার্যদিবসের দাম" : "Earlier session prices") : `${locale === "bn" ? "এখন বাজার" : "Market now"}: ${stale ? copy.stale : status}`}
          </span>
          {tradeDate && Number.isFinite(+tradeDate) ? <time dateTime={pulse.latestTradeDate}>{locale === "bn" ? "কার্যদিবস" : "Session"} · {dhakaDate.format(tradeDate)}</time> : null}
          {time && Number.isFinite(+time) && timestamp ? (
            <time dateTime={timestamp} title={observed ? copy.snapshotTime : copy.syncTime}>
              {observed ? "" : `${copy.synced} `}{dhakaDate.format(time) !== (tradeDate && dhakaDate.format(tradeDate)) ? `${dhakaDate.format(time)} ` : ""}{dhakaTime.format(time)}
            </time>
          ) : null}
        </div>
        <h1>{loading ? copy.loading : marketHeadline(model, locale)}</h1>
        {!loading && context ? <p className={partial ? "sw-hero-context sw-hero-context-caution" : "sw-hero-context"}>{context}</p> : null}
      </div>
      <div className={hero.artwork} aria-hidden="true">
        <Image src="/dashboard/market-candlesticks-lens.webp" width={900} height={450} sizes="(max-width: 1100px) 160px, 260px" alt="" priority />
      </div>
    </div>
    <dl className="sw-metrics">
      <Metric label={copy.breadth} guide="market-breadth" note={loading ? null : <DashboardInfoPanel label={compactBreadthCoverage(breadth.provenance, locale)} title={copy.breadth} locale={locale}><p>{breadthCoverageLabel(breadth.provenance, locale)}</p></DashboardInfoPanel>}>
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
      <Metric label={copy.sectorLeader} note={leader ? <DashboardInfoPanel label={copy.sectorLeaderBasis} title={copy.sectorLeader} locale={locale}><p>{copy.sectorLeaderBasis} · {locale === "bn" ? "যোগ্য সেশনের শেয়ার" : "Eligible session stocks"} · {pulse.latestTradeDate ?? "—"}</p></DashboardInfoPanel> : null}>
        {leader ? <strong>{sectorName(leader.name, locale)} <b className={`sw-${leader.changePercent > 0 ? "positive" : leader.changePercent < 0 ? "negative" : "neutral"}`}>{formatPercent(leader.changePercent)}</b></strong>
          : <strong>{loading || leadersLoading ? "…" : copy.missing}</strong>}
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
