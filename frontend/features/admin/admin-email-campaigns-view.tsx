"use client";

import { AlertTriangle, CheckCircle2, Clock3, Mail, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { AdminKpiCard, AdminKpiGrid } from "@/features/admin/components/admin-kpi-card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminKpiSkeleton, AdminTableSkeleton } from "@/features/admin/components/admin-skeleton";
import {
  AdminStatusBadge,
  campaignStatusTone,
  formatStatusLabel,
} from "@/features/admin/components/admin-status-badge";
import { useDebouncedValue } from "@/features/wealth/hooks/use-debounced-value";
import type { EmailCampaign, UserRole } from "@/features/admin/types/admin-types";
import {
  createEmailCampaign,
  fetchEmailCampaignAudience,
  fetchEmailCampaigns,
  queueEmailCampaign,
} from "@/lib/api/admin-api";

export function AdminEmailCampaignsView() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sendToAllMatching, setSendToAllMatching] = useState(true);
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [subscribedOnly, setSubscribedOnly] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState("");
  const debouncedAudienceSearch = useDebouncedValue(audienceSearch, 400);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ["admin-email-campaigns"],
    queryFn: () => fetchEmailCampaigns({ limit: 50 }),
  });
  const { data: campaigns, isLoading: campaignsLoading, dataUpdatedAt } = campaignsQuery;

  const audienceQuery = useQuery({
    queryKey: ["admin-email-audience", roleFilter, verifiedOnly, subscribedOnly, debouncedAudienceSearch],
    queryFn: () =>
      fetchEmailCampaignAudience({
        role: roleFilter === "ALL" ? undefined : roleFilter,
        verified_only: verifiedOnly,
        subscribed_only: subscribedOnly,
        search: debouncedAudienceSearch || undefined,
        limit: 200,
      }),
  });

  const metrics = useMemo(() => computeCampaignMetrics(campaigns ?? []), [campaigns]);
  const selectedCampaign = campaigns?.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const audienceUsers = audienceQuery.data ?? [];
  const matchingCount = audienceUsers.length;
  const audienceCount = sendToAllMatching
    ? `${matchingCount} matching`
    : selectedUserIds.length || matchingCount;

  const exitSendAllMode = () => {
    setSendToAllMatching(false);
    setSelectedUserIds([]);
  };

  const resetAudienceFilters = () => {
    setRoleFilter("ALL");
    setVerifiedOnly(false);
    setSubscribedOnly(false);
    setAudienceSearch("");
    setSelectedUserIds([]);
  };

  const handleSendToAllChange = (checked: boolean) => {
    setSendToAllMatching(checked);
    if (checked) {
      resetAudienceFilters();
    }
  };

  const handleRoleFilterChange = (value: UserRole | "ALL") => {
    setSendToAllMatching(false);
    setRoleFilter(value);
  };

  const handleVerifiedOnlyChange = (checked: boolean) => {
    setSendToAllMatching(false);
    setVerifiedOnly(checked);
  };

  const handleSubscribedOnlyChange = (checked: boolean) => {
    setSendToAllMatching(false);
    setSubscribedOnly(checked);
  };

  const handleAudienceSearchChange = (value: string) => {
    setSendToAllMatching(false);
    setAudienceSearch(value);
  };

  useEffect(() => {
    if (sendToAllMatching) {
      setSelectedUserIds([]);
    }
  }, [sendToAllMatching]);

  useEffect(() => {
    setSelectedUserIds([]);
  }, [roleFilter, verifiedOnly, subscribedOnly, debouncedAudienceSearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const filter_criteria_json = {
        role: roleFilter === "ALL" ? undefined : roleFilter,
        verified_only: verifiedOnly,
        subscribed_only: subscribedOnly,
        search: debouncedAudienceSearch || undefined,
      };

      const payload =
        sendToAllMatching || selectedUserIds.length === 0
          ? {
              subject,
              body_text: bodyText,
              body_html: bodyHtml.trim() || undefined,
              recipient_scope: "FILTERED_USERS" as const,
              filter_criteria_json,
            }
          : {
              subject,
              body_text: bodyText,
              body_html: bodyHtml.trim() || undefined,
              recipient_scope: "SELECTED_USERS" as const,
              selected_user_ids: selectedUserIds,
              filter_criteria_json,
            };

      const campaign = await createEmailCampaign(payload);
      return queueEmailCampaign(campaign.id);
    },
    onSuccess: () => {
      setSubject("");
      setBodyText("");
      setBodyHtml("");
      setSelectedUserIds([]);
      void queryClient.invalidateQueries({ queryKey: ["admin-email-campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });

  const toggleUser = (userId: string) => {
    exitSendAllMode();
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const selectAllVisible = () => {
    exitSendAllMode();
    setSelectedUserIds(audienceUsers.map((user) => user.id));
  };

  return (
    <div className="admin-workspace workspace-page-stack">
      <AdminPageHeader
        description="Compose campaigns, queue recipients, and let the background processor send them."
        lastUpdated={campaigns ? new Date(dataUpdatedAt).toISOString() : null}
        title="Email Campaigns"
      />

      {campaignsLoading ? <AdminKpiSkeleton count={4} /> : null}

      {campaigns ? (
        <AdminKpiGrid>
          <AdminKpiCard helper="Waiting to send" icon={Clock3} label="Queued" tone="warning" value={metrics.queued} />
          <AdminKpiCard helper="Currently processing" icon={Mail} label="Running" tone="info" value={metrics.running} />
          <AdminKpiCard helper="Delivered successfully" icon={CheckCircle2} label="Completed" tone="positive" value={metrics.completed} />
          <AdminKpiCard helper="Needs review" icon={AlertTriangle} label="Failed" tone="negative" value={metrics.failed} />
        </AdminKpiGrid>
      ) : null}

      <AdminSection
        actions={
          <button
            className="admin-btn admin-btn-primary"
            disabled={!subject || !bodyText || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            <Send size={16} />
            Queue Campaign ({audienceCount})
          </button>
        }
        description="Template content first, then choose who receives the campaign."
        title="Campaign Composer"
      >
        <div className="admin-composer-grid admin-composer-grid-single">
          <label className="admin-composer-field">
            <span>Subject</span>
            <input onChange={(event) => setSubject(event.target.value)} value={subject} />
          </label>
          <label className="admin-composer-field">
            <span>Rich Text Body (HTML)</span>
            <textarea onChange={(event) => setBodyHtml(event.target.value)} placeholder="<p>Hello traders…</p>" rows={5} value={bodyHtml} />
          </label>
          <label className="admin-composer-field">
            <span>Plain Text Fallback</span>
            <textarea onChange={(event) => setBodyText(event.target.value)} rows={5} value={bodyText} />
          </label>
        </div>

        <div className="admin-audience-panel">
          <h3 className="admin-audience-title">Audience</h3>

          <div className="admin-toolbar admin-audience-toolbar">
            <label className="admin-checkbox-field admin-checkbox-field-prominent">
              <input
                checked={sendToAllMatching}
                onChange={(event) => handleSendToAllChange(event.target.checked)}
                type="checkbox"
              />
              <span>Send to all users matching filters</span>
            </label>
            <select
              className="admin-select"
              onChange={(event) => handleRoleFilterChange(event.target.value as UserRole | "ALL")}
              value={roleFilter}
            >
              <option value="ALL">All roles</option>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
            <label className="admin-checkbox-field">
              <input
                checked={verifiedOnly}
                onChange={(event) => handleVerifiedOnlyChange(event.target.checked)}
                type="checkbox"
              />
              <span>Verified only</span>
            </label>
            <label className="admin-checkbox-field">
              <input
                checked={subscribedOnly}
                onChange={(event) => handleSubscribedOnlyChange(event.target.checked)}
                type="checkbox"
              />
              <span>Subscribed only</span>
            </label>
            <input
              className="admin-search-input admin-search-input-inline admin-audience-search"
              onChange={(event) => handleAudienceSearchChange(event.target.value)}
              placeholder="Filter by name or email…"
              type="search"
              value={audienceSearch}
            />
          </div>

          {sendToAllMatching ? (
            <p className="admin-audience-hint">
              {audienceQuery.isLoading
                ? "Counting users matching the current filters…"
                : `${matchingCount} active user${matchingCount === 1 ? "" : "s"} will be snapshotted when the campaign is queued.`}
            </p>
          ) : (
            <div className="admin-audience-list-shell">
              <div className="admin-audience-list-actions">
                <button className="admin-btn" onClick={selectAllVisible} type="button">
                  Select all visible ({audienceUsers.length})
                </button>
                <span className="admin-config-key">{selectedUserIds.length} selected</span>
              </div>
              {audienceQuery.isLoading ? <AdminTableSkeleton rows={4} /> : null}
              {audienceUsers.length ? (
                <ul className="admin-audience-list">
                  {audienceUsers.map((user) => (
                    <li key={user.id}>
                      <label className="admin-audience-list-item">
                        <input
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => toggleUser(user.id)}
                          type="checkbox"
                        />
                        <span className="admin-user-copy">
                          <strong>{user.display_name}</strong>
                          <span>
                            {user.email} · {formatStatusLabel(user.role)}
                            {user.email_verified_at ? " · verified" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : audienceQuery.isLoading ? null : (
                <AdminEmptyState description="Adjust filters to find recipients." title="No users match filters" />
              )}
            </div>
          )}
        </div>
      </AdminSection>

      <AdminSection description="Delivery outcomes and campaign lifecycle history." title="Campaign History">
        {campaignsLoading ? <AdminTableSkeleton rows={5} /> : null}
        {campaigns?.length ? (
          <AdminDataTable className="admin-data-table-campaigns">
            <div className="admin-data-table-head">
              <AdminDataTableCell>Subject</AdminDataTableCell>
              <AdminDataTableCell>Audience</AdminDataTableCell>
              <AdminDataTableCell>Recipients</AdminDataTableCell>
              <AdminDataTableCell>Sent</AdminDataTableCell>
              <AdminDataTableCell>Failed</AdminDataTableCell>
              <AdminDataTableCell>Status</AdminDataTableCell>
              <AdminDataTableCell>Created At</AdminDataTableCell>
            </div>
            <AdminDataTableBody>
              {campaigns.map((campaign) => (
                <AdminDataTableRow key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)}>
                  <AdminDataTableCell>
                    <strong>{campaign.subject}</strong>
                  </AdminDataTableCell>
                  <AdminDataTableCell>{formatStatusLabel(campaign.recipient_scope)}</AdminDataTableCell>
                  <AdminDataTableCell>{campaign.total_recipients}</AdminDataTableCell>
                  <AdminDataTableCell>{campaign.sent_count}</AdminDataTableCell>
                  <AdminDataTableCell>{campaign.failed_count}</AdminDataTableCell>
                  <AdminDataTableCell>
                    <AdminStatusBadge label={formatStatusLabel(campaign.status)} tone={campaignStatusTone(campaign.status)} />
                  </AdminDataTableCell>
                  <AdminDataTableCell>{new Date(campaign.created_at).toLocaleString()}</AdminDataTableCell>
                </AdminDataTableRow>
              ))}
            </AdminDataTableBody>
          </AdminDataTable>
        ) : campaignsLoading ? null : (
          <AdminEmptyState description="Create your first campaign using the composer above." title="No campaigns yet" />
        )}
      </AdminSection>

      <AdminDrawer
        isOpen={Boolean(selectedCampaign)}
        onClose={() => setSelectedCampaignId(null)}
        subtitle={selectedCampaign ? formatStatusLabel(selectedCampaign.recipient_scope) : undefined}
        title={selectedCampaign?.subject ?? "Campaign details"}
      >
        {selectedCampaign ? <CampaignDetails campaign={selectedCampaign} /> : null}
      </AdminDrawer>
    </div>
  );
}

function CampaignDetails({ campaign }: { campaign: EmailCampaign }) {
  return (
    <div className="admin-detail-grid">
      <DetailItem label="Status" value={formatStatusLabel(campaign.status)} />
      <DetailItem label="Recipients" value={String(campaign.total_recipients)} />
      <DetailItem label="Sent" value={String(campaign.sent_count)} />
      <DetailItem label="Failed" value={String(campaign.failed_count)} />
      <DetailItem label="Queued At" value={campaign.queued_at ? new Date(campaign.queued_at).toLocaleString() : "—"} />
      <DetailItem label="Completed At" value={campaign.completed_at ? new Date(campaign.completed_at).toLocaleString() : "—"} />
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

function computeCampaignMetrics(campaigns: EmailCampaign[]) {
  return {
    queued: campaigns.filter((campaign) => campaign.status === "QUEUED").length,
    running: campaigns.filter((campaign) => campaign.status === "RUNNING").length,
    completed: campaigns.filter((campaign) => campaign.status === "SUCCEEDED").length,
    failed: campaigns.filter((campaign) => campaign.status === "FAILED" || campaign.status === "PARTIAL").length,
  };
}
