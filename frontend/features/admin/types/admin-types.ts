export type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  mobile_number: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified_at: string | null;
  last_seen_ip: string | null;
  last_seen_user_agent: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUserSession = {
  id: string;
  session_identifier: string;
  login_at: string;
  ip_address: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  user_agent: string | null;
  last_activity_at: string | null;
  logout_at: string | null;
  revoked_at: string | null;
  is_successful: boolean;
  failure_reason: string | null;
  created_at: string;
};

export type ConfigValueType = "STRING" | "INTEGER" | "FLOAT" | "BOOLEAN" | "JSON";

export type AdminConfigCategory =
  | "SYSTEM"
  | "FEATURE_FLAG"
  | "MARKET"
  | "EMAIL"
  | "SCRAPER";

export type AdminConfigSetting = {
  key: string;
  value: string;
  value_type: ConfigValueType;
  category: AdminConfigCategory;
  requires_restart: boolean;
  description: string | null;
  source: string;
};

export type SystemJobType =
  | "MARKET_SYNC"
  | "MARKET_SNAPSHOT"
  | "STOCK_DETAILS_SYNC"
  | "INDICATORS"
  | "SIGNALS"
  | "EMAIL_CAMPAIGN"
  | "OTHER";

export type SystemJobExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type SystemJobExecution = {
  id: string;
  job_type: SystemJobType;
  job_name: string;
  status: SystemJobExecutionStatus;
  trigger_source: string;
  triggered_by_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  attempt_count: number;
  error_message: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EmailCampaignRecipientScope =
  | "ALL_USERS"
  | "VERIFIED_USERS"
  | "SELECTED_USERS"
  | "SUBSCRIBED_USERS"
  | "NON_ADMIN_USERS"
  | "FILTERED_USERS";

export type EmailCampaignStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type EmailCampaign = {
  id: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  recipient_scope: EmailCampaignRecipientScope;
  status: EmailCampaignStatus;
  filter_criteria_json: Record<string, unknown>;
  created_by_user_id: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  system_job_execution_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AdminDashboardOverview = {
  users: {
    total_users: number;
    active_users: number;
    inactive_users: number;
    deleted_users: number;
    admin_users: number;
    super_admin_users: number;
  };
  scheduler: {
    market_snapshot_scheduler_enabled: boolean;
    daily_market_sync_scheduler_enabled: boolean;
  };
  data_health: {
    latest_market_sync_at: string | null;
    latest_market_snapshot_at: string | null;
    latest_stock_details_sync_at: string | null;
    failed_jobs_count: number;
    suspicious_prices_count: number;
    partial_prices_count: number;
    active_stocks_without_latest_price: number;
    overall_freshness_label: string;
  };
  email_campaign_health: {
    queued_count: number;
    running_count: number;
    failed_count: number;
    last_sent_at: string | null;
  };
  recent_job_executions: SystemJobExecution[];
};
