import { describe, expect, it } from "vitest";

import { buildUserSummaryStats } from "@/features/admin/lib/admin-user-summary";

describe("admin user summary", () => {
  it("aggregates total, active, inactive, and admin counts", () => {
    const stats = buildUserSummaryStats({
      total_users: 13,
      active_users: 12,
      inactive_users: 1,
      deleted_users: 0,
      admin_users: 1,
      super_admin_users: 1,
    });

    expect(stats).toMatchObject({
      total: 13,
      active: 12,
      inactive: 1,
      admins: 2,
      superAdmins: 1,
    });
    expect(stats.footer).toContain("inactive");
  });

  it("shows super admin count when no inactive users", () => {
    const stats = buildUserSummaryStats({
      total_users: 13,
      active_users: 13,
      inactive_users: 0,
      deleted_users: 0,
      admin_users: 0,
      super_admin_users: 1,
    });

    expect(stats.footer).toBe("1 super admin");
  });
});
