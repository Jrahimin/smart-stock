import { describe, expect, it } from "vitest";

import {
  getScannerCategoryDescription,
  getScannerLanguage,
} from "@/features/scanner/scanner-language";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

describe("scanner language", () => {
  it("defaults to bn hero copy", () => {
    const language = getScannerLanguage(DEFAULT_LOCALE);
    expect(language.hero.title).toContain("সুযোগ");
    expect(language.states.loading).toContain("স্ক্যান");
  });

  it("localizes scan category titles and descriptions", () => {
    const language = getScannerLanguage("bn");
    const breakout = language.categories.volume_breakouts;

    expect(breakout.title).toContain("Breakout");
    expect(getScannerCategoryDescription(breakout, false)).toContain("resistance");
    expect(getScannerCategoryDescription(breakout, true)).toContain("close");
    expect(language.categories.oversold_rebound.title).toContain("Oversold");
  });

  it("keeps en copy unchanged", () => {
    const language = getScannerLanguage("en");
    expect(language.hero.title).toBe("Daily opportunity detection");
    expect(language.filters.allStocks).toBe("All stocks");
    expect(language.categories.breakdown_risk.title).toBe("Breakdown Risk");
  });
});
