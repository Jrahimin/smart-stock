import type { AdminUserSummaryStats } from "@/features/admin/lib/admin-user-summary";
import { buildUserSummaryStats } from "@/features/admin/lib/admin-user-summary";

export function AdminUsersSummaryCard({ users }: { users: AdminUserSummaryStats }) {
  const stats = buildUserSummaryStats(users);

  return (
    <article aria-label="User summary" className="admin-users-summary-card">
      <span className="admin-users-summary-label">Users</span>
      <div className="admin-users-summary-stats">
        <UserStat label="Total" value={stats.total} />
        <UserStat label="Active" tone="positive" value={stats.active} />
        <UserStat label="Inactive" value={stats.inactive} />
        <UserStat label="Admins" tone="info" value={stats.admins} />
      </div>
      <span className="admin-users-summary-footer">{stats.footer}</span>
    </article>
  );
}

function UserStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "info";
}) {
  return (
    <div className={`admin-users-stat${tone ? ` admin-users-stat-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
