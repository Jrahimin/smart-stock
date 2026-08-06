import { describe, expect, it } from "vitest";

import { resolvePortfolioWorkspaceLoadState } from "@/features/portfolio/hooks/use-portfolio-workspace";

describe("resolvePortfolioWorkspaceLoadState", () => {
  it("treats disabled/auth-bootstrapping pending queries as loading, not error", () => {
    expect(
      resolvePortfolioWorkspaceLoadState({
        isPending: true,
        isError: false,
        data: undefined,
      }),
    ).toBe("loading");
  });

  it("shows error only after a finished failed request", () => {
    expect(
      resolvePortfolioWorkspaceLoadState({
        isPending: false,
        isError: true,
        data: undefined,
      }),
    ).toBe("error");
  });

  it("is ready when workspace data is present", () => {
    expect(
      resolvePortfolioWorkspaceLoadState({
        isPending: false,
        isError: false,
        data: { meta: {} },
      }),
    ).toBe("ready");
  });
});
