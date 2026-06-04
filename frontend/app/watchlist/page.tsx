import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ProtectedRoute } from "@/features/auth/components/protected-route";

export default function WatchlistPage() {
  return (
    <TerminalAppShell>
      <ProtectedRoute>
        <section className="placeholder-panel">
          <p className="eyebrow">Watchlist Intelligence</p>
          <h1>Grouped watchlists and alert-oriented market review</h1>
          <p>
            Reserved for local grouped watchlists, heatmap mode, signal summaries, quick analytics, and future backend
            persistence.
          </p>
        </section>
      </ProtectedRoute>
    </TerminalAppShell>
  );
}
