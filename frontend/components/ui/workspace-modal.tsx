"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

type WorkspaceModalProps = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "large";
};

export function WorkspaceModal({ title, isOpen, onClose, children, size = "default" }: WorkspaceModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="workspace-modal-backdrop workspace-modal-animate-in" onClick={onClose} role="presentation">
      <div
        aria-labelledby={title ? "workspace-modal-title" : undefined}
        aria-modal="true"
        className={`workspace-modal-panel workspace-modal-${size} workspace-modal-panel-animate-in`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {title ? (
          <div className="workspace-modal-header">
            <h3 id="workspace-modal-title">{title}</h3>
            <button aria-label="Close modal" className="workspace-modal-close" onClick={onClose} type="button">
              ×
            </button>
          </div>
        ) : (
          <button aria-label="Close modal" className="workspace-modal-close workspace-modal-close-floating" onClick={onClose} type="button">
            ×
          </button>
        )}
        <div className="workspace-modal-body">{children}</div>
      </div>
    </div>
  );
}
