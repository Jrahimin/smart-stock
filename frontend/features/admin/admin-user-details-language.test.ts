import { describe, expect, it } from "vitest";

import { getAdminUserDetailsCopy } from "@/features/admin/admin-user-details-language";

describe("admin user details language", () => {
  it("provides localized empty and incomplete portfolio states", () => {
    expect(getAdminUserDetailsCopy("en").noPortfolio).toBe("No portfolio yet");
    expect(getAdminUserDetailsCopy("bn").noPortfolio).toBe("এখনও পোর্টফোলিও নেই");
    expect(getAdminUserDetailsCopy("en").incompleteHolding(2)).toContain("2 holdings");
    expect(getAdminUserDetailsCopy("bn").incompleteHolding(2)).toContain("2টি হোল্ডিংসে");
  });

  it("labels authentication and session state without claiming activity", () => {
    const copy = getAdminUserDetailsCopy("en");
    expect(copy.passwordLogin).toBe("Password login");
    expect(copy.recordedLogin).toBe("Recorded login");
  });
});
