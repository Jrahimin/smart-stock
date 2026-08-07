"use client";

import {
  ArrowLeft,
  AtSign,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  History,
  KeyRound,
  Languages,
  Mail,
  MapPin,
  Monitor,
  Pencil,
  ShieldCheck,
  Smartphone,
  StickyNote,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { WorkspaceModal } from "@/components/ui/workspace-modal";
import { getAdminUserDetailsCopy } from "@/features/admin/admin-user-details-language";
import { AdminEmptyState } from "@/features/admin/components/admin-data-table";
import { AdminStatusBadge, formatStatusLabel } from "@/features/admin/components/admin-status-badge";
import { useIsSuperAdmin } from "@/features/auth/components/admin-route";
import type { AdminUserDetails, AdminUserSession, UserRole } from "@/features/admin/types/admin-types";
import { formatAdminDateTime } from "@/features/admin/utils/format-admin-datetime";
import { formatRelativeTime } from "@/features/admin/utils/format-relative-time";
import { parseAdminUserAgent } from "@/features/admin/utils/parse-admin-user-agent";
import {
  financialTone,
  formatPortfolioMoney,
  formatPortfolioQuantity,
  formatSignedPercent,
} from "@/features/portfolio/view-models/portfolio-view-model";
import {
  fetchAdminUserDetails,
  fetchAdminUserPortfolio,
  fetchAdminUserSessions,
  updateAdminUserActive,
  updateAdminUserRole,
} from "@/lib/api/admin-api";
import type { BackendPortfolioWorkspaceDto } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";

type DetailsTab = "profile" | "portfolio" | "sessions";

const SESSION_PAGE_SIZE = 25;

export function AdminUserDetailsView({
  userId,
  locale,
}: {
  userId: string;
  locale: AppLocale;
}) {
  const copy = getAdminUserDetailsCopy(locale);
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const [activeTab, setActiveTab] = useState<DetailsTab>("profile");
  const [sessionOffset, setSessionOffset] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState<UserRole>("USER");
  const [editActive, setEditActive] = useState(true);

  const detailsQuery = useQuery({
    queryKey: ["admin-user-details", userId],
    queryFn: () => fetchAdminUserDetails(userId),
  });

  const portfolioQuery = useQuery({
    queryKey: ["admin-user-portfolio", userId, "DSE"],
    queryFn: () => fetchAdminUserPortfolio(userId, "DSE"),
    enabled: activeTab === "portfolio",
  });

  const sessionsQuery = useQuery({
    queryKey: ["admin-user-sessions", userId, sessionOffset, SESSION_PAGE_SIZE],
    queryFn: () =>
      fetchAdminUserSessions(userId, {
        limit: SESSION_PAGE_SIZE,
        offset: sessionOffset,
      }),
    enabled: activeTab === "sessions",
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const current = detailsQuery.data;
      if (!current) return;
      if (current.is_active !== editActive) {
        await updateAdminUserActive(userId, editActive);
      }
      if (isSuperAdmin && current.role !== editRole) {
        await updateAdminUserRole(userId, editRole);
      }
    },
    onSuccess: async () => {
      setEditOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-user-details", userId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
      ]);
    },
  });

  const details = detailsQuery.data;
  const openEdit = () => {
    if (!details) return;
    setEditRole(details.role);
    setEditActive(details.is_active);
    editMutation.reset();
    setEditOpen(true);
  };

  if (detailsQuery.isLoading) {
    return <AdminUserDetailsSkeleton />;
  }

  if (!details || detailsQuery.isError) {
    return (
      <div className="admin-workspace">
        <Link className="admin-details-back-link" href="/admin/users">
          <ArrowLeft size={16} />
          {copy.backToUsers}
        </Link>
        <AdminEmptyState description={copy.loadError} title={copy.userDetails} />
      </div>
    );
  }

  const status = details.deleted_at
    ? copy.deleted
    : details.is_active
      ? copy.active
      : copy.inactive;

  return (
    <div className="admin-user-details admin-workspace">
      <header className="admin-details-heading">
        <div>
          <nav aria-label="Breadcrumb" className="admin-details-breadcrumb">
            <Link href="/admin/users">{copy.users}</Link>
            <span>/</span>
            <span>{copy.userDetails}</span>
          </nav>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="admin-details-heading-actions">
          <Link className="admin-btn" href="/admin/users">
            <ArrowLeft size={16} />
            {copy.backToUsers}
          </Link>
          {!details.deleted_at ? (
            <button className="admin-btn admin-btn-primary" onClick={openEdit} type="button">
              <Pencil size={15} />
              {copy.editUser}
            </button>
          ) : null}
        </div>
      </header>

      <UserIdentityBanner copy={copy} details={details} status={status} />

      <div className="admin-details-tabs" role="tablist">
        <DetailsTabButton
          active={activeTab === "profile"}
          icon={UserRound}
          label={copy.profile}
          onClick={() => setActiveTab("profile")}
        />
        <DetailsTabButton
          active={activeTab === "portfolio"}
          icon={BriefcaseBusiness}
          label={copy.portfolio}
          onClick={() => setActiveTab("portfolio")}
        />
        <DetailsTabButton
          active={activeTab === "sessions"}
          icon={Monitor}
          label={copy.sessions}
          onClick={() => setActiveTab("sessions")}
        />
      </div>

      <div className="admin-details-tab-content">
        {activeTab === "profile" ? <ProfileTab copy={copy} details={details} /> : null}
        {activeTab === "portfolio" ? (
          <PortfolioTab
            copy={copy}
            details={details}
            locale={locale}
            query={portfolioQuery}
          />
        ) : null}
        {activeTab === "sessions" ? (
          <SessionsTab
            copy={copy}
            details={details}
            offset={sessionOffset}
            onOffsetChange={setSessionOffset}
            query={sessionsQuery}
          />
        ) : null}
      </div>

      <WorkspaceModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={copy.editAccount}
      >
        <div className="admin-composer-grid admin-composer-grid-single">
          <label className="admin-composer-field admin-details-active-field">
            <span>{copy.accountActive}</span>
            <button
              aria-pressed={editActive}
              className={editActive ? "admin-toggle admin-toggle-on" : "admin-toggle"}
              onClick={() => setEditActive((current) => !current)}
              type="button"
            >
              <span className="admin-toggle-thumb" />
            </button>
          </label>
          {isSuperAdmin ? (
            <label className="admin-composer-field">
              <span>{copy.role}</span>
              <select
                className="admin-select"
                onChange={(event) => setEditRole(event.target.value as UserRole)}
                value={editRole}
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </label>
          ) : null}
          <button
            className="admin-btn admin-btn-primary"
            disabled={editMutation.isPending}
            onClick={() => editMutation.mutate()}
            type="button"
          >
            {copy.saveChanges}
          </button>
          {editMutation.isError ? <p className="admin-field-error">{copy.loadError}</p> : null}
        </div>
      </WorkspaceModal>
    </div>
  );
}

