"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

type AdminDrawerProps = {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function AdminDrawer({ title, subtitle, isOpen, onClose, children, footer }: AdminDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="admin-drawer-root">
      <button aria-label="Close panel" className="admin-drawer-backdrop" onClick={onClose} type="button" />
      <aside aria-labelledby="admin-drawer-title" className="admin-drawer-panel" role="dialog">
        <header className="admin-drawer-header">
          <div>
            <h2 id="admin-drawer-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button aria-label="Close" className="admin-drawer-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>
        <div className="admin-drawer-body">{children}</div>
        {footer ? <footer className="admin-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
