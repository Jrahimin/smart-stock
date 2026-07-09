import Link from "next/link";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";

export default function StockDetailNotFound() {
  return (
    <TerminalAppShell>
      <section className="workspace-card stock-not-found-card">
        <p className="eyebrow">Stock workspace</p>
        <h1>Stock not found</h1>
        <p>This exchange/symbol combination is not in the active stock master.</p>
        <Link className="pulse-section-link" href="/stocks">
          Browse stocks →
        </Link>
      </section>
    </TerminalAppShell>
  );
}