function UserIdentityBanner({
  details,
  status,
  copy,
}: {
  details: AdminUserDetails;
  status: string;
  copy: ReturnType<typeof getAdminUserDetailsCopy>;
}) {
  const initials = details.display_name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="admin-details-identity-card">
      <div className="admin-details-person">
        {details.profile_pic_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="admin-details-avatar" src={details.profile_pic_url} />
        ) : (
          <span className="admin-details-avatar admin-details-avatar-fallback">{initials}</span>
        )}
        <span
          aria-label={status}
          className={`admin-details-presence ${details.is_active && !details.deleted_at ? "is-active" : ""}`}
        />
        <div>
          <strong>{details.display_name}</strong>
          <span>{details.email}</span>
        </div>
      </div>
      <IdentityMetric icon={ShieldCheck} label={copy.role} value={formatStatusLabel(details.role)} />
      <IdentityMetric icon={CheckCircle2} label={copy.status} value={status} />
      <IdentityMetric
        icon={Mail}
        label={copy.email}
        value={details.email_verified_at ? copy.verified : copy.unverified}
      />
      <IdentityMetric icon={CalendarDays} label={copy.joined} value={formatAdminDateTime(details.created_at)} />
      <IdentityMetric icon={Clock3} label={copy.lastSeen} value={formatRelativeTime(details.last_seen_at)} />
      <IdentityMetric icon={AtSign} label={copy.userId} value={details.id} mono />
    </section>
  );
}

