import { describe, expect, it } from "vitest";

import {
  getStockSectionDefinitions,
  getStockWorkspaceLanguage,
  localizeCompanySnapshotLabel,
  localizeRelatedStocksGroupTitle,
} from "@/features/stock-workspace/stock-workspace-language";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

describe("stock workspace language", () => {
  it("returns bn section nav labels", () => {
    const sections = getStockSectionDefinitions("bn");
    const overview = sections.find((section) => section.id === "overview");
    expect(overview?.label).toBe("Overview");
    expect(overview?.subtitle).toContain("দামের");
  });

  it("localizes company snapshot metric labels by key", () => {
    expect(localizeCompanySnapshotLabel("sector", "bn")).toBe("Sector");
    expect(localizeCompanySnapshotLabel("pe", "bn")).toBe("P/E");
  });

  it("localizes related stock group titles by semantic id", () => {
    expect(localizeRelatedStocksGroupTitle("sector-peers", "bn")).toBe("একই Sector-এর শেয়ার");
    expect(localizeRelatedStocksGroupTitle("top-opportunities", "en")).toBe("Top Opportunities");
  });

  it("defaults to bn workspace states", () => {
    const language = getStockWorkspaceLanguage(DEFAULT_LOCALE);
    expect(language.states.loading).toContain("লোড");
    expect(language.decision.label).toBe("সিদ্ধান্ত");
    expect(language.decision.confidence).toBe("প্রমাণের শক্তি");
  });
});
