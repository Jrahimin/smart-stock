"use client";

import { ChevronDown, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { AdminJobAction } from "@/features/admin/lib/admin-operations-view-model";
import type { SystemJobType } from "@/features/admin/types/admin-types";

type AdminJobActionsProps = {
  actions: AdminJobAction[];
  disabled?: boolean;
  onTrigger: (jobType: SystemJobType) => void;
};

export function AdminJobActionsMenu({ actions, disabled, onTrigger }: AdminJobActionsProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="admin-job-actions" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className="admin-btn admin-btn-primary"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Play size={14} />
        Run job
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="admin-job-actions-menu" id={menuId} role="menu">
          {actions.map((action) => (
            <button
              className="admin-job-actions-item"
              disabled={disabled}
              key={action.jobType}
              onClick={() => {
                setOpen(false);
                onTrigger(action.jobType);
              }}
              role="menuitem"
              title={action.description}
              type="button"
            >
              <span className="admin-job-actions-item-label">{action.label}</span>
              <span className="admin-job-actions-item-description">{action.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminJobActionsToolbar({
  actions,
  disabled,
  onTrigger,
}: AdminJobActionsProps) {
  return (
    <div className="admin-job-actions-toolbar">
      {actions.map((action) => (
        <button
          className="admin-btn"
          disabled={disabled}
          key={action.jobType}
          onClick={() => onTrigger(action.jobType)}
          title={action.description}
          type="button"
        >
          <Play size={14} />
          {action.label}
        </button>
      ))}
    </div>
  );
}
