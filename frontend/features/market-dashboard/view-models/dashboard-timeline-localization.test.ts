import { describe, expect, it } from "vitest";

import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import { localizeTimelineItems } from "@/features/market-dashboard/view-models/dashboard-timeline-localization";

describe("dashboard timeline localization", () => {
  it("localizes snapshot timeline cards in Bangla", () => {
    const language = getDashboardLanguage("bn");
    const [localized] = localizeTimelineItems(
      [
        {
          time: "2026-07-15",
          title: "Market snapshot ready",
          description: "410 active instruments in the latest price snapshot.",
        },
      ],
      "bn",
      language,
    );

    expect(localized?.title).toBe("বাজারের স্ন্যাপশট প্রস্তুত");
    expect(localized?.description).toContain("410");
    expect(localized?.description).toContain("সক্রিয় শেয়ার");
    expect(localized?.description).not.toContain("active instruments");
  });

  it("localizes top mover descriptions in Bangla", () => {
    const language = getDashboardLanguage("bn");
    const [localized] = localizeTimelineItems(
      [
        {
          time: "2026-07-15",
          title: "ACIFORMULA +9.96%",
          description: "Top session mover in the latest snapshot (ACI Formulations PLC).",
        },
      ],
      "bn",
      language,
    );

    expect(localized?.title).toBe("ACIFORMULA +9.96%");
    expect(localized?.description).toContain("ACI Formulations PLC");
    expect(localized?.description).not.toContain("Top session mover");
  });
});
