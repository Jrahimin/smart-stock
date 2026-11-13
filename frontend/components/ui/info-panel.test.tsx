/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InfoPanel } from "./info-panel";
import { QuoteObservationTimes } from "./quote-observation-times";

afterEach(cleanup);
it.each(["en", "bn"])("keeps confirmation explicit and returns focus on cancel and Escape (%s)", (locale) => {
  const confirm = vi.fn();
  render(<InfoPanel label="Remove holding" locale={locale} confirmation={{ label: "Remove", cancelLabel: "Cancel", onConfirm: confirm }}>The watchlist item remains.</InfoPanel>);
  const trigger = screen.getByRole("button", { name: "Remove holding" });
  fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("alertdialog").textContent).toContain("watchlist item remains");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(confirm).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent(screen.getByRole("alertdialog"), new Event("cancel", { cancelable: true }));
  expect(confirm).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(confirm).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(trigger);
});
it("restores the information launcher when closed by keyboard", () => {
  render(<InfoPanel label="Coverage">399 measured, 27 unknown.</InfoPanel>);
  const trigger = screen.getByRole("button", { name: "Coverage" }); fireEvent.click(trigger);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it.each(["en", "bn"] as const)("retrieval is separate from unknown source observation time (%s)", (locale) => {
  const { container, rerender } = render(<QuoteObservationTimes locale={locale} quote={{ batch_fetched_at: "2026-11-11T21:00:00Z" }} />);
  expect(container.textContent).toContain(locale === "en" ? "Verified source observation time is unavailable" : "যাচাইকৃত সময় পাওয়া যায়নি");
  expect(container.textContent).toContain(locale === "en" ? "Retrieval time is not the quote's source time" : "তথ্য আনার সময় দামের সময় নয়");
  rerender(<QuoteObservationTimes locale={locale} quote={{ source_observed_at: "2026-11-10T08:00:00Z", batch_fetched_at: "2026-11-11T21:00:00Z" }} />);
  expect(container.textContent).toContain(locale === "en" ? "Source observed" : "উৎসে পর্যবেক্ষণ");
  expect(container.querySelectorAll("small")).toHaveLength(2);
});
