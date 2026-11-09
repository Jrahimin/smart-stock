"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Native modal focus containment with an anchored desktop surface and mobile sheet. */
export function DashboardInfoPanel({ label, title = label, children, locale = "en" }: {
  label: string; title?: string; children: ReactNode; locale?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const dialog = panel.current;
    const place = () => {
      if (window.innerWidth <= 640) { dialog.style.removeProperty("left"); dialog.style.removeProperty("top"); return; }
      const anchor = trigger.current!.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      const height = Math.min(dialog.scrollHeight, window.innerHeight - 32);
      const below = window.innerHeight - anchor.bottom - 24;
      // Prefer below the trigger. On short screens, place beside it so the index remains visible.
      const side = below < height && anchor.left >= width + 24;
      const left = side ? anchor.left - width - 12 : Math.min(anchor.left, window.innerWidth - width - 16);
      const top = side ? Math.max(16, Math.min(anchor.top, window.innerHeight - height - 16)) : anchor.bottom + 8;
      dialog.style.left = `${Math.max(16, left)}px`;
      dialog.style.top = `${Math.max(16, Math.min(top, window.innerHeight - height - 16))}px`;
    };
    dialog.showModal(); place();
    const observer = new ResizeObserver(place); observer.observe(dialog);
    window.addEventListener("resize", place);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); if (dialog.open) dialog.close(); window.requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); };
  }, [open]);
  const close = () => { setOpen(false); };
  return <>
    <button ref={trigger} className="sw-info-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)}>{label}</button>
    {open ? createPortal(<dialog ref={panel} lang={locale} id={id} className="sw-info-panel" aria-labelledby={id + "-title"} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
      const rect = panel.current!.getBoundingClientRect();
      if (event.target === panel.current && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
    }}>
      <header><h2 id={id + "-title"}>{title}</h2><button type="button" onClick={close} aria-label={locale === "bn" ? "বন্ধ করুন" : "Close"}>×</button></header>
      <div className="sw-info-content">{children}</div>
    </dialog>, document.body) : null}
  </>;
}
