import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SignalBadge } from "@/components/ui/signal-badge";

describe("SignalBadge", () => {
  it("shows the public potential-buy label in English", () => {
    const markup = renderToStaticMarkup(<SignalBadge locale="en" signal="POTENTIAL_BUY" />);

    expect(markup).toContain("POTENTIAL BUY");
    expect(markup).not.toContain(">BUY<");
  });

  it("shows the Bangla potential-buy label by default locale", () => {
    const markup = renderToStaticMarkup(<SignalBadge signal="POTENTIAL_BUY" />);

    expect(markup).toContain('aria-label="কেনার সম্ভাবনা"');
    expect(markup).toContain(">কেনার সম্ভাবনা<");
  });

  it("uses a shorter table label for compact potential-buy badges", () => {
    const markup = renderToStaticMarkup(
      <SignalBadge density="compact" locale="en" signal="POTENTIAL_BUY" />,
    );

    expect(markup).toContain(">P. BUY<");
    expect(markup).not.toContain(">POTENTIAL BUY<");
  });
});
