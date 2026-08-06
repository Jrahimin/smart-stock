import {
  AdminDataTable,
  AdminDataTableBody,
  AdminDataTableCell,
  AdminDataTableRow,
} from "@/features/admin/components/admin-data-table";
import {
  AdminStatusBadge,
  formatHealthStateLabel,
  healthStateTone,
} from "@/features/admin/components/admin-status-badge";
import type { AdminScheduleRow } from "@/features/admin/lib/admin-operations-view-model";
import { formatAdminDateTime } from "@/features/admin/utils/format-admin-datetime";

export function AdminScheduleOverview({ rows }: { rows: AdminScheduleRow[] }) {
  return (
    <AdminDataTable className="admin-data-table-schedule">
      <div className="admin-data-table-head">
        <AdminDataTableCell>Schedule</AdminDataTableCell>
        <AdminDataTableCell>Enabled</AdminDataTableCell>
        <AdminDataTableCell>Last run</AdminDataTableCell>
        <AdminDataTableCell>Next run</AdminDataTableCell>
        <AdminDataTableCell>Status</AdminDataTableCell>
      </div>
      <AdminDataTableBody>
        {rows.map((row) => (
          <AdminDataTableRow key={row.name}>
            <AdminDataTableCell>
              <strong>{row.name}</strong>
            </AdminDataTableCell>
            <AdminDataTableCell>
              <AdminStatusBadge
                label={row.enabled ? "Enabled" : "Disabled"}
                tone={row.enabled ? "success" : "neutral"}
              />
            </AdminDataTableCell>
            <AdminDataTableCell>
              <time dateTime={row.lastRunAt ?? undefined} title={formatAdminDateTime(row.lastRunAt)}>
                {formatAdminDateTime(row.lastRunAt)}
              </time>
            </AdminDataTableCell>
            <AdminDataTableCell>
              <time dateTime={row.nextRunAt ?? undefined} title={formatAdminDateTime(row.nextRunAt)}>
                {formatAdminDateTime(row.nextRunAt)}
              </time>
            </AdminDataTableCell>
            <AdminDataTableCell>
              <AdminStatusBadge
                label={formatHealthStateLabel(row.status)}
                tone={healthStateTone(row.status)}
              />
            </AdminDataTableCell>
          </AdminDataTableRow>
        ))}
      </AdminDataTableBody>
    </AdminDataTable>
  );
}
