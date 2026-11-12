import { DashboardInfoPanel } from "./dashboard-info-panel";
import { compactBreadthCoverage } from "@/lib/market/breadth-presentation";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { memo } from "react";

import type { TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { InsightBlockModel } from "@/lib/insights/insight-types";
import type { MarketDashboardModel } from "../types/market-dashboard-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getPremiumCopy } from "../premium-copy";
import { formatPercent } from "@/lib/formatters/financial-formatters";

type InsightSidebarProps = {
  insights: InsightBlockModel[];
  copy: TerminalCopy;
  loading?: boolean;
  error?: boolean;
  intraday?: boolean;
  model?: MarketDashboardModel;
  locale?: AppLocale;
};

export const InsightSidebar = memo(function InsightSidebar({ insights, copy, model, locale = "en", loading = false, error = false, intraday = false }: InsightSidebarProps) {
  const premium = getPremiumCopy(locale);
  const activityIntraday = model?.activityIsIntraday ?? intraday;
  const turnover = model?.pulse.turnoverContext;
  const current = turnover?.currentValue;
  const average = turnover?.averageValue;
  const comparable = current != null && Number.isFinite(current) && current >= 0 && average != null && Number.isFinite(average) && average > 0;
  const ratio = comparable ? current / average : null;
  const scale = comparable ? Math.max(current, average) : 1;
  const percent = ratio === null ? null : new Intl.NumberFormat("en-BD", { style: "percent", maximumFractionDigits: 0 }).format(ratio);
  const volume = model?.pulse.volumeContext.ratioVsAvg;
  const relationship = model && model.pulse.indexTradeDate === model.pulse.latestTradeDate && model.pulse.activityTradeDate === model.pulse.latestTradeDate && model.breadth.total > 0 && model.pulse.indexChangePercent !== null && volume && volume !== "N/A"
    ? premium.breadth(model.breadth.advancing, model.breadth.declining, formatPercent(model.pulse.indexChangePercent), premium.volumeAverage(volume)) : null;
  return (
    <section className="sw-insights" aria-labelledby="sw-insights-title" aria-busy={loading}>
      <h2 className="sw-section-title" id="sw-insights-title">{copy.insightsTitle}</h2>
      {error ? <p className="sw-state sw-warning" role="status">{copy.insightsError}</p> : null}
      {loading ? <p className="sw-state" role="status">{copy.loading}</p> : !insights.length && !error ? <p className="sw-state">{copy.insightsEmpty}</p> : null}
      <div className="sw-insight-grid">{!loading && insights.map((insight) => (
        <article className={`sw-insight sw-insight-${insight.id} sw-insight-tone-${insight.tone}`} key={insight.id}>
          <div className="sw-insight-topline"><span className="sw-insight-label">{insight.id === "market-mood" ? copy.marketInterpretation : copy.tradingActivity}</span>
          <DashboardInfoPanel label={locale === "bn" ? "কীভাবে বুঝবেন" : "How to read this"} title={insight.id === "market-mood" ? copy.marketInterpretation : copy.tradingActivity} locale={locale}>
            {insight.id === "market-mood" ? <p>{locale === "bn" ? "এই কার্যদিবসের সূচক, কতটি শেয়ার উঠেছে বা নেমেছে এবং সাম্প্রতিক এভারেজের তুলনায় কেনাবেচার পরিমাণ একসঙ্গে দেখুন। একই দিকে চললে গতি বোঝা সহজ; ভিন্ন হলে নিশ্চিত হওয়ার অপেক্ষা করুন।" : "Read this session’s index move alongside advancing and declining stocks and volume against its recent average. Agreement supports the reading; divergence calls for confirmation."}</p> : <><p>{premium.average(turnover?.averageSessions ?? 30)} · {premium.averageNote}</p><p>{activityIntraday ? premium.partialNote : premium.implication}</p></>}
          </DashboardInfoPanel></div>
          {insight.id === "market-mood" ? <>
            <div className="sw-sector-sculpture" aria-hidden="true"><i /><i /><i /><i /></div>
            <h3>{insight.title}</h3>
            <p>{insight.interpretation ? insight.description : relationship ?? insight.description}</p>
            {insight.interpretation && <small>{shortTradeDate(insight.interpretation.as_of_date, locale)} · {compactBreadthCoverage(insight.interpretation.breadth, locale)}</small>}

          </> : <>
            <h3 className="sw-activity-headline">{percent ? locale === "bn" ? <>এভারেজের {percent} <span>লেনদেন</span></> : <>{percent}<span>{premium.ratio}</span></> : premium.unavailable}</h3>
            {comparable ? <div className="sw-turnover-comparison">
              <div className="sw-comparison-row"><span>{activityIntraday ? premium.partial : premium.current}</span><b>{turnover?.primaryValue}</b><div className="sw-comparison-track"><i style={{ width: `${current / scale * 100}%` }} /></div></div>
              <div className="sw-comparison-row sw-comparison-average"><span>{premium.average(turnover?.averageSessions ?? 30)}</span><b>BDT {turnover?.vs30DayAvg}</b><div className="sw-comparison-track"><i style={{ width: `${average / scale * 100}%` }} /></div></div>
            </div> : <p>{copy.noAverage}</p>}
            <p className="sw-activity-implication">{activityIntraday ? premium.partialNote : premium.implication}</p>
            {model?.pulse.activityTradeDate && model.pulse.activityTradeDate !== model.pulse.latestTradeDate && <small>{shortTradeDate(model.pulse.activityTradeDate, locale)}</small>}

          </>}
          {intraday && insight.id === "market-mood" ? <small>{copy.intradayInterpretation}</small> : null}
        </article>
      ))}</div>
    </section>
  );
});
