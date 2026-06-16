import { backendApiGet, backendApiPatch, backendApiPost, backendApiPut, backendApiDelete } from "@/lib/api/backend-api-client";
import type {
  AdminConfigSetting,
  AdminDashboardOverview,
  AdminUser,
  AdminUserSession,
  EmailCampaign,
  EmailCampaignRecipientScope,
  SystemJobExecution,
  SystemJobType,
  UserRole,
} from "@/features/admin/types/admin-types";

const NO_STORE = { cache: "no-store" } as RequestInit;

export function fetchAdminDashboard() {
  return backendApiGet<AdminDashboardOverview>("/admin/dashboard", undefined, NO_STORE);
}

export function fetchAdminUsers(params?: {
  search?: string;
  is_active?: boolean;
  role?: UserRole;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
}) {
  return backendApiGet<AdminUser[]>("/admin/users", params, NO_STORE);
}

export function fetchAdminUser(userId: string, includeDeleted = false) {
  return backendApiGet<AdminUser>(`/admin/users/${userId}`, { include_deleted: includeDeleted }, NO_STORE);
}

export function fetchAdminUserSessions(userId: string) {
  return backendApiGet<AdminUserSession[]>(`/admin/users/${userId}/sessions`, undefined, NO_STORE);
}

export function updateAdminUserActive(userId: string, isActive: boolean) {
  return backendApiPatch<AdminUser>(`/admin/users/${userId}/active`, { is_active: isActive });
}

export function updateAdminUserRole(userId: string, role: UserRole) {
  return backendApiPatch<AdminUser>(`/admin/users/${userId}/role`, { role });
}

export function softDeleteAdminUser(userId: string) {
  return backendApiDelete<AdminUser>(`/admin/users/${userId}`);
}

export function revokeAdminUserSessions(userId: string) {
  return backendApiPost<{ detail: string }>(`/admin/users/${userId}/revoke-sessions`, {});
}

export function fetchAdminConfiguration() {
  return backendApiGet<AdminConfigSetting[]>("/admin/configuration", undefined, NO_STORE);
}

export function updateAdminConfiguration(settingKey: string, value: string) {
  return backendApiPut<AdminConfigSetting>(`/admin/configuration/${settingKey}`, { value });
}

export function fetchSystemJobExecutions(params?: {
  job_type?: SystemJobType;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return backendApiGet<SystemJobExecution[]>("/admin/jobs/executions", params, NO_STORE);
}

export function triggerSystemJob(payload: { job_type: SystemJobType; job_name?: string; metadata?: Record<string, unknown> }) {
  return backendApiPost<{ execution: SystemJobExecution; result_summary: Record<string, unknown> }>(
    "/admin/jobs/trigger",
    payload,
  );
}

export function fetchEmailCampaigns(params?: { limit?: number; offset?: number }) {
  return backendApiGet<EmailCampaign[]>("/admin/email-campaigns", params, NO_STORE);
}

export function createEmailCampaign(payload: {
  subject: string;
  body_text: string;
  body_html?: string;
  recipient_scope: EmailCampaignRecipientScope;
  filter_criteria_json?: Record<string, unknown>;
  selected_user_ids?: string[];
}) {
  return backendApiPost<EmailCampaign>("/admin/email-campaigns", payload);
}

export function createAdminUser(payload: {
  email: string;
  display_name: string;
  password: string;
  role: UserRole;
}) {
  return backendApiPost<AdminUser>("/admin/users", payload);
}

export type EmailCampaignAudienceUser = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  email_verified_at: string | null;
  is_active: boolean;
};

export function fetchEmailCampaignAudience(params?: {
  role?: string;
  verified_only?: boolean;
  subscribed_only?: boolean;
  search?: string;
  limit?: number;
}) {
  return backendApiGet<EmailCampaignAudienceUser[]>("/admin/email-campaigns/audience-preview", params, NO_STORE);
}

export function queueEmailCampaign(campaignId: string) {
  return backendApiPost<EmailCampaign>(`/admin/email-campaigns/${campaignId}/queue`, {});
}
