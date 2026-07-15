import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SignalBadge } from "@/components/ui/signal-badge";

describe("SignalBadge", () => {
  it("shows the public potential-buy label", () => {
    const markup = renderToStaticMarkup(<SignalBadge signal="POTENTIAL_BUY" />);

    expect(markup).toContain("POTENTIAL BUY");
    expect(markup).not.toContain(">BUY<");
  });
});
