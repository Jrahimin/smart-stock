import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MarketTimeline } from "./market-timeline";
import { getTerminalCopy } from "../terminal-copy";
import { mapDashboardAlertsDto } from "../view-models/dashboard-sections-mapper";
import { localizeTimelineItems } from "../view-models/dashboard-timeline-localization";
import { getDashboardLanguage } from "../dashboard-language";

it.each(["en", "bn"] as const)("distinguishes timeline loading, failure and successful empty (%s)", (locale) => {
  const copy = getTerminalCopy(locale);
  const render = (loading: boolean, error: boolean) => renderToStaticMarkup(
    <MarketTimeline items={[]} copy={copy} loading={loading} error={error} />,
  );
  expect(render(true, false)).toContain(copy.loading);
  expect(render(true, false)).not.toContain(copy.timelineEmpty);
  expect(render(false, true)).toContain(copy.timelineError);
  expect(render(false, true)).not.toContain(copy.timelineEmpty);
  expect(render(false, false)).toContain(copy.timelineEmpty);
});

it.each(["en", "bn"] as const)("preserves dated generated updates and available safe sources (%s)", (locale) => {
  const copy = getTerminalCopy(locale);
  const items = localizeTimelineItems(mapDashboardAlertsDto({
    session_trade_date: "2026-07-21",
    items: [{ time: "2026-07-21", title: "Market snapshot ready",
      description: "426 active instruments in the latest price snapshot.", source_url: "https://example.com/source" }],
  }), locale, getDashboardLanguage(locale));
  const html = renderToStaticMarkup(<MarketTimeline items={items} copy={copy} loading={false} />);
  expect(html).toContain(copy.snapshotUpdate);
  expect(html).toContain('dateTime="2026-07-21"');
  expect(html).toContain('href="https://example.com/source"');
  const unsafe = renderToStaticMarkup(<MarketTimeline items={[{ ...items[0], sourceUrl: "javascript:alert(1)" }]} copy={copy} loading={false} />);
  expect(unsafe).not.toContain('href=');
});
