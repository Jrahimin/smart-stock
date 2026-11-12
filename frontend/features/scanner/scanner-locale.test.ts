import { describe, expect, it } from "vitest";

import {
  getScannerCategoryDescription,
  getScannerLanguage,
} from "@/features/scanner/scanner-language";
import { localizeEntryCondition } from "@/features/stock-workspace/stock-decision-language";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

describe("scanner language", () => {
  it("defaults to bn hero copy", () => {
    const language = getScannerLanguage(DEFAULT_LOCALE);
    expect(language.hero.title).toContain("শেয়ার");
    expect(language.states.loading).toContain("সুযোগ");
  });

  it("localizes scan category titles and descriptions", () => {
    const language = getScannerLanguage("bn");
    const breakout = language.categories.volume_breakouts;

    expect(breakout.title).toContain("উত্থান");
    expect(getScannerCategoryDescription(breakout, false)).toContain("প্রতিরোধসীমা");
    expect(getScannerCategoryDescription(breakout, true)).toContain("প্রতিরোধসীমা");
    expect(language.categories.oversold_rebound.title).toBe("সমর্থনমূল্য থেকে ঘুরে দাঁড়ানো");
  });

  it("keeps en copy unchanged", () => {
    const language = getScannerLanguage("en");
    expect(language.hero.title).toBe("Daily opportunity detection");
    expect(language.filters.allStocks).toBe("All stocks");
    expect(language.categories.breakdown_risk.title).toBe("Support-break Events");
  });

  it("localizes scanner entry conditions in Bangla", () => {
    const localized = localizeEntryCondition(
      "Enter only while the completed breakout holds above the preferred zone; reassess if participation fades or the invalidation is breached.",
      "bn",
    );

    expect(localized).toContain("entry ভাবতে পারেন");
    expect(localized).not.toContain("Enter only while");
  });
});
