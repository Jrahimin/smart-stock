"use client";

import { RefreshCw, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { AdminStatusBadge } from "@/features/admin/components/admin-status-badge";
import { formatAdminDateTime } from "@/features/admin/utils/format-admin-datetime";
import { cn } from "@/lib/utils/cn";

type AdminPageHeaderProps = {
  title: string;
  description: string;
  lastUpdated?: string | null;
  statusChip?: {
    label: string;
    tone: "success" | "running" | "queued" | "failed" | "partial" | "draft" | "neutral" | "warning";
  } | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
  className?: string;
};

function useSearchShortcutLabel() {
  const [label, setLabel] = useState("Ctrl K");

  useEffect(() => {
    const isApple = /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);
    setLabel(isApple ? "⌘ K" : "Ctrl K");
  }, []);

  return label;
}

export function AdminPageHeader({
  title,
  description,
  lastUpdated,
  statusChip,
  onRefresh,
  isRefreshing,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search…",
  actions,
  className,
}: AdminPageHeaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shortcutLabel = useSearchShortcutLabel();

  useEffect(() => {
    if (!onSearchChange) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSearchChange]);

  return (
    <header className={cn("admin-page-header", className)}>
      <div className="admin-page-header-main">
        <div className="admin-page-header-copy">
          <div className="admin-page-header-title-row">
            <p className="admin-page-header-eyebrow">Operations</p>
            {statusChip ? (
              <AdminStatusBadge label={statusChip.label} tone={statusChip.tone} />
            ) : null}
          </div>
          <h1>{title}</h1>
          <p className="admin-page-header-description">{description}</p>
        </div>

        <div className="admin-page-header-tools">
          {onSearchChange ? (
            <label className="admin-search" htmlFor={inputId}>
              <Search aria-hidden="true" className="admin-search-icon" size={16} />
              <input
                className="admin-search-input"
                id={inputId}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                ref={inputRef}
                type="search"
                value={searchValue}
              />
              <kbd className="admin-search-kbd">{shortcutLabel}</kbd>
            </label>
          ) : null}

          {actions ? <div className="admin-page-header-actions">{actions}</div> : null}

          {onRefresh ? (
            <button
              aria-label="Refresh"
              className={cn("admin-btn admin-btn-icon", isRefreshing && "admin-btn-loading")}
              disabled={isRefreshing}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw size={14} />
            </button>
          ) : null}

          {lastUpdated ? (
            <p className="admin-page-header-updated">
              Updated{" "}
              <time dateTime={lastUpdated}>{formatAdminDateTime(lastUpdated)}</time>
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
