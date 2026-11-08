import { describe, expect, it } from "vitest";
import { adminValidationMessage, printedPageCitation, tabForPath } from "./admin-fields";

describe("admin evidence and field routing",()=>{
 it("shows only explicitly recorded printed citations without converting PDF pages",()=>{
  expect(printedPageCitation("Allowance; printed pp. 14–16")).toBe("14–16");
  expect(printedPageCitation("মুদ্রিত পৃষ্ঠা: ১৪–১৬")).toBe("১৪–১৬");
  expect(printedPageCitation("Evidence PDF pages 62, 63")).toBe("Not recorded separately");
 });
 it("routes nested configuration errors to the correct section",()=>{
  expect(tabForPath("rules.rule_references.2.references.0.pdf_pages.0")).toBe("Sources & evidence");
  expect(tabForPath("rules.investment_presentation.3.label_bn")).toBe("Labels & visibility");
  expect(tabForPath("rules.filing_windows.1.limit")).toBe("Filing calendar");
 });
});

it("identifies percentage bounds without disguising amount or required errors",()=>{
 expect(adminValidationMessage("rules.taxable_bands.2.rate","Amount exceeds the allowed limit.")).toBe("Band 3: Enter a rate between 0% and 100%.");
 expect(adminValidationMessage("rules.rebate.income_rate","Amount exceeds the allowed limit.")).toBe("Enter a rate between 0% and 100%.");
 expect(adminValidationMessage("rules.taxable_bands.0.width","Amount exceeds the allowed limit.")).toBe("Amount exceeds the allowed limit.");
 expect(adminValidationMessage("rules.taxable_bands.0.rate","Required amount")).toBe("Required amount");
});
