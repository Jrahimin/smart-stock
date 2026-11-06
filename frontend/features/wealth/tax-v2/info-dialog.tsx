"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import css from "./tax.module.css";

/** Native modal provides keyboard containment and returns focus to its slim launcher. */
export function InfoDialog({ title, subtitle, icon = "✦", children, open: controlled, onOpenChange, anchor, compact = false }: {
  title: string; subtitle?: string; icon?: string; children: ReactNode;
  open?: boolean; onOpenChange?: (open: boolean) => void; anchor?: string;
  compact?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled ?? localOpen;
  const change = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    if (!open || !dialog.current) return;
    const el = dialog.current, previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof el.showModal === "function") el.showModal(); else el.setAttribute("open", "");
    el.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = previous; trigger.current?.focus(); };
  }, [open]);
  return <>
    <button type="button" ref={trigger} className={css.readingButton + (compact ? " " + css.compactReadingButton : "")} aria-haspopup="dialog" aria-expanded={open} data-guide={anchor} onClick={() => change(true)}>
      <span className={css.readingIcon} aria-hidden="true">{icon}</span><span><strong>{title}</strong>{subtitle && !compact && <small>{subtitle}</small>}</span><span aria-hidden="true" className={css.readingArrow}>↗</span>
    </button>
    {open && typeof document !== "undefined" && createPortal(<dialog ref={dialog} className={css.infoDialog} aria-labelledby={id} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); change(false); } }} onCancel={(event) => { event.preventDefault(); change(false); }} onClick={(event) => { if (event.target === event.currentTarget) change(false); }}>
      <div className={css.dialogHeader}><div className={css.headingRow}><span className={css.readingIcon} aria-hidden="true">{icon}</span><h2 id={id}>{title}</h2></div><button type="button" autoFocus className={css.dialogClose} aria-label="Close / বন্ধ করুন" onClick={() => change(false)}>×</button></div>
      <div className={css.dialogBody}>{children}</div>
    </dialog>, document.body)}
  </>;
}
