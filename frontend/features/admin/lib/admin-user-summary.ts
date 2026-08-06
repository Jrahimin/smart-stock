import type { AdminDashboardOverview } from "@/features/admin/types/admin-types";

export type AdminUserSummaryStats = AdminDashboardOverview["users"];

export function buildUserSummaryStats(users: AdminUserSummaryStats) {
  const adminCount = users.admin_users + users.super_admin_users;

  return {
    total: users.total_users,
    active: users.active_users,
    inactive: users.inactive_users,
    admins: adminCount,
    superAdmins: users.super_admin_users,
    footer:
      users.inactive_users > 0
        ? `${users.inactive_users} inactive · ${users.deleted_users} deleted`
        : `${users.super_admin_users} super admin${users.super_admin_users === 1 ? "" : "s"}`,
  };
}
