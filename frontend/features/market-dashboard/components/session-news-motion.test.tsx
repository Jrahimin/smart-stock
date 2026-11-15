// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketTimeline } from "./market-timeline";
import { getTerminalCopy } from "../terminal-copy";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("keeps the selected news stable over time and supports manual reading", () => {
  vi.useFakeTimers();
  const items = Array.from({length: 6}, (_, index) => ({
    id: `n${index}`, kind: "NEWS" as const, time: "2026-11-10",
    title: `News ${index}`, description: "News detail", href: `/stocks/DSE/S${index}`,
  }));
  const view = render(<MarketTimeline items={items} copy={getTerminalCopy("en")} loading={false}/>);
  fireEvent.click(view.getByText("News 2"));
  act(() => vi.advanceTimersByTime(21000));
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("3");
  expect(view.getByRole("link", {name: /Stock details/}).getAttribute("href")).toBe("/stocks/DSE/S2");
  expect(view.queryByRole("button", {name: /automatic scrolling|Next item|Previous item/})).toBeNull();
});
