import { describe, expect, it } from "vitest";

import { parseAdminUserAgent } from "@/features/admin/utils/parse-admin-user-agent";

describe("parseAdminUserAgent", () => {
  it("breaks a mobile Chrome user-agent into readable labels", () => {
    const parsed = parseAdminUserAgent(
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
    );

    expect(parsed).toMatchObject({
      deviceType: "Mobile",
      operatingSystem: "Android 10",
      browser: "Chrome 150.0.0.0",
    });
  });

  it("returns null when no device information was recorded", () => {
    expect(parseAdminUserAgent(null)).toBeNull();
    expect(parseAdminUserAgent("  ")).toBeNull();
  });
});
