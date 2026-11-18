import { describe, expect, it } from "vitest";
import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import { potentialBuyNextStep } from "./entry-assessment-presentation";
import { getEntryAssessmentLanguage } from "./entry-assessment-language";

describe("Potential Buy guidance", () => {
  const breakout = { entry_timing: "BREAKOUT", trigger_price: 420 };
  const applicable: EntryApplicabilityDto = { status: "APPLICABLE", reason_code: "ENTRY_TERMS_MET", price_basis: "CURRENT" };

  it("keeps the idea label above the actual breakout and pullback conditions", () => {
    expect(potentialBuyNextStep({ status: "AWAITING_CONFIRMATION", reason_code: "COMPLETED_BREAKOUT_REQUIRED" }, breakout, "en"))
      .toMatchObject({ headline: "Potential Buy", nextStep: "Wait for a close above ৳420 on at least normal volume." });
    expect(potentialBuyNextStep({ status: "AWAITING_CONFIRMATION", reason_code: "COMPLETED_PULLBACK_HOLD_REQUIRED" }, null, "en").nextStep)
      .toContain("closes at or above support");
  });

  it("keeps current, closing and batch evidence distinct", () => {
    expect(potentialBuyNextStep(applicable, null, "en").nextStep).toContain("latest verified price");
    expect(potentialBuyNextStep({ ...applicable, price_basis: "LAST_CLOSE" }, null, "en").nextStep).toContain("Recheck next session");
    expect(potentialBuyNextStep({ ...applicable, price_basis: "SNAPSHOT", batch_fetched_at: "2026-11-17T06:30:00Z" }, null, "en").nextStep).toContain("as of the 17 Nov 2026, 12:30 price snapshot");
    expect(potentialBuyNextStep({ ...applicable, price_basis: "SNAPSHOT" }, null, "en").nextStep).toContain("Check the latest price");
  });

  it("shows a localized terminal headline following invalidation", () => {
    expect(potentialBuyNextStep({ status: "INVALIDATED", reason_code: "STOP_BREACHED" }, breakout, "bn"))
      .toMatchObject({ headline: "পরিকল্পনাটি আর বৈধ নয়", terminal: true });
  });

  it("keeps the dated condition when the quote cannot be used and preserves an above-zone blocker", () => {
    const published = "Trade Plan: close above 420 with volume confirmation";
    const unavailable: EntryApplicabilityDto = { status: "UNVERIFIED", reason_code: "QUOTE_UNUSABLE" };
    expect(potentialBuyNextStep(unavailable, breakout, "en", published)).toEqual({ headline: "Potential Buy", nextStep: published, terminal: false });
    expect(potentialBuyNextStep(unavailable, null, "en").nextStep).not.toMatch(/broker|entry conditions met/i);
    expect(potentialBuyNextStep({ status: "OUTSIDE_ZONE", reason_code: "ABOVE_ENTRY_ZONE", price_basis: "CURRENT" }, breakout, "en", published).nextStep)
      .toBe(`Above entry zone. Reassess if price returns to the range. ${published}`);
  });

  it.each(["en", "bn"] as const)("keeps specific unavailable-entry reasons alongside the dated condition (%s)", (locale) => {
    const copy = getEntryAssessmentLanguage(locale);
    const reasons = {
      PATH_INCOMPLETE: copy.incompletePath,
      COVERAGE_UNKNOWN: copy.missingHistory,
      TERMS_UNKNOWN: copy.missingTerms,
      SESSION_SETTLING: copy.settlingDetail,
    } as const;
    const published = locale === "bn" ? "দিনশেষে ৪২০-এর ওপরে দর ও পর্যাপ্ত লেনদেনের নিশ্চয়তা প্রয়োজন।" : "Trade Plan: close above 420 with volume confirmation.";
    for (const reason of Object.keys(reasons) as (keyof typeof reasons)[]) {
      const assessment: EntryApplicabilityDto = { status: "UNVERIFIED", reason_code: reason };
      expect(potentialBuyNextStep(assessment, breakout, locale, published))
        .toEqual({ headline: "Potential Buy", nextStep: `${reasons[reason]} ${published}`, terminal: false });
      expect(potentialBuyNextStep(assessment, breakout, locale).nextStep).toBe(reasons[reason]);
    }
  });
});
