"use client";

import { Download, History, Trash2, UserCog, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminDrawer } from "@/features/admin/components/admin-drawer";
import {
  AdminDataTable,
  AdminDataTableBody,
  AdminDataTableCell,
  AdminDataTableRow,
  AdminEmptyState,
  AdminSection,
} from "@/features/admin/components/admin-data-table";
import { AdminIconAction } from "@/features/admin/components/admin-icon-action";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { formatStatusLabel } from "@/features/admin/components/admin-status-badge";
import { AdminTableSkeleton } from "@/features/admin/components/admin-skeleton";
import { useIsSuperAdmin } from "@/features/auth/components/admin-route";
import type { AdminUser, UserRole } from "@/features/admin/types/admin-types";
import {
  createAdminUser,
  fetchAdminUserSessions,
  fetchAdminUsers,
  revokeAdminUserSessions,
  softDeleteAdminUser,
  updateAdminUserActive,
  updateAdminUserRole,
} from "@/lib/api/admin-api";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import { useDebouncedValue } from "@/features/wealth/hooks/use-debounced-value";
import { formatRelativeTime } from "@/features/admin/utils/format-relative-time";

export function AdminUsersView() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "DELETED">("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"profile" | "sessions">("profile");
  const [createOpen, setCreateOpen] = useState(false);
  const [createTouched, setCreateTouched] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    display_name: "",
    password: "",
    role: "USER" as UserRole,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users", debouncedSearch, roleFilter, statusFilter],
    queryFn: () =>
      fetchAdminUsers({
        search: debouncedSearch || undefined,
        role: roleFilter === "ALL" ? undefined : roleFilter,
        is_active: statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined,
        include_deleted: statusFilter === "DELETED",
        limit: 100,
      }),
  });

  const sessionsQuery = useQuery({
    queryKey: ["admin-user-sessions", selectedUserId],
    queryFn: () => fetchAdminUserSessions(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    if (selectedUserId) {
      void queryClient.invalidateQueries({ queryKey: ["admin-user-sessions", selectedUserId] });
    }
  };

  const activeMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      updateAdminUserActive(userId, isActive),
    onSuccess: invalidate,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => updateAdminUserRole(userId, role),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => softDeleteAdminUser(userId),
    onSuccess: () => {
      setSelectedUserId(null);
      invalidate();
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createAdminUser(createForm),
    onSuccess: () => {
      setCreateOpen(false);
      setCreateTouched(false);
      setCreateForm({ email: "", display_name: "", password: "", role: "USER" });
      invalidate();
    },
  });

  const createFieldErrors = useMemo(() => {
    const errors: Partial<Record<"email" | "display_name" | "password", string>> = {};
    const email = createForm.email.trim();

    if (!email) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    if (!createForm.display_name.trim()) {
      errors.display_name = "Display name is required.";
    }

    if (!createForm.password) {
      errors.password = "Password is required.";
    } else if (createForm.password.length < 8) {
      errors.password = "Use at least 8 characters.";
    }

    return errors;
  }, [createForm]);

  const submitCreateUser = () => {
    setCreateTouched(true);
    if (Object.keys(createFieldErrors).length > 0) {
      return;
    }
    createMutation.mutate();
  };

  const openCreateModal = () => {
    setCreateTouched(false);
    createMutation.reset();
    setCreateOpen(true);
  };

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revokeAdminUserSessions(userId),
    onSuccess: invalidate,
  });

  const selectedUser = useMemo(
    () => usersQuery.data?.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, usersQuery.data],
  );

  const filteredUsers = useMemo(() => {
    const users = usersQuery.data ?? [];
    if (statusFilter === "DELETED") return users.filter((user) => Boolean(user.deleted_at));
    if (statusFilter === "ACTIVE") return users.filter((user) => user.is_active && !user.deleted_at);
    if (statusFilter === "INACTIVE") return users.filter((user) => !user.is_active && !user.deleted_at);
    return users;
  }, [statusFilter, usersQuery.data]);

  const exportUsers = () => {
    const rows = filteredUsers.map((user) => ({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      is_active: user.is_active,
      last_seen_at: user.last_seen_at ?? "",
    }));
    const header = "id,email,display_name,role,is_active,last_seen_at\n";
    const body = rows
      .map((row) =>
        [row.id, row.email, row.display_name, row.role, row.is_active, row.last_seen_at]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "smart-stock-users.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openDrawer = (userId: string, mode: "profile" | "sessions") => {
    setSelectedUserId(userId);
    setDrawerMode(mode);
  };

  return (
    <div className="admin-workspace admin-workspace-tight">
      <AdminPageHeader
        actions={
          <>
            {isSuperAdmin ? (
              <button className="admin-btn admin-btn-primary" onClick={openCreateModal} type="button">
                <UserPlus size={16} />
                Create User
              </button>
            ) : null}
            <button className="admin-btn" onClick={exportUsers} type="button">
              <Download size={16} />
              Export Users
            </button>
          </>
        }
        description="Search, manage roles, and review login session activity."
        title="User Management"
      />

      <AdminSection className="admin-section-compact admin-section-flush" title="Directory">
        <div className="admin-toolbar admin-toolbar-compact">
          <label className="admin-filter-search">
            <span className="admin-search-inline-label">Search</span>
            <input
              className="admin-search-input admin-search-input-inline"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or email…"
              type="search"
              value={search}
            />
          </label>
          <select
            className="admin-select"
            onChange={(event) => setRoleFilter(event.target.value as UserRole | "ALL")}
            value={roleFilter}
          >
            <option value="ALL">All roles</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
          <select
            className="admin-select"
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            value={statusFilter}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="DELETED">Deleted</option>
          </select>
        </div>

        {usersQuery.isLoading ? <AdminTableSkeleton rows={6} /> : null}

        {filteredUsers.length ? (
          <AdminDataTable className="admin-data-table-users">
            <div className="admin-data-table-head">
              <AdminDataTableCell>User</AdminDataTableCell>
              <AdminDataTableCell>Role</AdminDataTableCell>
              <AdminDataTableCell>Status</AdminDataTableCell>
              <AdminDataTableCell>Last Seen</AdminDataTableCell>
              <AdminDataTableCell align="right">Actions</AdminDataTableCell>
            </div>
            <AdminDataTableBody>
              {filteredUsers.map((user) => (
                <UserRow
                  isSuperAdmin={isSuperAdmin}
                  key={user.id}
                  onDelete={() => deleteMutation.mutate(user.id)}
                  onEdit={() => openDrawer(user.id, "profile")}
                  onSessions={() => openDrawer(user.id, "sessions")}
                  onToggleActive={() => activeMutation.mutate({ userId: user.id, isActive: !user.is_active })}
                  user={user}
                />
              ))}
            </AdminDataTableBody>
          </AdminDataTable>
        ) : usersQuery.isLoading ? null : (
          <AdminEmptyState description="Try adjusting your search or filters." title="No users found" />
        )}
      </AdminSection>

      <AdminDrawer
        footer={
          selectedUser && !selectedUser.deleted_at ? (
            <button className="admin-btn" onClick={() => revokeMutation.mutate(selectedUser.id)} type="button">
              Revoke sessions
            </button>
          ) : null
        }
        isOpen={Boolean(selectedUser)}
        onClose={() => setSelectedUserId(null)}
        subtitle={selectedUser?.email}
        title={selectedUser?.display_name ?? "User details"}
      >
        {selectedUser ? (
          drawerMode === "sessions" ? (
            <>
              <h3 className="admin-drawer-section-title">Recent Sessions</h3>
              {sessionsQuery.isLoading ? <p>Loading sessions…</p> : null}
              {sessionsQuery.data?.length ? (
                <ul className="admin-session-list">
                  {sessionsQuery.data.map((session) => (
                    <li key={session.id}>
                      <strong>{new Date(session.login_at).toLocaleString()}</strong>
                      <div>
                        {session.ip_address ?? "unknown IP"} · {session.browser ?? "unknown browser"} ·{" "}
                        {session.operating_system ?? "unknown OS"}
                      </div>
                      <div>{session.is_successful ? "Successful login" : `Failed: ${session.failure_reason}`}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <AdminEmptyState description="Session history will appear after the user signs in." title="No sessions yet" />
              )}
            </>
          ) : (
            <>
              <div className="admin-detail-grid">
                <DetailItem label="Role" value={selectedUser.role} />
                <DetailItem
                  label="Status"
                  value={selectedUser.deleted_at ? "Deleted" : selectedUser.is_active ? "Active" : "Inactive"}
                />
                <DetailItem
                  label="Last Seen"
                  value={formatRelativeTime(selectedUser.last_seen_at)}
                />
                <DetailItem label="Last IP" value={selectedUser.last_seen_ip ?? "—"} />
              </div>
              {isSuperAdmin && !selectedUser.deleted_at ? (
                <label className="admin-composer-field">
                  <span>Change Role</span>
                  <select
                    className="admin-select"
                    onChange={(event) =>
                      roleMutation.mutate({ userId: selectedUser.id, role: event.target.value as UserRole })
                    }
                    value={selectedUser.role}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </label>
              ) : null}
            </>
          )
        ) : null}
      </AdminDrawer>

      <WorkspaceModal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateTouched(false);
          createMutation.reset();
        }}
        title="Create user"
      >
        <div className="admin-composer-grid admin-composer-grid-single">
          <label className={`admin-composer-field ${createTouched && createFieldErrors.email ? "admin-composer-field-invalid" : ""}`}>
            <span>Email</span>
            <input
              className={createTouched && createFieldErrors.email ? "admin-input-invalid" : ""}
              onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
              type="email"
              value={createForm.email}
            />
            {createTouched && createFieldErrors.email ? (
              <span className="admin-field-error">{createFieldErrors.email}</span>
            ) : null}
          </label>
          <label
            className={`admin-composer-field ${createTouched && createFieldErrors.display_name ? "admin-composer-field-invalid" : ""}`}
          >
            <span>Display name</span>
            <input
              className={createTouched && createFieldErrors.display_name ? "admin-input-invalid" : ""}
              onChange={(event) => setCreateForm((current) => ({ ...current, display_name: event.target.value }))}
              value={createForm.display_name}
            />
            {createTouched && createFieldErrors.display_name ? (
              <span className="admin-field-error">{createFieldErrors.display_name}</span>
            ) : null}
          </label>
          <label className={`admin-composer-field ${createTouched && createFieldErrors.password ? "admin-composer-field-invalid" : ""}`}>
            <span>Password</span>
            <input
              className={createTouched && createFieldErrors.password ? "admin-input-invalid" : ""}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              type="password"
              value={createForm.password}
            />
            {createTouched && createFieldErrors.password ? (
              <span className="admin-field-error">{createFieldErrors.password}</span>
            ) : null}
          </label>
          <label className="admin-composer-field">
            <span>Role</span>
            <select
              className="admin-select"
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, role: event.target.value as UserRole }))
              }
              value={createForm.role}
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <button
            className="admin-btn admin-btn-primary"
            disabled={createMutation.isPending}
            onClick={submitCreateUser}
            type="button"
          >
            {createMutation.isPending ? "Creating…" : "Create user"}
          </button>
          {createMutation.isError ? (
            <p className="admin-field-error">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Could not create user. Check the details and try again."}
            </p>
          ) : null}
        </div>
      </WorkspaceModal>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UserRow({
  user,
  isSuperAdmin,
  onEdit,
  onSessions,
  onToggleActive,
  onDelete,
}: {
  user: AdminUser;
  isSuperAdmin: boolean;
  onEdit: () => void;
  onSessions: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const initials = user.display_name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AdminDataTableRow>
      <AdminDataTableCell>
        <div className="admin-user-cell">
          <span className="admin-user-avatar">{initials}</span>
          <div className="admin-user-copy">
            <strong>{user.display_name}</strong>
            <span>{user.email}</span>
          </div>
        </div>
      </AdminDataTableCell>
      <AdminDataTableCell>
        <RoleBadge role={user.role} />
      </AdminDataTableCell>
      <AdminDataTableCell>
        {user.deleted_at ? (
          <span className="admin-role-badge admin-role-badge-user">Deleted</span>
        ) : (
          <button
            aria-pressed={user.is_active}
            className={user.is_active ? "admin-toggle admin-toggle-on" : "admin-toggle"}
            onClick={onToggleActive}
            title={user.is_active ? "Deactivate user" : "Activate user"}
            type="button"
          >
            <span className="admin-toggle-thumb" />
          </button>
        )}
      </AdminDataTableCell>
      <AdminDataTableCell>
        <span title={user.last_seen_at ?? undefined}>{formatRelativeTime(user.last_seen_at)}</span>
      </AdminDataTableCell>
      <AdminDataTableCell align="right">
        <div className="admin-action-group">
          {isSuperAdmin ? (
            <AdminIconAction icon={UserCog} label="Edit user" onClick={onEdit} tone="info" />
          ) : null}
          <AdminIconAction icon={History} label="View sessions" onClick={onSessions} tone="success" />
          {isSuperAdmin && !user.deleted_at ? (
            <AdminIconAction icon={Trash2} label="Delete user" onClick={onDelete} tone="danger" />
          ) : null}
        </div>
      </AdminDataTableCell>
    </AdminDataTableRow>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const className =
    role === "SUPER_ADMIN" ? "admin-role-badge-super" : role === "ADMIN" ? "admin-role-badge-admin" : "admin-role-badge-user";
  return <span className={`admin-role-badge ${className}`}>{formatStatusLabel(role)}</span>;
}
