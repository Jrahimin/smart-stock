"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  description: string;
  lastUpdated?: string | null;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
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
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search…",
  actions,
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
    <header className="admin-page-header">
      <div className="admin-page-header-main">
        <div className="admin-page-header-copy">
          <p className="admin-page-header-eyebrow">Operations</p>
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

          {lastUpdated ? (
            <p className="admin-page-header-updated">
              Updated <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleString()}</time>
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