function IdentityMetric({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="admin-details-identity-metric">
      <span>
        <Icon size={14} />
        {label}
      </span>
      <strong className={mono ? "is-mono" : ""} title={value}>{value}</strong>
    </div>
  );
}

function DetailsTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={active ? "admin-details-tab is-active" : "admin-details-tab"}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function ProfileTab({
  details,
  copy,
}: {
  details: AdminUserDetails;
  copy: ReturnType<typeof getAdminUserDetailsCopy>;
}) {
  return (
    <div className="admin-details-profile-grid">
      <DetailsPanel description={copy.accountProfileDescription} title={copy.accountProfile}>
        <div className="admin-details-field-grid">
          <ProfileField icon={Mail} label={copy.email} value={details.email} />
          <ProfileField icon={Smartphone} label={copy.mobile} value={details.mobile_number} />
          <ProfileField icon={UserRound} label={copy.gender} value={formatOptionalLabel(details.gender)} />
          <ProfileField icon={MapPin} label={copy.address} value={details.address} />
          <ProfileField
            icon={Languages}
            label={copy.preferredLanguage}
            value={details.preferred_locale.toUpperCase()}
          />
          <ProfileField icon={CalendarDays} label={copy.createdAt} value={formatAdminDateTime(details.created_at)} />
          <ProfileField icon={Clock3} label={copy.updatedAt} value={formatAdminDateTime(details.updated_at)} />
          <ProfileField icon={Globe2} label={copy.lastSeenIp} value={details.last_seen_ip} />
          <DeviceBreakdownField copy={copy} userAgent={details.last_seen_user_agent} />
        </div>
      </DetailsPanel>

      <DetailsPanel description={copy.authenticationDescription} title={copy.authentication}>
        <div className="admin-details-auth-list">
          <div className="admin-details-auth-row">
            <span className="admin-details-auth-icon"><KeyRound size={17} /></span>
            <div>
              <strong>{copy.passwordLogin}</strong>
              <span>{details.has_password ? copy.available : copy.unavailable}</span>
            </div>
            <AdminStatusBadge
              label={details.has_password ? copy.yes : copy.no}
              tone={details.has_password ? "success" : "neutral"}
            />
          </div>
          {details.identities.length ? details.identities.map((identity) => (
            <div className="admin-details-auth-row" key={`${identity.provider}-${identity.linked_at}`}>
              <span className="admin-details-auth-icon"><ShieldCheck size={17} /></span>
              <div>
                <strong>{providerLabel(identity.provider)}</strong>
                <span>{copy.linked} · {formatAdminDateTime(identity.linked_at)}</span>
              </div>
              <AdminStatusBadge label={copy.linked} tone="success" />
            </div>
          )) : (
            <AdminEmptyState title={copy.noLinkedProviders} />
          )}
        </div>
      </DetailsPanel>
    </div>
  );
}

function DeviceBreakdownField({
  copy,
  userAgent,
}: {
  copy: ReturnType<typeof getAdminUserDetailsCopy>;
  userAgent: string | null;
}) {
  const parsed = useMemo(() => parseAdminUserAgent(userAgent), [userAgent]);

  return (
    <div className="admin-details-profile-field admin-details-device-field is-wide">
      <span><Monitor size={14} />{copy.lastSeenDevice}</span>
      {parsed ? (
        <div className="admin-details-device-content">
          <div className="admin-details-device-chips">
            <span><strong>{copy.deviceType}</strong>{parsed.deviceType ?? copy.unknown}</span>
            <span><strong>{copy.operatingSystem}</strong>{parsed.operatingSystem ?? copy.unknown}</span>
            <span><strong>{copy.browser}</strong>{parsed.browser ?? copy.unknown}</span>
          </div>
          <details className="admin-details-device-raw">
            <summary>{copy.rawUserAgent}</summary>
            <code>{parsed.raw}</code>
          </details>
        </div>
      ) : (
        <strong>—</strong>
      )}
    </div>
  );
}

