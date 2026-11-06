import { describe, expect, it } from "vitest";

import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { localizeTimelineItems } from "@/features/market-dashboard/view-models/dashboard-timeline-localization";

describe("dashboard timeline", () => {
  it.each(["en", "bn"] as const)("preserves dated snapshot updates, movers, and alerts (%s)", (locale) => {
    const time = "2026-07-15";
    const language = getDashboardLanguage(locale);
    const items = localizeTimelineItems([
      { time, title: "ACIFORMULA +9.96%", description: "Top session mover in the latest snapshot (ACI Formulations PLC)." },
      { time, title: "Market snapshot ready", description: "410 active instruments in the latest price snapshot." },
      { time, title: "Suspicious activity flagged", description: "4 instruments need source validation before acting on signals." },
    ], locale, language);

    expect(items).toHaveLength(3);
    expect(items[0]?.title).toBe("ACIFORMULA +9.96%");
    expect(items[1]?.title).toBe(language.timeline.templates.snapshotReadyTitle);
    expect(items[2]).toEqual({
      time,
      title: language.timeline.templates.suspiciousTitle,
      description: language.timeline.templates.suspiciousDescription("4"),
    });
  });
});