function PortfolioTab({
  details,
  locale,
  copy,
  query,
}: {
  details: AdminUserDetails;
  locale: AppLocale;
  copy: ReturnType<typeof getAdminUserDetailsCopy>;
  query: {
    data?: BackendPortfolioWorkspaceDto;
    isLoading: boolean;
    isError: boolean;
  };
}) {
  if (query.isLoading) return <AdminUserDetailsContentSkeleton />;
  if (query.isError || !query.data) {
    return <AdminEmptyState description={copy.portfolioError} title={copy.portfolio} />;
  }

  const workspace = query.data;
  const { portfolio_summary: summary } = details;
  if (!summary.has_watchlist) {
    return (
      <DetailsPanel title={copy.portfolio}>
        <AdminEmptyState description={copy.noPortfolioDescription} title={copy.noPortfolio} />
      </DetailsPanel>
    );
  }

  const incompleteCount = workspace.holdings.filter(
    (holding) => holding.quantity == null || holding.average_buy_price == null,
  ).length;
  const reviewCount = workspace.holdings.filter((holding) => holding.requires_attention).length;
  const watchOnlyCount = Math.max(0, workspace.meta.total_watchlisted - workspace.meta.holding_count);

  return (
    <div className="admin-details-portfolio-layout">
      <div className="admin-details-portfolio-main">
        <section className="admin-details-portfolio-summary">
          <div className="admin-details-section-heading">
            <h2>{copy.portfolioSummary}</h2>
          </div>
          <div className="admin-details-summary-metrics">
            <SummaryMetric
              label={copy.invested}
              muted={!workspace.pulse.invested_amount_is_complete}
              value={formatPortfolioMoney(workspace.pulse.known_invested_amount, locale)}
            />
            <SummaryMetric
              label={copy.currentValue}
              muted={!workspace.pulse.current_value_is_complete}
              value={formatPortfolioMoney(workspace.pulse.known_current_value, locale)}
            />
            <SummaryMetric
              label={copy.unrealized}
              tone={financialTone(workspace.pulse.known_unrealized_gain_amount)}
              value={`${formatPortfolioMoney(workspace.pulse.known_unrealized_gain_amount, locale)} · ${formatSignedPercent(workspace.pulse.known_unrealized_gain_percent)}`}
            />
            <SummaryMetric label={copy.holdings} value={String(workspace.meta.holding_count)} />
            <SummaryMetric label={copy.watchlist} value={String(workspace.meta.total_watchlisted)} />
            <SummaryMetric
              label={copy.portfolioEmail}
              tone={details.portfolio_daily_summary_email_enabled ? "positive" : "neutral"}
              value={details.portfolio_daily_summary_email_enabled ? copy.enabled : copy.disabled}
            />
          </div>
        </section>

        {!summary.has_holdings ? (
          <DetailsPanel title={copy.portfolio}>
            <AdminEmptyState description={copy.watchlistOnlyDescription} title={copy.watchlistOnly} />
          </DetailsPanel>
        ) : (
          <section className="admin-details-holdings-card">
            <div className="admin-details-section-heading">
              <h2>{copy.holdingsTitle(workspace.holdings.length)}</h2>
            </div>
            <div className="admin-details-holdings-scroll">
              <table className="admin-details-holdings-table">
                <thead>
                  <tr>
                    <th>{copy.symbol}</th>
                    <th>{copy.quantity}</th>
                    <th>{copy.averageBuy}</th>
                    <th>{copy.currentPrice}</th>
                    <th>{copy.profitLoss}</th>
                    <th>{copy.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.holdings.map((holding) => (
                    <tr key={holding.watchlist_item_id}>
                      <td>
                        <Link href={`/stocks/${holding.exchange}/${holding.symbol}`}>
                          <strong>{holding.symbol}</strong>
                          <span>{holding.name}</span>
                        </Link>
                      </td>
                      <td>{formatPortfolioQuantity(holding.quantity)}</td>
                      <td>{formatPortfolioMoney(holding.average_buy_price, locale)}</td>
                      <td>{formatPortfolioMoney(holding.current_price, locale)}</td>
                      <td className={`is-${financialTone(holding.unrealized_gain_amount)}`}>
                        <strong>{formatPortfolioMoney(holding.unrealized_gain_amount, locale)}</strong>
                        <span>{formatSignedPercent(holding.unrealized_gain_percent)}</span>
                      </td>
                      <td><DecisionBadge action={holding.action} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <aside className="admin-details-portfolio-sidebar">
        <DetailsPanel title={copy.preferences}>
          <PreferenceRow label={copy.watchlist} value={String(workspace.meta.total_watchlisted)} />
          <PreferenceRow label={copy.holdings} value={String(workspace.meta.holding_count)} />
          <PreferenceRow label={copy.notesPresent} value={String(summary.notes_count)} />
          <PreferenceRow
            label={copy.portfolioEmail}
            value={details.portfolio_daily_summary_email_enabled ? copy.enabled : copy.disabled}
          />
          <PreferenceRow label={copy.preferredLanguage} value={details.preferred_locale.toUpperCase()} />
          <PreferenceRow label={copy.portfolioUpdated} value={formatAdminDateTime(summary.last_updated_at)} />
          <PreferenceRow label={copy.marketData} value={formatStatusLabel(workspace.meta.data_state)} />
        </DetailsPanel>

        <DetailsPanel title={copy.quickInsights}>
          <ul className="admin-details-insight-list">
            <Insight tone="success" text={copy.portfolioCurrent} />
            {watchOnlyCount > 0 ? <Insight text={`${watchOnlyCount} ${copy.watchlistOnly.toLowerCase()}`} /> : null}
            {incompleteCount > 0 ? <Insight tone="warning" text={copy.incompleteHolding(incompleteCount)} /> : null}
            {reviewCount > 0 ? <Insight tone="danger" text={copy.requiresReview(reviewCount)} /> : null}
            <Insight
              tone={details.portfolio_daily_summary_email_enabled ? "success" : "neutral"}
              text={details.portfolio_daily_summary_email_enabled
                ? copy.emailDigestEnabled
                : copy.emailDigestDisabled}
            />
          </ul>
        </DetailsPanel>
      </aside>
    </div>
  );
}

function SessionsTab({
  details,
  copy,
  offset,
  onOffsetChange,
  query,
}: {
  details: AdminUserDetails;
  copy: ReturnType<typeof getAdminUserDetailsCopy>;
  offset: number;
  onOffsetChange: (offset: number) => void;
  query: {
    data?: AdminUserSession[];
    isLoading: boolean;
    isError: boolean;
  };
}) {
  const rows = query.data ?? [];
  const summary = details.session_summary;
  const canNext = offset + SESSION_PAGE_SIZE < summary.total_count;

  return (
    <div className="admin-details-sessions-layout">
      <section className="admin-details-session-summary">
        <SummaryMetric label={copy.total} value={String(summary.total_count)} />
        <SummaryMetric label={copy.successful} tone="positive" value={String(summary.successful_count)} />
        <SummaryMetric label={copy.failed} tone="negative" value={String(summary.failed_count)} />
        <SummaryMetric label={copy.revoked} value={String(summary.revoked_count)} />
        <SummaryMetric label={copy.loggedOut} value={String(summary.logged_out_count)} />
      </section>

      <DetailsPanel description={copy.sessionDescription} title={copy.recentSessions}>
        {query.isLoading ? <AdminUserDetailsContentSkeleton /> : null}
        {query.isError ? <AdminEmptyState description={copy.sessionsError} title={copy.sessions} /> : null}
        {!query.isLoading && !query.isError && !rows.length ? (
          <AdminEmptyState description={copy.noSessionsDescription} title={copy.noSessions} />
        ) : null}
        {rows.length ? (
          <div className="admin-details-session-list">
            {rows.map((session) => <SessionRow copy={copy} key={session.id} session={session} />)}
          </div>
        ) : null}
        {summary.total_count > SESSION_PAGE_SIZE ? (
          <div className="admin-details-pagination">
            <span>{offset + 1}–{Math.min(offset + SESSION_PAGE_SIZE, summary.total_count)} / {summary.total_count}</span>
            <div>
              <button
                className="admin-btn"
                disabled={offset === 0}
                onClick={() => onOffsetChange(Math.max(0, offset - SESSION_PAGE_SIZE))}
                type="button"
              >
                {copy.previous}
              </button>
              <button
                className="admin-btn"
                disabled={!canNext}
                onClick={() => onOffsetChange(offset + SESSION_PAGE_SIZE)}
                type="button"
              >
                {copy.next}
              </button>
            </div>
          </div>
        ) : null}
      </DetailsPanel>
    </div>
  );
}

function SessionRow({
  session,
  copy,
}: {
  session: AdminUserSession;
  copy: ReturnType<typeof getAdminUserDetailsCopy>;
}) {
  const state = !session.is_successful
    ? copy.failedLogin
    : session.revoked_at
      ? copy.revoked
      : session.logout_at
        ? copy.loggedOut
        : copy.recordedLogin;
  const tone = !session.is_successful
    ? "failed"
    : session.revoked_at
      ? "warning"
      : "success";

  return (
    <article className="admin-details-session-row">
      <div className="admin-details-session-icon">
        {session.is_successful ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </div>
      <div className="admin-details-session-primary">
        <strong>{formatAdminDateTime(session.login_at)}</strong>
        <span>
          {[session.browser, session.operating_system, session.device_type].filter(Boolean).join(" · ") || copy.unknown}
        </span>
        {!session.is_successful && session.failure_reason ? <small>{session.failure_reason}</small> : null}
      </div>
      <div className="admin-details-session-meta">
        <span>{session.ip_address ?? copy.unknown}</span>
        <AdminStatusBadge label={state} tone={tone} />
      </div>
    </article>
  );
}

function DetailsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-details-panel">
      <div className="admin-details-section-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "admin-details-profile-field is-wide" : "admin-details-profile-field"}>
      <span><Icon size={14} />{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "neutral",
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  muted?: boolean;
}) {
  return (
    <div className={`admin-details-summary-metric is-${tone}${muted ? " is-incomplete" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-details-preference-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Insight({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? XCircle : tone === "warning" ? StickyNote : History;
  return (
    <li className={`is-${tone}`}>
      <Icon size={15} />
      <span>{text}</span>
    </li>
  );
}

function DecisionBadge({ action }: { action: string }) {
  const tone = action === "BUY"
    ? "success"
    : action === "SELL" || action === "REDUCE"
      ? "failed"
      : action === "HOLD"
        ? "running"
        : "neutral";
  return <AdminStatusBadge label={formatStatusLabel(action)} tone={tone} />;
}

function providerLabel(provider: string) {
  if (provider.toLowerCase() === "google") return "Google OAuth";
  if (provider.toLowerCase() === "local") return "Local account";
  if (provider.toLowerCase() === "facebook") return "Facebook OAuth";
  return formatStatusLabel(provider);
}

function formatOptionalLabel(value: string | null) {
  return value ? formatStatusLabel(value) : null;
}

function AdminUserDetailsSkeleton() {
  return (
    <div className="admin-user-details admin-workspace" aria-label="Loading user details">
      <div className="admin-details-skeleton is-heading" />
      <div className="admin-details-skeleton is-banner" />
      <div className="admin-details-skeleton is-tabs" />
      <AdminUserDetailsContentSkeleton />
    </div>
  );
}

function AdminUserDetailsContentSkeleton() {
  return (
    <div className="admin-details-content-skeleton" aria-label="Loading">
      <div className="admin-details-skeleton is-card" />
      <div className="admin-details-skeleton is-card" />
    </div>
  );
}
